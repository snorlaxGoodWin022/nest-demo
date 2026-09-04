// import {
//   AIMessage,
//   BaseMessage,
//   HumanMessage,
//   SystemMessage,
//   ToolMessage,
// } from '@langchain/core/messages';
// import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
// import { Redis } from 'redis';
// import { Readable } from 'stream';
// import { config } from '../config';

// /**
//  * 消息序列化/ 反序列化函数
//  * redis 只能存字符串 ,要把Message对象转为JSON
//  */
// const serializeMessage = (msg: BaseMessage): Record<string, any> => ({
//   type: msg.getType(),
//   content: msg.content,
//   //如果是 ToolMessage,还要存tool_call_id
//   ...(msg instanceof ToolMessage && { tool_call_id: msg.tool_call_id }),
// });

// const deserializeMessage = (data: Record<string, any>): BaseMessage => {
//   switch (data.type) {
//     case 'system':
//       return new SystemMessage(data.content);
//     case 'human':
//       return new HumanMessage(data.content);
//     case 'ai':
//       return new AIMessage(data.content);
//     case 'tool':
//       return new ToolMessage({
//         content: data.content,
//         tool_call_id: data.tool_call_id || 'unknown',
//       });

//     default:
//       return new HumanMessage(data.content);
//   }
// };

// @Injectable()
// export class MemoryServiceRedis implements OnModuleInit, OnModuleDestroy {
//   private redis: Redis;
//   private llm = new ChatOpenAI({
//     model: config.llamaCpp.chatModel,
//     apiKey: 'not-needed',
//     configuration: {
//       baseURL: config.llamaCpp.baseUrl,
//     },
//     temperature: 0.1,
//   });
//   private systemMessage = new SystemMessage(
//     '你是一个智能助手,能记住对话历史,根据上下文准确地回答问题',
//   );
//   constructor() {
//     //初始化redis
//     this.redis = new Redis({
//       host: config.redis.host,
//       port: config.redis.port,
//       password: config.redis.password || undefined,
//       db: config.redis.db,
//       keyPrefix: config.redis.keyPrefix,
//       retryStrategy: (times) => {
//         //重试策略: 最多重试10次
//         if (times > 10) {
//           console.error('Redis 连接失败, 最多重试10次');
//           return null;
//         }
//         return Math.min(times * 1000, 60000);
//         // 最大重试时间 60s
//       },
//     });

//     //监听redis事件
//     this.redis.on('connect', () => {
//       console.log('Redis 连接成功');
//     });
//     this.redis.on('error', (err) => {
//       console.error('Redis 连接错误:', err);
//     });
//     this.redis.on('end', () => {
//       console.log('Redis 连接已结束');
//     });
//   }

//   //生命周期钩子
//   async onModuleInit() {
//     await this.redis.connect();
//     console.log('Redis 连接成功');
//   }
//   async onModuleDestroy() {
//     await this.redis.disconnect();
//     console.log('Redis 连接已断开');
//   }

//   /**
//    * 获取或者创建会话历史
//    * redis key:chat:session:sessionId
//    * value:JSON字符串,包含会话历史消息
//    */
//   async getOrCreate(sessionId: string): Promise<BaseMessage[]> {
//     const key = sessionId;
//     const data = await this.redis.get(key);

//     if (!data) {
//       // 新会话：只存系统消息
//       const initialHistory = [this.systemMessage];
//       await this.redis.set(
//         key,
//         JSON.stringify(initialHistory.map(serializeMessage)),
//         'EX',
//         config.redis.ttl,
//       );
//       return initialHistory;
//     }
//     // 反序列化
//     const parsed = JSON.parse(data) as Record<string, any>[];
//     return parsed.map(deserializeMessage);
//   }

//   /**
//    * 保存会话历史到redis
//    */
//   async saveHistory(sessionId: string, history: BaseMessage[]) {
//     const key = sessionId;
//     const serialized = history.map(serializeMessage);
//     await this.redis.set(
//       key,
//       JSON.stringify(serialized),
//       'EX',
//       config.redis.ttl,
//     );
//   }

//   //非流式对话
//   async chat(
//     sessionId: string,
//     messages: BaseMessage[],
//   ): Promise<BaseMessage[]> {
//     //获取会话历史
//     const history = await this.getOrCreate(sessionId);
//     //添加用户消息
//     const userMsg = new HumanMessage(message);
//     history.push(userMsg);
//     //调用模型
//     const response = await this.llm.invoke(history);
//     //添加ai回复
//     history.push(response);
//     //保存会话历史
//     await this.saveHistory(sessionId, history);
//     return {
//       sessionId,
//       message,
//       reply: response.content,
//       turns: Math.floor((history.length - 1) / 2),
//     };
//   }

//   //流式对话
//   async chatStream(
//     sessionId: string,
//     messages: BaseMessage[],
//   ): Promise<BaseMessage[]> {
//     //获取会话历史
//     const history = await this.getOrCreate(sessionId);
//     //添加用户消息
//     const userMsg = new HumanMessage(messages);
//     history.push(userMsg);
//     //调用模型
//     const response = await this.llm.stream(history);
//     let fullResponse = '';
//     const chunks: string[] = [];
//     for await (const chunk of response) {
//       const content =
//         typeof chunk.content === 'string'
//           ? chunk.content
//           : JSON.stringify(chunk.content);
//       fullResponse += content;
//       chunks.push(content);
//     }
//     //添加ai回复
//     const aiMsg = new AIMessage(fullResponse);
//     history.push(aiMsg);
//     //保存会话历史
//     await this.saveHistory(sessionId, history);
//     //返回流
//     return Readable.from(chunks.join(''));
//   }

//   //获取对话历史
//   async getHistory(sessionId:string){
//     const history = await this.getOrCreate(sessionId);
//     return {
//         sessionId,
//         messages:history.map((msg)=>{
//             type:msg.getType(),
//             content:msg.content,
//         }),
//         turns:Math.floor((history.length - 1) / 2),
//     }
//   }

//   //根据sessionId来清空会话历史
//   async clearHistory(sessionId:string){
//     const key = sessionId;
//     const existed = await this.redis.exists(key);
//     if(existed){
//       await this.redis.del(key);
//     }
//     return{
//         sessionId,
//         deleted:existed === 1,
//     }
//   }
// }
