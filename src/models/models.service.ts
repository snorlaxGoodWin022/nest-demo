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
    apiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: config.llamaCpp.temperature,
  });

  //方式一: 最基本的调用
  //invoke 发生消息数组,等模型生成完整回答后一次性回答
  async basicChat(message: string) {
    const response = await this.llm.invoke([new HumanMessage(message)]);
    return {
      question: message,
      answer: response.text,
      usage: response.usage_metadata,
      response: response,
    };
  }

  //方式二:设定system角色
  async chatWithSystem(system: string, message: string) {
    const response = await this.llm.invoke([
      new HumanMessage(message),
      new SystemMessage(system),
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
    //设置响应头
    res.setHeader('Content-Type', 'text/event-stream'); //告诉浏览器这是 Server-Sent Events（SSE）流式响应
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    //调用 LLM 的 .stream() 方法返回一个异步可迭代对象,流式数据的来源
    const stream = await this.llm.stream([new HumanMessage(message)]);

    //for await...of：异步循环，每收到一块数据就立即执行一次。
    //res.write()：将数据块即时写入 HTTP 响应，而不是等所有数据攒完再发送。
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
  //可以把pipe理解为流水线
  // async chatWithParser(message: string) {
  //   //搭建流水线
  //   // 通常在这类链式调用中，先执行invoke，其返回值再调用pipe
  //   const chain = this.llm.pipe(new StringOutputParser());
  //   const answer = await chain.invoke([new HumanMessage(message)]);
  //   // answer 直接是字符串，不是 AIMessage 对象
  //   return {
  //     question: message,
  //     answer: answer,
  //   };
  // }
  async chatWithParser(message: string) {
    const chain = this.llm.pipe(new StringOutputParser());
    const answer = await chain.invoke([new HumanMessage(message)]);
    return {
      question: message,
      answer: answer,
    };
  }
}
