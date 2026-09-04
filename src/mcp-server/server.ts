/**
 * MCP Server 主入口
 *
 * 这是一个独立的进程服务器，不是 NestJS 模块
 * 使用 @modelcontextprotocol/sdk 与 MCP Client 通信
 *
 * 通信方式：stdio（标准输入输出）
 * - stdin: 接收来自 Client 的请求
 * - stdout: 向 Client 发送响应
 * - stderr: 打印日志（不影响协议）
 *
 * 提供的工具：
 * 1. query_users - 查询用户列表
 * 2. read_file - 读取文件
 * 3. write_file - 写入文件
 * 4. get_weather - 查询天气
 */

// 适配 @modelcontextprotocol/sdk 1.29.0
// 变更：server.tool() → server.registerTool()

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { handleDatabaseQuery } from './tools/database.tool';
import { handleFileOperation } from './tools/file.tool';
import { handleWeatherQuery } from './tools/weather.tool';

// 创建 MCP Server 实例
const server = new McpServer({
  name: 'nestjs-demo-mcp-server',
  version: '1.0.0',
});

// ── 工具一：数据库查询 ─────────────────────────────────────
// 工具名称：query_users
// 功能：查询用户列表，支持按姓名模糊搜索和角色过滤
// 参数：
//   - name (可选)：按姓名模糊搜索
//   - role (可选)：按角色过滤 (admin | user)
//   - limit (可选)：返回条数限制，默认 5，最大 20
server.registerTool(
  'query_users',
  {
    description:
      '查询用户列表，支持按姓名模糊搜索和角色过滤。返回用户 ID、姓名、邮箱、角色。',
    inputSchema: {
      name: z.string().optional().describe('按姓名模糊搜索，可选'),
      role: z.enum(['admin', 'user']).optional().describe('按角色过滤，可选'),
      limit: z.number().optional().describe('返回条数限制，默认 5，最大 20'),
    },
  },
  async (args) => {
    try {
      const result = await handleDatabaseQuery(args);
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error: any) {
      return {
        content: [
          { type: 'text' as const, text: `工具执行失败：${error.message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具二：读取文件 ──────────────────────────────────────
// 工具名称：read_file
// 功能：读取指定路径的文件内容，只能读取项目目录下的文件
// 参数：
//   - path：文件相对路径，例如：README.md、src/config.ts
server.registerTool(
  'read_file',
  {
    description: '读取指定路径的文件内容，只能读取项目目录下的文件。',
    inputSchema: {
      path: z.string().describe('文件相对路径，例如：README.md、src/config.ts'),
    },
  },
  async (args) => {
    try {
      const result = await handleFileOperation('read', args);
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error: any) {
      return {
        content: [
          { type: 'text' as const, text: `工具执行失败：${error.message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具三：写入文件 ──────────────────────────────────────
// 工具名称：write_file
// 功能：向指定文件写入内容（追加模式）
// 参数：
//   - path：文件相对路径
//   - content：要写入的内容
server.registerTool(
  'write_file',
  {
    description: '向指定文件写入内容（追加模式）。',
    inputSchema: {
      path: z.string().describe('文件相对路径'),
      content: z.string().describe('要写入的内容'),
    },
  },
  async (args) => {
    try {
      const result = await handleFileOperation('write', args);
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error: any) {
      return {
        content: [
          { type: 'text' as const, text: `工具执行失败：${error.message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具四：天气查询 ──────────────────────────────────────
// 工具名称：get_weather
// 功能：获取指定城市的实时天气信息，包括温度、天气状况、湿度
// 参数：
//   - city：城市名称，例如：北京、上海、武汉
server.registerTool(
  'get_weather',
  {
    description: '获取指定城市的实时天气信息，包括温度、天气状况、湿度。',
    inputSchema: {
      city: z.string().describe('城市名称，例如：北京、上海、武汉'),
    },
  },
  async (args) => {
    try {
      const result = await handleWeatherQuery(args);
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error: any) {
      return {
        content: [
          { type: 'text' as const, text: `工具执行失败：${error.message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 启动（stdio 模式）─────────────────────────────────────
/**
 * 主函数：启动 MCP Server
 *
 * 工作流程：
 * 1. 创建 stdio 传输层（标准输入输出通信）
 * 2. 连接 Server 和 Transport
 * 3. 打印启动日志到 stderr
 *
 * 注意：
 * - stdio 模式下只能用 console.error 输出日志
 * - console.log 会污染 stdout 破坏 MCP 通信协议
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] 已启动，等待 Client 连接...');
}

main().catch(console.error);
