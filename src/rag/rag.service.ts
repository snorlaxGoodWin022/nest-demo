// src/rag/rag.service.ts

import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { config } from '../config';

@Injectable()
export class RagService {
  // ── 模型初始化 ────────────────────────────────────────
  // 对话模型：RAG 场景用低温度，让回答更严格

  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    temperature: config.llamaCpp.temperature,
    apiKey: 'not-needed', // 添加这一行，本地服务不需要真实 Key
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
  });

  // 向量化模型：把文本转成数字向量（用于相似度比较）

  private embeddings = new OpenAIEmbeddings({
    model: config.llamaCpp.embedModel,
    apiKey: 'not-needed', // 添加这一行，本地服务不需要真实 Key
    configuration: {
      baseURL: config.llamaCpp.embedBaseUrl,
    },
  });

  // 内存向量库（null 表示未初始化）
  private vectorStore: MemoryVectorStore | null = null;
  private docCount = 0;

  // ── 加载文档到向量库 ───────────────────────────────────
  /**
   * 将文档加载到向量知识库中
   *
   * 处理流程：
   * 1. 使用 RecursiveCharacterTextSplitter 将长文档切分成小块
   *    - chunkSize: 每个块的最大字符数（500）
   *    - chunkOverlap: 块之间的重叠字符数（50），避免边界信息丢失
   *    - separators: 切分优先级，从段落->句子->单词->单字
   * 2. 调用 embeddings.embedDocuments() 将所有文本块转换为向量
   * 3. 将向量和文档块存储到 MemoryVectorStore 内存向量库
   *
   * @param documents - 待加载的文档数组，每篇包含 id、content（内容）、source（来源，可选）
   * @returns 加载结果，包含成功状态、原始文档数、总块数
   */
  async loadDocuments(
    documents: { id: string; content: string; source?: string }[],
  ) {
    // 步骤1：创建文本分块器
    // RecursiveCharacterTextSplitter 会递归地按照 separators 数组的顺序切分文本
    // 从最理想的切分点（段落分隔符）开始，直到块大小满足要求
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500, // 每个块最多 500 字符
      chunkOverlap: 50, // 相邻块之间重叠 50 字符，保留上下文连贯性
      separators: [
        '\n\n', // 第一优先：按双换行（段落）切分
        '\n', // 第二优先：按单换行（行）切分
        '。', // 第三优先：按中文句号切分
        '！', // 按感叹号切分
        '？', // 按问号切分
        ' ', // 第四优先：按空格切分（英文单词边界）
        '',
      ], // 最后：按单字符切分（极长单词情况）
    });

    const allDocs: Document[] = [];

    // 步骤2：遍历每篇文档，进行分块处理
    // createDocuments 接受 [文本内容] 和 [元数据数组]，返回一个 Document 对象数组
    // 元数据会附加到每个分块上，用于追踪来源
    for (const doc of documents) {
      const chunks = await splitter.createDocuments(
        [doc.content], // 待切分的文本内容
        [{ source: doc.source || doc.id, docId: doc.id }], // 元数据：来源标识 + 文档ID
      );
      allDocs.push(...chunks);
    }

    // 步骤3：批量向量化并存入内存向量库
    // MemoryVectorStore.fromDocuments 内部会：
    //   a) 调用 embeddings.embedDocuments(allDocs) 将每个文本块转为 1536 维向量（OpenAI ada-002）
    //   b) 将向量与文档内容、元数据一起存入内存 Map 结构

    this.vectorStore = await MemoryVectorStore.fromDocuments(
      allDocs,
      this.embeddings, // 使用配置好的向量化模型
    );
    this.docCount = documents.length;

    return {
      success: true,
      originalDocs: documents.length, // 原始文档数量
      totalChunks: allDocs.length, // 切分后的总块数
      message: `加载 ${documents.length} 篇文档，共 ${allDocs.length} 个块`,
    };
  }

  // ── 纯向量检索（不过大模型，直接看检索结果）──────────
  /**
   * 仅执行向量相似度检索，不调用大模型
   * 用于调试或查看最相关的文档块有哪些
   *
   * 检索原理（余弦相似度）：
   * 1. 将用户查询文本通过 embeddings.embedQuery() 转换为向量
   * 2. 与向量库中所有文档向量计算余弦相似度：cos(θ) = (A·B) / (|A|·|B|)
   * 3. 相似度范围 0~1，值越大表示越相关
   * 4. 按相似度降序排序，返回前 topK 条结果
   *
   * @param query - 用户查询文本
   * @param topK - 返回的最相关结果数量，默认 3
   * @returns 检索结果，包含每条的 content（内容）、source（来源）、score（相似度 0~1）
   */
  async search(query: string, topK = 3) {
    // 检查向量库是否已初始化
    if (!this.vectorStore) return { error: '请先调用 /rag/load 加载文档' };

    // similaritySearchWithScore 执行带评分的相似度搜索
    // 返回格式：[[Document, score], [Document, score], ...]
    // score 是余弦相似度，范围 0~1，越接近 1 表示越相关
    const results = await this.vectorStore.similaritySearchWithScore(
      query,
      topK,
    );

    return {
      query,
      // 映射为更友好的返回格式
      results: results.map(([doc, score]) => ({
        content: doc.pageContent,
        source: doc.metadata.source as string,
        score: parseFloat(score.toFixed(4)),
      })),
    };
  }

  // ── 完整 RAG 问答 ─────────────────────────────────────
  /**
   * 完整的 RAG（Retrieval-Augmented Generation）问答流程
   *
   * RAG 流程说明：
   * - RAG = 检索（Retrieval）+ 生成（Generation）
   * - 核心思想：让大模型基于知识库中的真实内容回答，而非依赖模型内部知识
   * - 优势：避免幻觉（hallucination）、可引用原文、可更新知识库
   *
   * 处理步骤：
   * 1. 检索：从向量库中找到与问题最相关的文档块
   * 2. 构建 Prompt：将检索结果作为上下文（context）插入 Prompt
   * 3. 生成：调用大模型，基于 context 生成回答
   * 4. 返回：回答内容 + 引用来源
   *
   * @param question - 用户问题
   * @param topK - 从知识库检索的相关文档块数量，默认 3
   * @returns 回答内容 + 引用来源列表
   */
  async query(question: string, topK = 3) {
    // 检查向量库是否已初始化
    if (!this.vectorStore) return { error: '请先调用 /rag/load 加载文档' };

    // ── 步骤1：检索相关文档块 ──────────────────────────
    // 使用与 search() 相同的向量相似度搜索
    // similaritySearchWithScore 返回 [[Document, score], ...]
    const retrieved = await this.vectorStore.similaritySearchWithScore(
      question,
      topK,
    );

    // 如果没有检索到任何相关内容，提前返回空结果
    if (!retrieved.length) {
      return { question, answer: '知识库中没有找到相关内容', sources: [] };
    }

    // ── 步骤2：构建上下文字符串 ──────────────────────────
    // 将检索到的文档块拼接成一段上下文文本
    // 每块前加编号 [1]、[2]...，方便模型在回答时引用：
    //   例如："根据[1]的描述，..."
    //
    // 拼接格式：
    //   [1] 第一块内容
    //
    //   [2] 第二块内容
    //
    //   [3] 第三块内容
    const context = retrieved
      .map(([doc], i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n');

    // ── 步骤3：构建 RAG Prompt ──────────────────────────
    // 使用 ChatPromptTemplate 构建带 system 和 human 消息的 Prompt
    //
    // system 消息（系统指令）：
    //   - 明确角色定位：知识库问答助手
    //   - 严格规则：只能基于参考资料回答，不能使用外部知识
    //   - 空结果处理：资料没有相关信息时，明确告知用户
    //
    // human 消息（用户问题）：
    //   - 模板变量 {question} 将被用户实际问题替换
    //   - 模板变量 {context} 将被检索到的文档内容替换
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `你是知识库问答助手，严格基于参考资料回答。
规则：
1. 只根据参考资料内容回答，不能使用资料外的知识
2. 资料中没有相关信息，回答"知识库中暂无相关内容"
3. 回答简洁准确，使用中文

参考资料：
{context}`,
      ],
      ['human', '{question}'],
    ]);

    // ── 步骤4：调用大模型生成回答 ───────────────────────
    // LangChain 的 Pipe 模式（|）将各组件串联成处理链：
    //   prompt → llm → StringOutputParser
    //
    // chain.invoke() 内部执行流程：
    //   a) prompt.invoke({ context, question }) → 生成完整的 Prompt 字符串
    //   b) llm.invoke(promptString) → 调用 llama.cpp API 获取回答
    //   c) StringOutputParser.invoke(response) → 提取文本内容（去除 AIMessage 包装）
    //
    // StringOutputParser 的作用：
    //   LLM 返回的是 AIMessage 对象，直接返回给用户不友好
    //   StringOutputParser.invoke() 会调用 .content 方法提取纯文本
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const answer = await chain.invoke({ context, question });

    // ── 步骤5：返回结果 ─────────────────────────────────
    // 返回结构包含：
    //   - question: 用户原始问题
    //   - answer: AI 生成的回答
    //   - sources: 检索到的文档块列表（包含内容、来源、相似度分数）
    return {
      question,
      answer,
      sources: retrieved.map(([doc, score]) => ({
        content: doc.pageContent,
        source: doc.metadata.source as string,
        score: parseFloat(score.toFixed(4)),
      })),
    };
  }

  /**
   * 获取当前知识库状态
   *
   * @returns 包含 loaded（是否已加载）、docCount（文档数）、message（状态描述）
   */
  getStatus() {
    return {
      loaded: !!this.vectorStore, // 双感叹号转为布尔值
      docCount: this.docCount,
      message: this.vectorStore
        ? `已加载 ${this.docCount} 篇文档`
        : '知识库为空，请先加载文档',
    };
  }

  /**
   * 清空知识库，释放内存
   * 将 vectorStore 置为 null，docCount 归零
   *
   * @returns 成功标志和提示信息
   */
  clearKnowledge() {
    this.vectorStore = null;
    this.docCount = 0;
    return { success: true, message: '知识库已清空' };
  }
}
