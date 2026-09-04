/**
 * MCP Agent Service
 *
 * 使用 LangChain + MCP 集成的方式实现 AI Agent
 *
 * 核心思想：
 * - 使用 LangChain 的 ChatOllama 作为 LLM（大语言模型）
 * - 使用 @langchain/mcp-adapters 将 MCP 工具转换为 LangChain Tools
 * - LLM 根据用户问题自主决定调用哪个工具，然后基于工具返回结果回答
 *
 * 工作流程：
 * 1. 启动时连接 MCP Server，获取工具列表
 * 2. 将 MCP 工具转换为 LangChain 工具格式
 * 3. 用户发送消息时，LLM 分析问题并决定调用哪些工具
 * 4. 执行工具调用，获取结果
 * 5. 将工具结果返回给 LLM，生成最终回答
 *
 * 特点：
 * - 支持多轮对话（Agent 循环）
 * - LLM 自主决策调用哪些工具（ReAct 模式）
 * - 可以同时连接多个 MCP Server
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { BaseMessage } from '@langchain/core/messages';
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { config } from '../config';

@Injectable()
export class McpAgentService implements OnModuleInit, OnModuleDestroy {
  // 初始化 ChatOllama（本地 LLM）
  // 配置说明：
  // - model: 使用的模型名称（来自配置文件）
  // - baseUrl: Ollama 服务地址
  // - temperature: 温度参数，控制随机性（0.3 偏低，更确定性）
  // - numPredict: 最大生成 token 数
  private llm = new ChatOllama({
    model: 'llama3.2', // 使用 Ollama 本地模型
    baseUrl: config.llamaCpp.baseUrl.replace('/v1', ''), // Ollama 不需要 /v1 后缀
    temperature: config.llamaCpp.temperature,
    numPredict: 1024,
  });

  // MultiServerMCPClient：同时连接多个 MCP Server
  // 支持连接不同类型的 MCP Server（stdio、HTTP 等）
  private mcpClient!: MultiServerMCPClient;

  // 从 MCP 工具转换来的 LangChain Tools
  // 转换后就可以用 LangChain 的标准方式来使用
  private mcpTools: StructuredToolInterface[] = [];

  // ── 模块启动时初始化 MCP 连接 ─────────────────────
  /**
   * NestJS 模块初始化时调用
   * 1. 创建 MCP 客户端并连接 MCP Server
   * 2. 获取工具列表并转换为 LangChain 格式
   */
  async onModuleInit(): Promise<void> {
    // 创建 MultiServerMCPClient 实例
    // mcpServers: 配置要连接的多个 MCP Server
    this.mcpClient = new MultiServerMCPClient({
      // 连接配置：可以同时连接多个 MCP Server
      mcpServers: {
        // 自定义的本地 MCP Server（stdio 模式）
        // 键名 'local-tools' 是标识符，可以自定义
        'local-tools': {
          transport: 'stdio', // 通信方式：标准输入输出
          command: 'tsx', // 使用 tsx 直接运行 TypeScript
          args: ['src/mcp-server/server.ts'], // 启动参数
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
        },

        // 也可以连接社区现成的 MCP Server（举例，需要单独安装）
        // 例如：文件系统 MCP Server
        // 'filesystem': {
        //   transport: 'stdio',
        //   command: 'npx',
        //   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        // },
      },
    });

    // 核心步骤：将所有 MCP Server 的工具转换为 LangChain Tools 格式
    // 转换后就可以像普通 LangChain Tool 一样使用（bindTools、invoke 等）
    const tools = await this.mcpClient.getTools();
    this.mcpTools = tools as StructuredToolInterface[];

    // 打印加载的工具列表（方便调试）
    console.log(`✅ MCP Agent 已加载 ${this.mcpTools.length} 个工具：`);
    this.mcpTools.forEach((t) => {
      const desc = t.description?.slice(0, 50) ?? '无描述';
      console.log(`   - ${t.name}: ${desc}`);
    });
  }

  // ── Agent 执行（LLM 自主决策调用 MCP 工具）─────────
  /**
   * 运行 Agent 处理用户消息
   *
   * 采用 ReAct 模式（Reasoning + Acting）：
   * 1. LLM 分析用户问题，决定是否需要调用工具
   * 2. 如果需要调用工具，返回工具名称和参数
   * 3. 执行工具，获取结果
   * 4. 将结果返回给 LLM，继续分析
   * 5. 重复直到 LLM 认为不需要更多工具
   *
   * @param userMessage 用户输入的消息
   * @returns 执行结果（包含步骤、轮次、最终回答）
   */
  async runAgent(userMessage: string): Promise<{
    userMessage: string;
    steps: string[];
    totalRounds: number;
    answer: string;
  }> {
    // 检查工具是否已加载
    if (!this.mcpTools.length) {
      return {
        userMessage,
        steps: [],
        totalRounds: 0,
        answer: 'MCP 工具未初始化，请稍后重试',
      };
    }

    // 将 MCP Tools 绑定到 LLM
    // 这样 LLM 就知道有哪些工具可用，并可以生成工具调用请求
    const llmWithTools = this.llm.bindTools(this.mcpTools);

    // 创建工具 Map：通过名称快速找到对应的 Tool 函数
    // 格式：{ 'query_users': ToolFunction, 'read_file': ToolFunction, ... }
    const toolMap = new Map<string, StructuredToolInterface>();
    for (const t of this.mcpTools) {
      toolMap.set(t.name, t);
    }

    // 初始化消息列表
    // SystemMessage: 给 LLM 的系统提示，告诉它有哪些工具可用
    // HumanMessage: 用户的问题
    const messages: BaseMessage[] = [
      new SystemMessage(
        `你是一个智能助手，可以使用以下工具帮助用户：
- query_users：查询用户数据库
- read_file：读取项目文件
- write_file：写入文件
- get_weather：查询城市天气

根据用户的问题，选择合适的工具获取信息后回答。用中文回答。`,
      ),
      new HumanMessage(userMessage),
    ];

    // 记录执行步骤（用于调试和返回给前端）
    const steps: string[] = [];
    let roundCount = 0;

    // Agent 决策循环：最多执行 6 轮（防止无限循环）
    // 每一轮：LLM 分析 → 决定是否调用工具 → 返回结果
    while (roundCount < 6) {
      roundCount++;

      // 调用 LLM（带工具能力）
      // LLM 可能返回：
      // 1. 普通文本回答（不需要调用工具）
      // 2. 工具调用请求（tool_calls）
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      // 获取 tool_calls
      const responseAny = response as unknown as {
        tool_calls?: Array<{
          name: string;
          args: Record<string, unknown>;
          id?: string;
        }>;
      };
      const toolCalls = responseAny.tool_calls;

      // 没有工具调用 → LLM 有最终答案了，跳出循环
      if (!toolCalls?.length) {
        const content =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        steps.push(`💬 [最终回答] ${content}`);
        break;
      }

      // 有工具调用 → 执行每个工具
      for (const toolCall of toolCalls) {
        // 记录：正在调用哪个工具
        steps.push(
          `🔧 [调用MCP工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`,
        );

        // 从工具 Map 中找到对应的工具函数
        const toolFn = toolMap.get(toolCall.name);

        // 工具不存在
        if (!toolFn) {
          const errMsg = `工具不存在：${toolCall.name}`;
          steps.push(`❌ [错误] ${errMsg}`);
          // 告诉 LLM 这个工具调用失败了
          messages.push(
            new ToolMessage({
              content: errMsg,
              tool_call_id: toolCall.id ?? '',
            }),
          );
          continue;
        }

        // 执行 MCP 工具
        // 底层通过 MCP 协议发送请求给 Server，获取结果
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await toolFn.invoke(toolCall.args);
        // 截断过长结果（只保留前 200 字符展示）
        const resultStr =
          typeof result === 'string' ? result : JSON.stringify(result);
        steps.push(`✅ [工具结果] ${resultStr.slice(0, 200)}`);

        // 将工具结果转为 ToolMessage，添加到大消息列表中
        // 下一轮 LLM 会基于这个结果继续分析
        messages.push(
          new ToolMessage({
            content: String(result),
            tool_call_id: toolCall.id ?? '',
          }),
        );
      }
    }

    // 从消息历史中找到最后一个 AI 的回答
    const lastAIMessage = [...messages]
      .reverse()
      .find((m) => m instanceof AIMessage);
    const answer = lastAIMessage
      ? typeof lastAIMessage.content === 'string'
        ? lastAIMessage.content
        : JSON.stringify(lastAIMessage.content)
      : '抱歉，无法完成请求';

    // 返回完整的执行结果
    return {
      userMessage,
      steps,
      totalRounds: roundCount,
      answer,
    };
  }

  // ── 只获取工具列表（不执行）──────────────────────
  /**
   * 获取当前加载的 MCP 工具列表
   * 用于调试或展示给用户
   * @returns 工具名称和描述列表
   */
  listMcpTools(): Array<{ name: string; description: string }> {
    return this.mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
    }));
  }

  // ── 模块销毁时断开连接 ───────────────────────────
  /**
   * NestJS 模块销毁时调用
   * 关闭 MCP Client 连接，释放资源
   */
  async onModuleDestroy(): Promise<void> {
    await this.mcpClient.close();
  }
}
