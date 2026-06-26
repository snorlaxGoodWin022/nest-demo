import { Injectable } from '@nestjs/common';
import { config } from '../config';
// import { ChatOpenAI } from '@langchain/openai'; // [Ollama] 原始代码
import { ChatOpenAI } from '@langchain/openai'; // [Llama.cpp] llama-server HTTP 服务（与 Ollama API 兼容）
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Response } from 'express';
import { StringOutputParser } from '@langchain/core/output_parsers';

@Injectable()
export class ModelsService {
  // [Llama.cpp] 使用本地 llama-server.exe 启动的 HTTP 服务
  // 服务地址：http://localhost:8081
  // 模型：Llama-3.2-1B-Instruct-Q4_K_M
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    openAIApiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: config.llamaCpp.temperature,
  });

  //方式一：基础调用（等待完整回答）
  //invoke 发送消息数组，等模型生成完整回答后一次性回答
  async basicChat(message: string) {
    const response = await this.llm.invoke([new HumanMessage(message)]);
    return {
      question: message,
      answer: response.text,
      usage: response.usage_metadata,
    };
  }

  //方式二：设定system角色
  async chatWithSystem(system: string, message: string) {
    const response = await this.llm.invoke([
      new SystemMessage(system),
      new HumanMessage(message),
    ]);
    return {
      system: system,
      question: message,
      answer: response.text,
      usage: response.usage_metadata,
    };
  }

  //方式三：流式调用（边生成边返回）
  async chatStream(message: string, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = await this.llm.stream([new HumanMessage(message)]);

    for await (const chunk of stream) {
      console.log('Received chunk:', chunk);
      res.write(
        `data: ${JSON.stringify({
          answer: chunk.text,
          usage: chunk.usage_metadata,
        })}\n\n`,
      );
    }
    // 发送结束标记，前端据此判断流结束
    res.write('data: [DONE]\n\n');
    res.end();
  }

  //方式4，使用pipe
  //pipe可以把多个组件串成链，输出是string
  async chatWithParser(message: string) {
    const chain = this.llm.pipe(new StringOutputParser());
    const answer = await chain.invoke([new HumanMessage(message)]);
    // answer 直接是字符串，不是 AIMessage 对象
    return {
      question: message,
      answer: answer,
    };
  }
}
