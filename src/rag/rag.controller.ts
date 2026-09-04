// src/rag/rag.controller.ts

import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { RagService } from './rag.service';

class LoadDocumentsDto {
  @IsArray()
  documents!: { id: string; content: string; source?: string }[];
}

class SearchDto {
  @IsString()
  query!: string;

  @IsOptional()
  topK?: number;
}

class QueryDto {
  @IsString()
  question!: string;

  @IsOptional()
  topK?: number;
}

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('load')
  loadDocuments(@Body() body: LoadDocumentsDto) {
    return this.ragService.loadDocuments(body.documents);
  }

  @Post('search') //纯向量检索（不调用大模型，直接看检索结果）
  search(@Body() body: SearchDto) {
    return this.ragService.search(body.query, body.topK);
  }

  @Post('query')
  query(@Body() body: QueryDto) {
    return this.ragService.query(body.question, body.topK);
  }

  @Get('status') //获取状态
  getStatus() {
    return this.ragService.getStatus();
  }

  @Delete('clear') //清除
  clearKnowledge() {
    return this.ragService.clearKnowledge();
  }
}
