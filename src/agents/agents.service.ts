import { ChatOpenAI } from '@langchain/openai'; // [Llama.cpp] llama-server HTTP 服务（与 Ollama API 兼容）
// import { ChatOpenAI } from '@langchain/openai'; // [Ollama] 原始代码
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { config } from 'src/config';
import { z } from 'zod';

@Injectable()
export class AgentsService {
  /**
   * 从 LangChain 消息内容中提取纯文本
   * content 可能是 string 或 ContentBlock[]，需要统一处理
   */
  private extractTextContent(content: string | Record<string, any>[]): string {
    if (typeof content === 'string') {
      return content;
    }
    // 如果是数组，尝试提取所有文本
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          return block.text as string;
        }
        return '';
      })
      .join('');
  }

  // [Llama.cpp] 使用本地 llama-server.exe 启动的 HTTP 服务
  // 服务地址：http://localhost:8081
  // 模型：Llama-3.2-1B-Instruct-Q4_K_M
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    apiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: 0.1,
  });

  /**
    工具定义
    tool()把普通js函数包装成模型能识别的格式
    name：工具名
    describtion 工具描述
    schema 参数定义
   */

  // 工具1：查询商品库存和价格
  private checkProductTool = tool(
    ({ productName }: { productName: string }) => {
      console.log(`[工具执行] check_product -> 查询商品：${productName}`);
      const products: Record<
        string,
        { price: number; stock: number; category: string }
      > = {
        'iPhone 16': { price: 7999, stock: 50, category: '手机' },
        'iPhone 16 Pro': { price: 9999, stock: 20, category: '手机' },
        'MacBook Pro': { price: 15999, stock: 8, category: '电脑' },
        'AirPods Pro': { price: 1799, stock: 200, category: '耳机' },
        'iPad Air': { price: 4799, stock: 30, category: '平板' },
      };
      const product = products[productName];
      if (!product) {
        return `商品 ${productName}不存在，请检查商品名称是否正确`;
      }
      if (product.stock === 0) {
        return `商品 ${productName} 当前缺货，预计下周补货`;
      }
      return `商品「${productName}」有货，单价 ¥${product.price}，库存 ${product.stock} 件，分类：${product.category}。`;
    },
    {
      name: 'check_product',
      description:
        '查询商品是否有货、商品价格和库存数量。用户问"有没有XX"、"XX多少钱"、"XX有货吗"时调用。',
      schema: z.object({
        productName: z
          .string()
          .describe('商品名称，例如 iPhone 16、MacBook Pro'),
      }),
    },
  );

  //工具2 :创建订单
  private createOrderTool = tool(
    ({
      productName,
      quantity,
      customerName,
    }: {
      productName: string;
      quantity: number;
      customerName: string;
    }) => {
      console.log(
        `[工具执行] create_order -> ${customerName} 购买 ${productName} x${quantity}`,
      );
      const price: Record<string, number> = {
        'iPhone 16': 7999,
        'iPhone 16 Pro': 9999,
        'MacBook Pro': 15999,
        'AirPods Pro': 1799,
        'iPad Air': 4799,
      };
      const unitPrice = price[productName] ?? 0;
      const totalPrice = quantity * unitPrice;
      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      return `订单创建成功！订单号：${orderId}，客户：${customerName}，商品：${productName} x${quantity}，单价 ¥${unitPrice}，总价 ¥${totalPrice}。请在 30 分钟内完成支付。`;
    },
    {
      name: 'create_order',
      description:
        '为客户创建购买订单。需要知道商品名称、购买数量、客户姓名才能下单。用户说"我要买XX"、"帮我下单"时调用。',
      schema: z.object({
        productName: z.string().describe('商品名称'),
        quantity: z.number().describe('购买数量,默认为1'),
        customerName: z.string().describe('客户姓名'),
      }),
    },
  );

  //工具3:查询订单状态
  private checkOrderTool = tool(
    ({ orderId }: { orderId: string }) => {
      console.log(` 工具执行 check_order -> 查询订单 ${orderId}`);
      const statuses = ['待支付', '已支付待发货', '已发货运输中', '已签收'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const extra = status === '已发货运输中' ? '，预计明天送达' : '';
      return `订单 ${orderId} 当前状态：${status}${extra}。`;
    },
    {
      name: 'check_order',
      description:
        '查询订单的当前状态。用户说"我的订单"、"订单到哪了"、"查一下订单 ORD-XXX"时调用。',
      schema: z.object({
        orderId: z.string().describe('订单号,格式为 ORD-xxxxxx'),
      }),
    },
  );

  //工具4,申请退款
  private applyRefundTool = tool(
    ({ orderId, reason }: { orderId: string; reason: string }) => {
      console.log(` 工具执行 apply_refund ->订单 ${orderId}, 原因: ${reason}`);
      const refundId = `REF-${Date.now().toString().slice(-6)}`;
      return `退款申请已提交,退款单号:${refundId}. 订单:${orderId}，退款原因：${reason}。预计 1-3 个工作日内退回原支付渠道，请注意查收。`;
    },
    {
      name: 'apply_refund',
      description:
        '为客户申请订单退款。用户说"我要退款"、"申请退货"、"不想要了"时调用。需要订单号和退款原因。',
      schema: z.object({
        orderId: z.string().describe('需要退款的订单号'),
        reason: z.string().describe('退款原因，例如：质量问题、不喜欢、买错了'),
      }),
    },
  );

  /**
   * 运行 AI 客服 Agent
   * @param message 用户输入的消息
   * @returns 包含回答、步骤记录和轮次的对象
   */
  async runAgent(message: string): Promise<{
    message: string;
    steps: string[];
    totalRounds: number;
    answer: string;
  }> {
    const tools = [
      this.checkProductTool,
      this.createOrderTool,
      this.checkOrderTool,
      this.applyRefundTool,
    ];

    const toolMap: Record<string, any> = {
      check_product: this.checkProductTool,
      create_order: this.createOrderTool,
      check_order: this.checkOrderTool,
      apply_refund: this.applyRefundTool,
    };

    //bindTools:把工具列表注册到模型
    const llmWithTools = this.llm.bindTools(tools);
    const messages: Array<
      SystemMessage | HumanMessage | AIMessage | ToolMessage
    > = [
      new SystemMessage(`你是「极速购」电商平台的 AI 智能客服助手。
你可以使用以下工具帮助客户：
- check_product：查询商品库存和价格
- create_order：为客户创建订单
- check_order：查询订单状态
- apply_refund：申请退款

工作原则：
1. 先用工具获取真实信息，再给客户答复
2. 下单前必须先查询库存确认有货
3. 下单需要知道客户姓名，如果用户没说，主动询问
4. 回答简洁友好，使用中文`),
      new HumanMessage(message),
    ];

    const steps: string[] = [];
    let roundCount = 0;

    //agent循环
    //每一轮,模型查看消息历史,决定调用工具还是直接回答
    //知道模型不在调用工具位置,最多6轮
    while (roundCount < 6) {
      roundCount++;
      console.log(`\n [Agent 第 ${roundCount} 轮]`);

      const response = await llmWithTools.invoke(messages);
      messages.push(response); //模型回复加入历史

      //  tool_calls 为空,说明模型有了最终答案,退出循环
      if (!response.tool_calls || response.tool_calls.length === 0) {
        steps.push(
          `最终回答:${this.extractTextContent(
            response.content as string | Record<string, any>[],
          )}`,
        );
        break;
      }

      // 模型调用工具,依次执行所有工具调用
      /*因为模型一轮可能发 N 个工具调用（并行调用），所以必须遍历 N 次，
      每次都执行 + 回传对应 tool_call_id 的结果，否则模型拿到的信息就不完整。
       */
      for (const toolCall of response.tool_calls) {
        steps.push(
          `[调用工具] ${toolCall.name}  (${JSON.stringify(toolCall.args)})`,
        );
        console.log(
          ` [工具调用] ${toolCall.name}, args: ${JSON.stringify(toolCall.args)}`,
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const toolFn = toolMap[toolCall.name];
        if (!toolFn) {
          // 工具不存在，返回错误信息
          const errMsg = `[工具] ${toolCall.name} 不存在`;
          steps.push(`[错误] ${errMsg}`);
          messages.push(
            new ToolMessage({
              content: errMsg,
              tool_call_id: toolCall.id ?? 'unknown',
            }),
          );
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        // 调用工具 + 告诉 TypeScript 返回的是字符串 。
        /**
         * toolFn 是 tool() 包装出来的 Runnable 对象，
         * 必须按 LangChain 规矩用 .invoke(参数) 调用，不能当普通函数直接 call。
         */
        const toolResult = (await toolFn.invoke(
          toolCall.args as Record<string, unknown>, // ① 把参数类型"抹平"成对象
        )) as string; // ② 断言结果一定是 string
        steps.push(`✅ [工具结果] ${toolResult}`);
        console.log(`[工具结果] ${toolResult}`);

        // 把工具结果加入历史消息
        // 模型下一轮看到结果后，再决定是调工具还是直接回答
        messages.push(
          new ToolMessage({
            content: String(toolResult),
            tool_call_id: toolCall.id ?? 'unknown',
          }),
        );
      }
    }

    // 获取最后一条回答
    /**
     * 因为最后一个 不一定是 AI 消息 。比如循环跑满 6 轮还没收敛，
     * 最后一条可能是 ToolMessage ，那直接取就拿到了工具结果而不是 AI 回答。
     */
    const lastAI = [...messages].reverse().find((m) => m instanceof AIMessage);
    const answer = lastAI
      ? this.extractTextContent(
          lastAI.content as string | Record<string, any>[],
        )
      : '无回答';
    return {
      message,
      steps,
      totalRounds: roundCount,
      answer,
    };
  }
}

/**
 * ============================================================================
 *                        AI 客服 Agent 功能流程说明
 * ============================================================================
 *
 * 【整体架构】
 * 本模块实现了一个基于 LangChain + Llama.cpp 的 AI 客服 Agent，采用
 * ReAct (Reasoning + Acting) 模式，让 AI 能够自主调用工具来完成任务。
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                          用户输入 (message)                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  1. 初始化阶段                                                           │
 * │     - 创建 ChatOllama 实例（连接 llama-server 服务）                      │
 * │     - 注册 4 个工具：查商品、创建订单、查订单、退款                        │
 * │     - 构建 SystemMessage（设定 AI 角色和行为规范）                        │
 * │     - 将用户消息封装为 HumanMessage 加入消息历史                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  2. Agent 循环（最多 6 轮）                                              │
 * │                                                                          │
 * │     ┌───────────────────────────────────────────────────────────────┐   │
 * │     │  第 N 轮：                                                      │   │
 * │     │                                                               │   │
 * │     │  2.1 LLM 推理                                                   │   │
 * │     │      - 将消息历史（含之前轮次的工具结果）发送给 LLM              │   │
 * │     │      - LLM 分析用户意图，决定是否需要调用工具                    │   │
 * │     │                                                               │   │
 * │     │  2.2 决策判断                                                   │   │
 * │     │      - 如果 response.tool_calls 为空 → LLM 已得到最终答案        │   │
 * │     │        → 退出循环，返回最终回答                                  │   │
 * │     │      - 如果 response.tool_calls 不为空 → 需要调用工具            │   │
 * │     │        → 继续执行                                                │   │
 * │     │                                                               │   │
 * │     │  2.3 工具执行循环                                                │   │
 * │     │      - 遍历 LLM 请求的每个工具调用                              │   │
 * │     │      - 根据工具名从 toolMap 查找对应函数                        │   │
 * │     │      - 执行工具函数，获取返回结果                               │   │
 * │     │      - 将工具结果封装为 ToolMessage 加入消息历史                 │   │
 * │     │      - 下一轮 LLM 将看到这个结果，继续推理                       │   │
 * │     │                                                               │   │
 * │     └───────────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  3. 返回结果                                                            │
 * │     - message: 原始用户输入                                             │
 * │     - steps: 完整对话步骤记录（包含工具调用过程）                        │
 * │     - totalRounds: 实际执行的轮次数                                      │
 * │     - answer: AI 最终回答                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 【工具说明】
 *
 * 工具名            │ 功能         │ 参数                    │ 使用场景
 * ──────────────────┼──────────────┼────────────────────────┼────────────────────
 * check_product     │ 查询商品     │ productName: 商品名     │ 问有没有货/价格
 * create_order      │ 创建订单     │ productName, quantity,  │ 客户要下单
 *                   │              │ customerName            │
 * check_order       │ 查询订单状态  │ orderId: 订单号         │ 问订单到哪了
 * apply_refund      │ 申请退款     │ orderId, reason         │ 要退款/退货
 *
 * 【ReAct 模式工作示例】
 *
 * 用户问："iPhone 16 多少钱？有货吗？"
 *
 * 轮次 1:
 *   LLM 推理 → 需要调用 check_product 工具
 *   工具执行 → 返回 "iPhone 16 有货，单价 ¥7999，库存 50 件"
 *   记录步骤 → "[调用工具] check_product"
 *   记录结果 → "✅ [工具结果] iPhone 16 有货..."
 *
 * 轮次 2:
 *   LLM 推理 → 信息已足够，直接回答用户
 *   返回 → "iPhone 16 目前有货..."
 *   退出循环
 *
 * 用户问："帮我下单买一个"
 *
 * 轮次 1:
 *   LLM 推理 → 需要调用 check_product 确认有货
 *   工具执行 → 返回有货
 *
 * 轮次 2:
 *   LLM 推理 → 需要调用 create_order，但缺少客户姓名
 *   返回 → "请问您叫什么名字？"
 *
 * 轮次 3:
 *   用户说："我叫张三"
 *   LLM 推理 → 现在有姓名，调用 create_order
 *   工具执行 → 返回订单创建成功
 *
 * 轮次 4:
 *   LLM 推理 → 订单创建完成，给用户最终答复
 *   退出循环
 *
 * ============================================================================
 */
