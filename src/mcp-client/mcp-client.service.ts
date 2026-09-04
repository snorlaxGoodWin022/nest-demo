/**
 * MCP Client Service
 *
 * 使用 @modelcontextprotocol/sdk 直接调用 MCP Server
 *
 * 功能：
 * - 启动时自动连接 MCP Server（子进程方式）
 * - 获取 MCP Server 提供的工具列表
 * - 调用 MCP Server 的工具并获取结果
 * - 模块销毁时自动断开连接
 *
 * 通信方式：
 * - 通过 stdio（标准输入输出）与 MCP Server 通信
 * - NestJS 作为 Client，MCP Server 作为子进程运行
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  // MCP SDK 客户端实例
  private client: Client;
  // stdio 传输层（用于与子进程通信）
  private transport: StdioClientTransport;

  // ── 模块启动时连接 MCP Server ──────────────────────
  /**
   * NestJS 模块初始化时调用
   * 创建 MCP Client 并连接到 MCP Server
   */
  async onModuleInit() {
    // 创建 MCP Client 实例
    this.client = new Client(
      { name: 'nestjs-mcp-client', version: '1.0.0' },
      { capabilities: {} },
    );

    // 配置 stdio 传输层：以子进程方式启动 MCP Server
    // command: 启动命令（ts-node）
    // args: 启动参数（MCP Server 入口文件）
    // env: 传递给子进程的环境变量（包含 DATABASE_URL 等）
    this.transport = new StdioClientTransport({
      command: 'tsx',
      args: ['src/mcp-server/server.ts'],
      // 把当前环境变量传给子进程（包含 DATABASE_URL 等）
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    });

    // 连接 Client 和 Server
    await this.client.connect(this.transport);
    console.log('✅ MCP Client 已连接到 MCP Server');
  }

  // ── 获取所有可用工具列表 ──────────────────────────
  /**
   * 获取 MCP Server 注册的所有工具
   * @returns 工具列表（名称、描述、参数模式）
   */
  async listTools() {
    //listTools() 是 MCP SDK 的内置方法，用于获取 MCP Server 注册的所有工具列表。
    const response = await this.client.listTools();
    return response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  // ── 调用指定工具 ──────────────────────────────────
  /**
   * 调用 MCP Server 上的工具
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   */
  async callTool(toolName: string, args: Record<string, any>) {
    // 调用工具
    const response = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    // MCP 响应里 content 是数组，取第一个 text 内容
    // 格式：{ content: [{ type: 'text', text: '...' }], isError: boolean }
    const content = response.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((c) => c.type === 'text');
    return {
      tool: toolName,
      result: textContent?.text ?? '工具无返回内容',
      isError: response.isError ?? false,
    };
  }

  // ── 应用退出时断开连接 ─────────────────────────────
  /**
   * NestJS 模块销毁时调用
   * 关闭 MCP Client 连接
   */
  async onModuleDestroy() {
    await this.client.close();
    console.log('MCP Client 已断开连接');
  }
}
