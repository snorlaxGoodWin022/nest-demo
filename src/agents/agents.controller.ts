import { Controller, Post } from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}
  @Post('run')
  runAgent(message: string) {
    return this.agentsService.runAgent(message);
  }
}
