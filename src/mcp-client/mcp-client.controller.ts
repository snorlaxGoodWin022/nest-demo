/**
 * MCP Client Controller
 *
 * 提供 REST API 接口供外部调用 MCP 工具
 *
 * 接口：
 * - GET  /mcp/tools  - 获取所有可用工具列表
 * - POST /mcp/call   - 调用指定工具
 *
 * 注意：此 Controller 仅在需要通过 HTTP API 调用 MCP 工具时使用
 * 如果只在 NestJS 内部使用，可直接注入 McpClientService
 */

import { Controller, Get, Post, Body } from '@nestjs/common';
import { McpClientService } from './mcp-client.service';

@Controller('mcp')
export class McpClientController {
  // 依赖注入 McpClientService
  constructor(private readonly mcpClientService: McpClientService) {}

  // GET /mcp/tools → 获取所有可用工具
  /**
   * 获取 MCP Server 注册的所有工具列表
   * @returns 工具数组，包含名称、描述、参数模式
   */
  @Get('tools')
  listTools() {
    return this.mcpClientService.listTools();
  }

  // POST /mcp/call → 直接调用指定工具
  /**
   * 调用 MCP Server 上的指定工具
   * @param body 请求体
   *   - tool: 工具名称（如 'query_users', 'read_file', 'get_weather'）
   *   - args: 工具参数对象
   * @returns 工具执行结果
   */
  @Post('call')
  callTool(@Body() body: { tool: string; args: Record<string, any> }) {
    return this.mcpClientService.callTool(body.tool, body.args);
  }
}
