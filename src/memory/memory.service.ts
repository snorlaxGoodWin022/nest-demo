import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { config } from 'src/config';
import { Readable } from 'stream';

@Injectable()
//实现原理：历史消息存在内存 Map 里，每次对话都把历史消息一起发给模型
export class MemoryService {
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    apiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: 0.1,
  });
  private systemMessage = new SystemMessage(
    '你是一个智能助手,能记住对话历史,根据上下文准确的回答',
  );
  private sessions = new Map<string, BaseMessage[]>();

  private getOrCreate(sessionId: string): BaseMessage[] {
    if (!this.sessions.has(sessionId)) {
      //没有就创建,创建的是 系统消息这个
      this.sessions.set(sessionId, [this.systemMessage]);
    }
    return this.sessions.get(sessionId)!; //有就取出
  }

  async chat(sessionId: string, message: string) {
    const history = this.getOrCreate(sessionId);
    //Map.get() 返回的是数组 引用 ,所以 history.push() 改的就是 Map 里存的那份
    history.push(new HumanMessage(message));
    const response = await this.llm.invoke(history);
    history.push(response);
    return {
      sessionId,
      message,
      reply: response.content,
      turns: Math.floor((history.length - 1) / 2),
    };
  }

  async chatStream(sessionId: string, message: string): Promise<Readable> {
    const history = this.getOrCreate(sessionId);
    history.push(new HumanMessage(message));

    const stream = await this.llm.stream(history);
    let fullResponse = '';

    const chunks: string[] = [];
    //这里的 chunk 是每个字符逐一输出的流式响应
    for await (const chunk of stream) {
      const content =
        typeof chunk.content === 'string'
          ? chunk.content
          : JSON.stringify(chunk.content);
      chunks.push(content);
      fullResponse += content;
    }

    history.push(new SystemMessage(fullResponse));

    return Readable.from(chunks.join(''));
  }

  getHistory(sessionId: string) {
    const history = this.sessions.get(sessionId);
    if (!history) {
      return null;
    }
    return {
      sessionId,
      messages: history.map((msg) => ({
        type: msg.type,
        content: msg.content,
      })),
      turns: Math.floor((history.length - 1) / 2),
    };
  }

  deleteHistory(sessionId: string) {
    const existed = this.sessions.delete(sessionId);
    return {
      sessionId,
      deleted: existed,
    };
  }

  listSessions() {
    const sessions = Array.from(this.sessions.entries()).map(
      ([sessionId, messages]) => ({
        sessionId,
        turns: Math.floor((messages.length - 1) / 2),
        messageCount: messages.length,
      }),
    );
    return { sessions };
  }
}
