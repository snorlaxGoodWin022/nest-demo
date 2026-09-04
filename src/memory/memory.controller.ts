import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { MemoryService } from './memory.service';

@Controller('memory') //前缀
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('chat') // 多轮对话（普通）
  chat(@Body() body: { sessionId: string; message: string }) {
    return this.memoryService.chat(body.sessionId, body.message);
  }

  @Post('chat-stream') //多轮对话 -流式
  async chatStream(@Body() body: { sessionId: string; message: string }) {
    const stream = await this.memoryService.chatStream(
      body.sessionId,
      body.message,
    );
    //把 Node 的流包装成 HTTP 响应返回给前端 。
    /**
     * StreamableFile 是 NestJS 给"流式 HTTP 响应"提供的适配器,
     * 把 Node 的 Readable 流变成边吐边发给浏览器的实时响应,
     * 实现 ChatGPT 那种打字机效果。
     */
    return new StreamableFile(stream, {
      type: 'text/plain', // ① 响应类型
      disposition: 'inline; filename="stream.txt"', // ② 浏览器怎么处理
    });
  }

  @Get('history/:sessionId') // 获取对话历史
  getHistory(@Param('sessionId') sessionId: string) {
    return this.memoryService.getHistory(sessionId);
  }

  @Delete('history/:sessionId') // 删除对话历史
  deleteHistory(@Param('sessionId') sessionId: string) {
    return this.memoryService.deleteHistory(sessionId);
  }

  @Get('sessions')
  listSessions() {
    return this.memoryService.listSessions();
  }
}
