import { Body, Controller, Post, Res } from '@nestjs/common';
import { ModelsService } from './models.service';

import type { Response } from 'express';

@Controller('models') //路径前缀 /models
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Post('chat') // 路由是 /models/chat  post方法
  async basicChat(@Body() body: { message: string }) {
    const { message } = body;
    return await this.modelsService.basicChat(message);
  }

  @Post('chat-system') //路由是 /models/chat-system
  async chatWithSystem(@Body() body: { system: string; message: string }) {
    const { system, message } = body;
    return await this.modelsService.chatWithSystem(system, message);
  }

  @Post('chat-stream')
  async chatStream(@Body() body: { message: string }, @Res() res: Response) {
    const { message } = body;
    return await this.modelsService.chatStream(message, res);
  }

  @Post('chat-parser')
  async chatWithParser(@Body() body: { message: string }) {
    const { message } = body;
    // 这里可以调用一个专门的解析函数，处理模型的回答
    return await this.modelsService.chatWithParser(message);
  }
}
