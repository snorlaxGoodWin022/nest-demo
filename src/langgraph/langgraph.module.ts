import { Module } from '@nestjs/common';
import { ArticleService } from './article.service';
import { CodeReviewService } from './code-review.service';
import { LanggraphController } from './langgraph.controller';
import { LanggraphService } from './langgraph.service';
import { ParallelService } from './parallel.service';
import { PipelineService } from './pipeline.service';
import { ReactAgentService } from './react-agent.service';
import { RoutingService } from './routing.service';
import { SupervisorService } from './supervisor.service';
import { EmailApprovalService } from './email-approval.service';

@Module({
  providers: [
    LanggraphService,
    ArticleService,
    ReactAgentService,
    RoutingService,
    ParallelService,
    SupervisorService,
    PipelineService,
    CodeReviewService,
    EmailApprovalService,
  ],
  controllers: [LanggraphController],
})
export class LanggraphModule {}
