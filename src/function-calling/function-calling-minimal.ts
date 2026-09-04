// // funcion calling的核心骨架
// async function minmalFunctionCalling(userMessage: string) {
//   const tools = [checkInventoryTool, createOrderTool];
//   const llmWithTools = llm.bindTools(tools);
//   const messages = [new HumanMessage(userMessage)];

//   for (let round = 0; round < 3; round++) {
//     const response = await llmWithTools.invoke(messages);
//     messages.push(response);

//     if (!response.tool_calls?.length) {
//       break;
//     }
//     for (const tool_call of response.tool_calls) {
//       const result = await toolMap[tool_call.name].invoke(tool_call.args);
//       messages.push(
//         new ToolMessage({
//           content: result,
//           tool_call_id: tool_call.id,
//         }),
//       );
//     }
//   }
//   return messages[messages.length - 1].content.trim();
// }
