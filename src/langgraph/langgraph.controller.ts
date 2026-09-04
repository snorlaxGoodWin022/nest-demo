import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ArticleService } from './article.service';
import { CodeReviewService } from './code-review.service';
import { EmailApprovalService } from './email-approval.service';
import { LanggraphService } from './langgraph.service';
import { ParallelService } from './parallel.service';
import { PipelineService } from './pipeline.service';
import { ReactAgentService } from './react-agent.service';
import { RoutingService } from './routing.service';
import { SupervisorService } from './supervisor.service';

@Controller('langgraph')
export class LanggraphController {
  constructor(
    private readonly langgraphService: LanggraphService,
    private readonly articleService: ArticleService,
    private readonly reactAgentService: ReactAgentService,
    private readonly routingService: RoutingService,
    private readonly parallelService: ParallelService,
    private readonly supervisorService: SupervisorService,
    private readonly pipelineService: PipelineService,
    private readonly codeReviewService: CodeReviewService,
    private readonly emailApprovalService: EmailApprovalService,
  ) {}

  @Post('simple-chat')
  async simpleChat(@Body() body: { message: string }) {
    const answer = await this.langgraphService.simpleChat(body.message);
    return { answer };
  }

  @Post('memory-chat')
  memoryChat(@Body() body: { message: string; threadId: string }) {
    return this.langgraphService
      .memoryChat(body.message, body.threadId)
      .then((answer) => ({ answer }));
  }

  @Get('get-history/:threadId')
  async getHistory(@Param('threadId') threadId: string) {
    const messages = await this.langgraphService.getHistory(threadId);
    return { messages };
  }

  @Post('article')
  async article(@Body() body: { article: string }) {
    return this.articleService.process(body.article);
  }

  @Post('react-chat')
  async reactChat(@Body() body: { threadId: string; message: string }) {
    const answer = await this.reactAgentService.chat(
      body.threadId,
      body.message,
    );
    return { answer };
  }

  @Post('route')
  async route(@Body() body: { input: string }) {
    const answer = await this.routingService.handle(body.input);
    return { answer };
  }
  @Post('parallel')
  parallel(@Body() body: { task: string }) {
    return this.parallelService.paralleChat(body.task);
  }

  //mulit-agent 3份工作流
  @Post('supervisor')
  supervisor(@Body() body: { input: string }) {
    return this.supervisorService.run(body.input);
  }

  @Post('pipeline')
  pipeline(@Body() body: { topic: string }) {
    return this.pipelineService.creteContent(body.topic);
  }

  @Post('code-review')
  codeReview(@Body() body: { code: string; language?: string }) {
    return this.codeReviewService.review(body.code, body.language);
  }
  // 邮件审批
  @Post('email/start')
  emailStart(@Body() body: { request: string; threadId: string }) {
    return this.emailApprovalService.start(body.request, body.threadId);
  }
  @Post('email/:threadId/approve')
  emailApprove(@Param('threadId') threadId: string) {
    return this.emailApprovalService.approve(threadId);
  }
  @Post('email/:threadId/reject')
  emailReject(@Param('threadId') threadId: string) {
    return this.emailApprovalService.reject(threadId);
  }
  @Post('email/:threadId/modify')
  emailModify(
    @Param('threadId') threadId: string,
    @Body() body: { feedback: string },
  ) {
    return this.emailApprovalService.requestModify(threadId, body.feedback);
  }
  @Get('email/:threadId/state')
  emailState(@Param('threadId') threadId: string) {
    return this.emailApprovalService.getState(threadId);
  }
}
