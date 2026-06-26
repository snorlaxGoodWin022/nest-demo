// src/rag/rag.controller.ts

import { Controller, Post, Get, Delete, Body } from '@nestjs/common';
import { RagService } from './rag.service';
import { IsArray, IsOptional, IsString } from 'class-validator';

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

  @Post('search')
  search(@Body() body: SearchDto) {
    return this.ragService.search(body.query, body.topK);
  }

  @Post('query')
  query(@Body() body: QueryDto) {
    return this.ragService.query(body.question, body.topK);
  }

  @Get('status')
  getStatus() {
    return this.ragService.getStatus();
  }

  @Delete('clear')
  clearKnowledge() {
    return this.ragService.clearKnowledge();
  }
}
