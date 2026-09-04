/**
 * MCP Client Module
 *
 * NestJS 模块，用于集成 MCP Client 功能
 *
 * 功能：
 * - 提供 McpClientService 服务
 * - 启动时自动连接 MCP Server
 * - 导出服务供其他模块使用
 *
 * 使用方式：
 * 在 AppModule 中导入即可：
 * ```typescript
 * import { McpClientModule } from './mcp-client/mcp-client.module';
 *
 * @Module({
 *   imports: [McpClientModule],
 * })
 * export class AppModule {}
 * ```
 *
 * 或在其他模块中导入以使用服务：
 * ```typescript
 * constructor(private mcpClientService: McpClientService) {}
 * ```
 */

import { Module } from '@nestjs/common';
import { McpClientController } from './mcp-client.controller';
import { McpClientService } from './mcp-client.service';

@Module({
  // 控制器：处理 HTTP 请求
  controllers: [McpClientController],
  // 服务提供者：核心业务逻辑
  providers: [McpClientService],
  // 导出服务：供其他模块注入使用
  exports: [McpClientService],
})
export class McpClientModule {}
