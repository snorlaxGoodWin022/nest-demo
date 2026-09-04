import { Module } from '@nestjs/common';
import { RagDbController } from './rag-db.controller';
import { RagService } from './rag-db.service';

@Module({
  controllers: [RagDbController],
  providers: [RagService],
})
export class RagDbModule {}
