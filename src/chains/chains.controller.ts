import { Body, Controller, Post } from '@nestjs/common';
import { ChainsService } from './chains.service';

/**
 * ChainsController - 链式调用控制器
 *
 * 用途：处理与 LangChain 多步骤链式调用相关的 HTTP 请求
 *
 * 链式调用（Chain）概念：
 * - 将多个 LLM 调用按顺序组合，形成一个完整的工作流程
 * - 前一步的输出可以作为下一步的输入，实现复杂任务
 * - 例如：分析问题 → 润色文章 → 返回结果
 */
@Controller('chains')
export class ChainsController {
  // 依赖注入 ChainsService 来处理业务逻辑
  constructor(private readonly chainsService: ChainsService) {}

  /**
   * POST /chains/polish - 文章润色接口
   *
   * 工作流程：
   * 1. 接收原始文章内容
   * 2. 调用 ChainsService 进行多步骤处理
   * 3. 返回原始文章和润色后的结果
   *
   * @param body.article - 要润色的原始文章
   * @returns 包含原始文章和润色后文章的响应
   */
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
