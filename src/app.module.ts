import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChainsModule } from './chains/chains.module';
import { DemoModule } from './demo/demo.module';
import { FunctionCallingModule } from './function-calling/function-calling.module';
import { LanggraphModule } from './langgraph/langgraph.module';
import { McpAgentModule } from './mcp-agent/mcp-agent.module';
import { McpClientModule } from './mcp-client/mcp-client.module';
import { MemoryModule } from './memory/memory.module';
import { ModelsModule } from './models/models.module';
import { PostModule } from './post/post.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromptsModule } from './prompts/prompts.module';
import { RagDbModule } from './rag-db/rag-db.module';
import { RagModule } from './rag/rag.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    DemoModule,
    PrismaModule,
    PostModule,
    UserModule,
    ModelsModule,
    PromptsModule,
    ChainsModule,
    AgentsModule,
    MemoryModule,
    RagModule,
    FunctionCallingModule,
    RagDbModule,
    McpClientModule,
    McpAgentModule,
    LanggraphModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
