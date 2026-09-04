// import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
// import { ChatOpenAI } from '@langchain/openai';
// import { config } from 'src/config';
// //定义一个工具
// //2.创建模型实例
// //3.绑定工具
// //4.初始化messages
// //5.while循环
// //5.1invoke模型
// //5.2检查tool_calls
// //5.3 执行工具
// //5.4历史里加入ToolMessage
// //6.返回最后的回答

// //创建模型实例
// private llm = new ChatOpenAI(
//     {
//         model:config.llamaCpp.chatModel,
//         apiKey:config.llamaCpp.apiKey,
//         baseURL:config.llamaCpp.baseURL,
//         temperature:0.5,
//     }
// );

// //2.定义一个工具
// //创建订单
// private  createOrderTool = tool(
//     ({productName,quantity,customerName}:{productName:string,quantity:number,customerName:string})=>{
//         console.log(`工具执行,create_order,${productName},${quantity},${customerName}`)
//         const price:Record<string,number> ={
//              'iPhone 16': 7999,
//         'iPhone 16 Pro': 9999,
//         'MacBook Pro': 15999,
//         'AirPods Pro': 1799,
//         'iPad Air': 4799,
//         }
//         const unitPrice = price[productName] ?? 0;
//         const totalPrice = unitPrice * quantity;
//         const orderId = `ORD-${Date.now().toString().slice(-6)}`
//         return `订单创建成功,订单号:${orderId},商品名称:${productName},购买数量:${quantity},客户姓名:${customerName},单价:${unitPrice},总价:${totalPrice}`

//     },{name:'create_order',
//         description:'创建订单要知道商品名称, 购买数量,客户姓名',
//         schema:z.object({
//             productName:z.string().describe('商品名称'),
//             quantity:z.number().describe('商品数量'),
//             customerName:z.string().describe('客户名称'),
//         })
//     }
// )

// async runAgent(message:string){
//     //3. 绑定工具
// const tools = [this.createOrderTool]
// const toolMap :Record<string,any> = {
//     create_order: this.createOrderTool,
// }
// const llmWithTools = this.llm.bindTools(tools)

// //4.初始化messages
// const messages :Array<SystemMessage|HumanMessage|AIMessage|ToolMessage> = [
//     new SystemMessage(`你是「极速购」电商平台的 AI 智能客服助手。
// 你可以使用以下工具帮助客户：
// - create_order：为客户创建订单

// 工作原则：
// 1. 先用工具获取真实信息，再给客户答复
// 2. 下单前必须先查询库存确认有货
// `),
//     new HumanMessage(message),
// ]

// //5.while循环
//  const steps: string[] = []
//  let roundCount = 0;

//  while(roundCount <6){
//     roundCount++;
//     console.log(`第${roundCount}轮`)
//     const response = await llmWithTools.invoke(messages)
//     messages.push(response)

//     //tool_calls为空或长度为0,说明已有最终答案
//     if(!response.tool_calls || response.tool_calls.length === 0){
//        steps.push(
//           `最终回答:${this.extractTextContent(
//             response.content as string | Record<string, any>[],
//           )}`,
//         );
//         break;
//     }

//     //模型调用工具,依次执行所有模型调用,
//     //模型一轮可能调用多个工具,所以要遍历`response.tool_calls`
//     for (const toolCall of response.tool_calls
//     ){
//         steps.push(
//             `[调用工具] ${toolCall.name}  (${JSON.stringify(toolCall.args)})`,
//         );
//         const toolFn = toolMap[toolCall.name]
//         if(!toolFn){
//             steps.push(
//                 `工具${toolCall.name}不存在`,
//             );
//             messages.push(new ToolMessage({
//                 tool_call_id: toolCall.id,
//                 content: `工具${toolCall.name}不存在`,
//             }))
//             continue;
//         }

//         //toolFn的调用
//         const toolResult = (await toolFn.invoke(toolCall.args as Record<string,unknown>)) as string
//         steps.push(
//             `工具${toolCall.name}执行结果:${toolResult}`,
//         );
//         messages.push(new ToolMessage({
//             tool_call_id: toolCall.id,
//             content: toolResult,
//         }))
//     }
//  }

//  //6.返回最后的回答
//  const lastAI = [...messages].reverse.find(m=>m instanceof AIMessage)
// const answer = lastAI? this.extractTextContent(
//           lastAI.content as string | Record<string, any>[],
//         )
//       : '无回答';
// return {
//       message,
//       steps,
//       totalRounds: roundCount,
//       answer,
//     };

// }
