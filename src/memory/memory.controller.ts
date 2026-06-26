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

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('chat')
  chat(@Body() body: { sessionId: string; message: string }) {
    return this.memoryService.chat(body.sessionId, body.message);
  }

  @Post('chat-stream')
  async chatStream(@Body() body: { sessionId: string; message: string }) {
    const stream = await this.memoryService.chatStream(
      body.sessionId,
      body.message,
    );
    return new StreamableFile(stream, {
      type: 'text/plain',
      disposition: 'inline; filename="stream.txt"',
    });
  }

  @Get('history/:sessionId')
  getHistory(@Param('sessionId') sessionId: string) {
    return this.memoryService.getHistory(sessionId);
  }

  @Delete('history/:sessionId')
  deleteHistory(@Param('sessionId') sessionId: string) {
    return this.memoryService.deleteHistory(sessionId);
  }

  @Get('sessions')
  listSessions() {
    return this.memoryService.listSessions();
  }
}
