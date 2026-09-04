import { Body, Controller, Post } from '@nestjs/common';
import { ChainsService } from './chains.service';

@Controller('chains') //路由前缀chains
export class ChainsController {
  // 依赖注入 ChainsService 来处理业务逻辑
  constructor(private readonly chainsService: ChainsService) {}

  @Post('polish')
  polish(@Body() body: { article: string }) {
    return this.chainsService.polishArticle(body.article);
  }
  @Post('blog')
  generateBlog(@Body() body: { keywords: string; style: string }) {
    return this.chainsService.generateBlog(body.keywords, body.style);
  }
  @Post('router')
  smartRouter(@Body() body: { question: string }) {
    return this.chainsService.smartRouter(body.question);
  }
}
