import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import {
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';
import { z } from 'zod';

//定义工具
const calculatorTool = tool(
  async ({ expression }) => {
    try {
      const result = Function(`'use strict';return(${expression})`)();
      return `计算结果是 ${expression} = ${result}`;
    } catch (e: any) {
      return `计算表达式 ${expression} 时出错: ${e.message}`;
    }
  },
  {
    name: 'calculator',
    description: '用于计算数学表达式,如(2+3)*4',
    schema: z.object({
      expression: z.string().describe('要计算的数学表达式'),
    }),
  },
);
const weatherTool = tool(
  async ({ city }) => {
    const mock: Record<string, string> = {
      北京: '晴，25°C，东北风 3 级',
      上海: '多云，28°C，东风 2 级',
      武汉: '晴，30°C，南风 1 级',
      广州: '雷阵雨，32°C，南风 2 级',
    };
    return mock[city] || `未找到 ${city} 的天气信息`;
  },
  {
    name: 'get_weather',
    description: '查询指定城市的天气',
    schema: z.object({
      city: z.string().describe('要查询的城市名,如北京,上海,武汉,广州'),
    }),
  },
);

const tools = [calculatorTool, weatherTool];

@Injectable()
export class ReactAgentService implements OnModuleInit {
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

    //tool注入llm
    const llmWithTools = llm.bindTools(tools);

    // ToolNode 封装了调用tool_calls后的逻辑
    const toolNode = new ToolNode(tools);

    const callModel = async (state: typeof MessagesAnnotation.State) => {
      // 检查是否已有 SystemMessage
      const hasSystem = state.messages.some((m) => m._getType() === 'system');

      let messages = state.messages;
      if (!hasSystem) {
        // 如果没有 SystemMessage，才添加
        messages = [
          new SystemMessage(`你是专业助手，可用工具：
- calculator：数学计算
- get_weather：查询天气
根据问题决定是否调用工具。`),
          ...state.messages,
        ];
      }

      const response = await llmWithTools.invoke(messages);
      return {
        messages: [response],
      };
    };

    //路由选择函数:检查最后一条消息是否包含tool_calls
    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const lastMessage = state.messages.at(-1) as AIMessage;
      // 1. last.tool_calls?.length => undefined（因为 tool_calls 不存在，可选链提前返回）
      // 2. undefined ?? 0 => 0（空值合并生效）
      return (lastMessage.tool_calls?.length ?? 0) > 0 ? 'tools' : END;
    };
    //图
    this.graph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModel)
      .addNode('tools', toolNode)
      .addEdge(START, 'callModel')
      .addConditionalEdges('callModel', shouldContinue, {
        tools: 'tools',
        [END]: END,
      })
      .addEdge('tools', 'callModel')
      .compile({ checkpointer: new MemorySaver() });

    console.log('✅ ReAct Agent 初始化完成');
  }
  async chat(threadId: string, message: string): Promise<string> {
    const result = await this.graph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      {
        configurable: { thread_id: threadId },
        recursionLimit: 50,
      },
    );
    return result.messages.at(-1).content as string;
  }
}
