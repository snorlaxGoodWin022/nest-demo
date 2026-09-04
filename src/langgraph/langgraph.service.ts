import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

@Injectable()
export class LanggraphService implements OnModuleInit {
  private simpleGraph: any;
  private memoryGraph: any;
  //生命周期钩子, 在模块初始化完成后，自动执行
  async onModuleInit() {
    // 初始化 LLM 模型
    const llm = new ChatOpenAI({
      model: config.llamaCpp.chatModel,
      apiKey: 'not-needed',
      configuration: {
        baseURL: config.llamaCpp.baseUrl,
      },
      temperature: config.llamaCpp.temperature,
    });

    //工作流一: 无记忆 每次invoke独立
    const callModel = async (state: typeof MessagesAnnotation.State) => {
      //state.messages 包含本次传入的所有消息
      const response = await llm.invoke(state.messages);
      //只返回新增消息, LangGraph会自动追加
      /**
       *  LangGraph 状态管理（State + Reducer）机制决定的
       * 1.返回"增量更新"，而非"完整状态",节点只需要返回这次新增的消息，框架会自动把它追加到历史消息列表中。
       * 2.格式对齐：{ messages: BaseMessage[] }
       */
      return { messages: [response] };
    };
    /**创建一个带状态管理的工作流图（StateGraph）实例
     *MessagesAnnotation	作为参数传入，定义了这个图的状态结构（State Schema）
     MessagesAnnotation 预设了什么？它告诉 LangGraph：这个图的状态里有一个 messages 字段，是消息数组类型，并且配备了自动追加（reducer）逻辑
     */
    this.simpleGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModel)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      .compile();

    //工作流二:有记忆的
    const callModelWithMemory = async (
      state: typeof MessagesAnnotation.State,
    ) => {
      const messages = [
        new SystemMessage('你是一个专业的ai助手,要记住上下文且回答简短清晰'),
        ...state.messages,
      ];
      const response = await llm.invoke(messages);
      return { messages: [response] };
    };
    this.memoryGraph = new StateGraph(MessagesAnnotation)
      .addNode('callModel', callModelWithMemory)
      .addEdge(START, 'callModel')
      .addEdge('callModel', END)
      /**
       * checkpointer 选项	开启状态快照（Checkpoint）机制——每次执行后，把整个图的状态（即 messages 历史）保存下来
       * new MemorySaver()	选择"内存型"存储适配器——把状态快照存在进程内存里（重启服务会丢失）
       */
      .compile({ checkpointer: new MemorySaver() });
  }

  async simpleChat(message: string): Promise<string> {
    //invoke里的参数的格式 对着MessagesAnnotation预设的message数组的格式
    const result = await this.simpleGraph.invoke({
      messages: [
        new SystemMessage('你是一个专业的ai助手,回答简洁清晰'),
        new HumanMessage(message),
      ],
    });
    return result.messages[result.messages.length - 1].content;
  }

  //有记忆
  async memoryChat(message: string, threadId: string): Promise<string> {
    const result = await this.memoryGraph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      {
        configurable: {
          thread_id: threadId,
        },
      },
    );
    return result.messages[result.messages.length - 1].content;
  }

  //根据threadId获取消息历史
  async getHistory(threadId: string): Promise<string> {
    //getState 从状态管理中获取当前状态
    const state = await this.memoryGraph.getState({
      configurable: {
        thread_id: threadId,
      },
    });
    console.log('getHistory', state);
    return (state.values.messages ?? []).map((m: any, i: number) => ({
      index: i,
      role: m._getType?.() === 'human' ? 'user' : 'assistant',
      content: m.content,
    }));
  }
}
