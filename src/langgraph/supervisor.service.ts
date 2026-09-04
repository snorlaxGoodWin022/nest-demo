import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//定义 state
const SupervisorState = Annotation.Root({
  messages: MessagesAnnotation.spec.messages, // 对话消息历史（存储所有交互记录）
  nextAgent: Annotation<string>, // 下一个要调用的 Agent 名称 ,supervisor不断写入覆盖
  // 已完成的 Agent 列表（防止重复调用）
  completedAgents: Annotation<string[]>({
    reducer: (prev, cur) => [...prev, ...cur], // 合并多个 Agent 完成记录
    default: () => [],
  }),
});

@Injectable()
export class SupervisorService implements OnModuleInit {
  private graph: any;

  async onModuleInit() {
    // 创建 chatOllama 实例
    const llm = new ChatOllama({
      model: config.ollama.chatModel,
      temperature: config.ollama.temperature,
      baseUrl: config.ollama.host,
      think: false,
      numPredict: 512,
    });

    // supervisor节点：LLM 决定下一步调哪个 agent
    const supervisor = async (state: typeof SupervisorState.State) => {
      // 生成已完成 Agent 列表的提示文本
      const done = state.completedAgents.length
        ? `已完成：${state.completedAgents.join('、')}`
        : '尚未调用任何 Agent';

      // LLM 决策：根据任务和上下文选择下一个 Agent
      const res = await llm.invoke([
        new SystemMessage(`你是任务协调者, 管理好一下专业Agent:
- researcher:收集信息,搜索资料
- analyst:数据库分析,逻辑推理
- writer: 撰写报告,优化表达
规则:
1.根据任务需求按需选择Agent
2.${done}
3.所有必要工作完成后输出 FINISH
4.只输出下一个Agent名称或者FINISH，不要输出其他内容。
可选值:researcher, analyst, writer, FINISH

`),
        ...state.messages, // 传入完整对话历史作为上下文
      ]);

      // 解析并校验 LLM 输出
      const next = (res.content as string).trim();
      const valid = ['researcher', 'analyst', 'writer', 'FINISH'];
      const safeNext = valid.includes(next) ? next : 'FINISH'; // 非法输出默认结束

      return {
        nextAgent: safeNext, // 记录决策结果，供路由使用
        messages: [new AIMessage(`[Supervisor]下一步 -> ${safeNext}`)], // 记录决策到历史
      };
    };

    // 路由函数：根据 nextAgent 决定跳转到哪个节点
    const routeToAgent = (state: typeof SupervisorState.State) => {
      return state.nextAgent === 'FINISH' ? END : state.nextAgent;
    };

    // worker 工厂函数：避免三个 worker 节点重复代码
    const createWorker =
      (name: string, systemPrompt: string) =>
      async (state: typeof SupervisorState.State) => {
        // 取第一条用户消息作为原始任务描述
        const userMsg = state.messages.find((m) => m._getType?.() === 'human');
        // 取最近 4 条消息作为上下文（包含其他 Agent 的输出）
        const context = state.messages
          .slice(-4)
          .map((m) => m.content)
          .join('\n');

        // 调用 LLM 执行具体任务
        const res = await llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `原始任务：${userMsg?.content ?? ''}\n\n当前上下文：\n${context}`,
          ),
        ]);

        return {
          messages: [new AIMessage(`[${name}] ${res.content}`)], // 记录执行结果
          completedAgents: [name], // 标记该 Agent 已完成
        };
      };

    // 构建状态图
    this.graph = new StateGraph(SupervisorState)
      // 添加节点：supervisor（决策者）
      .addNode('supervisor', supervisor)
      // 添加节点：三个专业 Worker
      .addNode(
        'researcher',
        createWorker(
          'researcher',
          '你是研究员，擅长收集整理信息，提供详细调研结果。',
        ),
      )
      .addNode(
        'analyst',
        createWorker('analyst', '你是分析师，擅长数据分析，提供洞察和建议。'),
      )
      .addNode(
        'writer',
        createWorker('writer', '你是写作专家，把信息整理成清晰专业的报告。'),
      )
      // 入口：从 supervisor 开始
      .addEdge(START, 'supervisor')
      // 条件路由：supervisor 根据决策动态跳转
      .addConditionalEdges('supervisor', routeToAgent, {
        researcher: 'researcher', // 跳转到研究员
        analyst: 'analyst', // 跳转到分析师
        writer: 'writer', // 跳转到写作者
        [END]: END, // 结束流程
      })
      // 所有 worker 完成后都回到 supervisor，让它决定下一步（循环机制）
      .addEdge('researcher', 'supervisor')
      .addEdge('analyst', 'supervisor')
      .addEdge('writer', 'supervisor')
      .compile(); // 编译成可执行的工作流
  }

  // 执行入口：用户输入任务
  async run(userInput: string) {
    // 调用工作流，传入用户消息
    const result = await this.graph.invoke(
      {
        messages: [new HumanMessage(userInput)],
      },
      { recursionLimit: 30 }, // 限制循环次数，防止死循环
    );

    // 提取所有 Agent 的执行日志（以 [xxx] 开头的消息）
    const messages = result.messages as AIMessage[];
    const agentLog = messages
      .filter((m) => typeof m.content === 'string' && m.content.startsWith('['))
      .map((m) => m.content as string);

    // 提取最终报告：取最后一个 writer 的输出
    const writerOutputs = agentLog.filter((l) => l.startsWith('[writer]'));
    const finalReport = writerOutputs.length
      ? writerOutputs.at(-1)!.replace('[writer] ', '') // 去掉前缀，只保留内容
      : (agentLog.at(-1) ?? '无输出'); // 没有 writer 则取最后一条日志

    // 返回结果（建议补充 return 语句）
    return {
      agentLog, // 所有 Agent 的执行记录
      completedAgents: result.completedAgents, // 已完成的 Agent 列表
      finalReport, // 最终报告
    };
  }
}
