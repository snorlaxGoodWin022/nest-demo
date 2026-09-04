import { HumanMessage } from '@langchain/core/messages';
import {
  Annotation,
  Command,
  END,
  Send,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//定义主state
const paralleState = Annotation.Root({
  task: Annotation<string>(),
  results: Annotation<{ task: string; result: string }[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  finalReport: Annotation<string>(),
});

//定义子节点state
const SubState = Annotation.Root({
  task: Annotation<string>(),
  results: Annotation<{ task: string; result: string }[]>({
    reducer: (prev, curr) => [...prev, ...curr], // ⚠️ 必须有，才能合并到主状态
    default: () => [],
  }),
});

@Injectable()
export class ParallelService implements OnModuleInit {
  private graph: any;
  async onModuleInit() {
    // 创建 chatOllama 实例
    const llm = new ChatOllama({
      model: config.ollama.chatModel, // Ollama 模型名称
      temperature: config.ollama.temperature, // 生成文本的随机程度
      baseUrl: config.ollama.host, // Ollama 服务器地址
      think: false, // 是否开启思考模式，开启后模型会先返回一个思考中的消息，等生成完成后再返回最终回答
      numPredict: 512, // 生成文本的最大 token 数量，512 是一个比较合理的值，可以根据需要调整
    });
    //splitTask节点
    const splitTask = async (state: typeof paralleState.State) => {
      //根据输入的task,拆分成3个子任务
      const res = await llm.invoke([
        new HumanMessage(
          `把以下任务拆成 3 个独立子任务，每个子任务单独一行，不要编号：\n\n${state.task}`,
        ),
      ]);
      console.log('任务拆分结果:', res.content);
      const subTasks = (res.content as string) // 1. 获取 LLM 返回的文本
        .split('\n') // 2. 按换行符分割成数组
        .map((t) => t.trim()) // 3. 去掉每个元素的首尾空格
        .filter(Boolean) // 4. 过滤掉空字符串（重点！）
        .slice(0, 3); // 5. 只取前 3 个
      subTasks.forEach((t, i) => console.log(`子任务${i + 1}: ${t}`));
      /**
       * goto 接收一个数组，数组里有几个 Send 就创建几个并行实例
       * 每个 Send 把对应的子任务发送到 processSubTask 节点处理
       */
      return new Command({
        // 并行跳转到多个节点，每个节点处理一个子任务
        goto: subTasks.map(
          (task) => new Send('processSubTask', { task }), // 为每个子任务创建一个独立的处理实例
        ),
      });
    };

    //processSubTask节点
    const processSubTask = async (state: typeof SubState.State) => {
      console.log('\n⚡ [processSubTask] 处理子任务：', state.task);
      //根据输入的task,处理子任务
      const res = await llm.invoke([
        new HumanMessage(`处理以下任务：${state.task}`),
      ]);
      console.log('子任务处理结果:', res.content);
      return { results: [{ task: state.task, result: res.content as string }] };
    };

    //mergeResults节点
    const mergeResults = async (state: typeof paralleState.State) => {
      const text = state.results
        .map((r, i) => `子任务${i + 1}: ${r.task}\n结果: ${r.result}`)
        .join('\n\n');
      const res = await llm.invoke([
        new HumanMessage(
          `根据以下子任务结果，生成200字左右的总结报告：\n\n${text}`,
        ),
      ]);
      console.log('总结报告:', res.content);
      return { finalReport: res.content as string };
    };

    //创建图
    this.graph = new StateGraph(paralleState)
      .addNode('splitTask', splitTask, { ends: ['processSubTask'] }) //splitTask节点去processSubTask节点
      .addNode('processSubTask', processSubTask, { ends: ['mergeResults'] })
      .addNode('mergeResults', mergeResults)
      .addEdge(START, 'splitTask')
      .addEdge('processSubTask', 'mergeResults')
      .addEdge('mergeResults', END)
      .compile();
  }

  async paralleChat(task: string) {
    const t0 = Date.now();
    const result = await this.graph.invoke({ task });
    console.log(`paralleChat耗时 cost ${Date.now() - t0}ms`);
    return {
      task,
      subTask: result.results.map((item: any) => item.task),
      finalReport: result.finalReport,
      totalTime: `${Date.now() - t0}ms`,
    };
  }
}
