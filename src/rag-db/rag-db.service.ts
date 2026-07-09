// src/rag/rag.service.ts（PGVector 版本，完整修复）

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import {
  PGVectorStore,
  DistanceStrategy,
} from '@langchain/community/vectorstores/pgvector';
import { Pool } from 'pg';
import { config } from '../config';

@Injectable()
export class RagService implements OnModuleDestroy {
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

  // ✅ 关键：Pool 在 Service 层创建，整个 Service 生命周期内共用一个
  // 不要在每个方法里创建 Pool，更不要在方法里 end() 它
  private pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // 连接池配置（可选，生产环境建议显式配置）
    max: 10, // 最大连接数，根据并发量调整
    idleTimeoutMillis: 30000, // 空闲连接 30 秒后释放
    connectionTimeoutMillis: 5000, // 获取连接超时 5 秒
  });

  // ── PGVector 配置 ─────────────────────────────────────
  /**
   * PGVectorStore 配置项详解
   *
   * PGVectorStore 是 LangChain 提供的 PostgreSQL 向量数据库集成
   * 它在 PostgreSQL 中存储向量嵌入，实现高效的相似度搜索
   *
   * 数据库表结构：
   * - langchain_pg_collection: 存储向量集合（collection）的元信息
   * - langchain_pg_embedding: 存储具体的向量嵌入数据
   */
  private pgVectorConfig = {
    // 【连接池】
    // 传入已有的 pg Pool 实例，避免 PGVectorStore 自己创建新池
    // 优点：统一管理连接生命周期，避免连接泄漏
    pool: this.pool,

    // 【集合名称】
    // 每个 collection 代表一个独立的向量知识库
    // 类似于 MongoDB 的 collection 或 Elasticsearch 的 index
    // 同一 collection 下的向量使用相同的嵌入模型和分块策略
    collectionName: 'rag-knowledge-base',

    // 【集合元数据表】
    // LangChain 自动创建，用于存储 collection 的元信息
    // 表结构：uuid (主键), name (名称), cmetadata (元数据 JSON)
    // 记录该 collection 使用的嵌入模型、创建时间等信息
    collectionTableName: 'langchain_pg_collection',

    // 【向量数据表】
    // 存储实际的文档块和对应的向量嵌入
    // 表结构：
    //   - id: 主键（UUID）
    //   - collection_id: 外键，关联 langchain_pg_collection
    //   - embedding: 向量列（使用 pgvector 类型，维度由嵌入模型决定）
    //   - document: 原始文本内容
    //   - cmetadata: 元数据 JSON（如来源、文档 ID 等）
    tableName: 'langchain_pg_embedding',

    // 【列名映射】
    // 将 LangChain 内部的字段名映射到实际数据库列名
    // 允许开发者自定义列名，符合项目命名规范
    columns: {
      // 主键列：每条向量记录的唯一标识（UUID）
      idColumnName: 'id',

      // 向量列：存储文本嵌入后的向量数据
      // 使用 pgvector 的 vector 类型，支持最多 65535 维
      // Ollama 的 nomic-embed-text 是 768 维向量
      vectorColumnName: 'embedding',

      // 内容列：存储原始文档文本内容
      // 检索时会返回此列的内容作为参考文档
      contentColumnName: 'document',

      // 元数据列：存储文档的附加信息（JSON 格式）
      // 例如：{ "source": "file.pdf", "docId": "xxx", "page": 1 }
      metadataColumnName: 'cmetadata',
    },

    // 【距离策略】
    // 向量相似度计算方式，决定如何判断两个向量"有多像"
    // 可选值：
    //   - cosine (余弦相似度): 最常用，考虑方向而非幅度
    //     公式: cos(θ) = (A·B) / (|A|·|B|)
    //     范围: -1 到 1，1 表示完全相同
    //   - euclidean (欧几里得距离): 直线距离，数值越小越相似
    //     公式: √(Σ(Ai-Bi)²)
    //     范围: 0 到 无穷大，0 表示完全相同
    //   - inner_product (内积): 考虑向量幅度
    //     值越大表示越相似（前提是向量已归一化）
    //
    // 这里选择 cosine 的原因：
    // 1. 不受向量幅度影响，更稳定
    // 2. Ollama 嵌入默认已归一化
    // 3. 符合业界 RAG 场景通用实践
    distanceStrategy: 'cosine' as DistanceStrategy,
  };

  private docCount = 0;

  // ── 加载文档 ────────────────────────────────────────
  async loadDocuments(
    documents: { id: string; content: string; source?: string }[],
  ) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '。', '！', '？', ' ', ''],
    });

    const allDocs: Document[] = [];
    for (const doc of documents) {
      const chunks = await splitter.createDocuments(
        [doc.content],
        [{ source: doc.source || doc.id, docId: doc.id }],
      );
      allDocs.push(...chunks);
    }

    // fromDocuments 内部会从 this.pool 取连接，用完自动归还
    // 不需要手动 end()
    await PGVectorStore.fromDocuments(
      allDocs,
      this.embeddings,
      this.pgVectorConfig,
    );

    this.docCount += documents.length;
    return {
      success: true,
      originalDocs: documents.length,
      totalChunks: allDocs.length,
      message: `已存入 ${documents.length} 篇文档（${allDocs.length} 个块）到 PostgreSQL`,
    };
  }

  // ── 纯向量检索 ────────────────────────────────────
  /**
   * 纯向量检索（不调用大模型）
   *
   * 用途：
   * - 调试：查看检索到的原始文档块
   * - 预览：了解 topK 结果的质量
   * - 轻量场景：只需要相似文档，不需要 AI 生成回答
   *
   * 检索流程：
   * 1. 将用户查询转换为向量（使用 embeddings.embedQuery）
   * 2. 在 PGVector 中执行相似度搜索
   * 3. 返回最相似的 topK 个文档块
   *
   * 向量搜索原理：
   * - 将 query 通过 Ollama embeddings 转成 768 维向量
   * - 与数据库中存储的向量计算余弦距离（cosine distance）
   * - 距离越小 → 相似度越高 → 越相关
   *
   * @param query - 用户查询文本
   * @param topK - 返回最相似的文档块数量，默认 3
   * @returns 包含查询文本和检索结果（内容、来源、相似度）
   */
  async search(query: string, topK = 3) {
    // 初始化 PGVectorStore 连接
    // PGVectorStore.initialize() 内部从 this.pool 获取一个连接
    // 执行完查询后连接自动归还池中，无需手动管理
    //
    // ⚠️ 注意：这里传入的是 this.pool（共享连接池）
    // 而不是新建一个连接，这样能保证整个 Service 生命周期内
    // 只有这一个连接池，避免连接泄漏
    const vectorStore = await PGVectorStore.initialize(
      this.embeddings,
      this.pgVectorConfig,
    );

    // 执行相似度搜索，返回带分数的结果
    // 返回格式：[[Document, distance], [Document, distance], ...]
    // - Document: 包含 pageContent（文本内容）和 metadata（来源等）
    // - distance: 余弦距离，范围 0~2，0 表示完全相同，2 表示完全相反
    const results = await vectorStore.similaritySearchWithScore(query, topK);
    // ⚠️ 重要：不要调用 vectorStore.end()
    // 因为传入的是共享 pool，end() 会关闭连接导致后续查询失败

    // 转换返回格式，将距离转为相似度更直观
    // 相似度 = 1 - 距离（距离 0→相似度 1，距离 2→相似度 0）
    return {
      query, // 原样返回用户查询，便于前端展示
      results: results.map(([doc, score]) => ({
        // 文档内容：检索到的文本块
        content: doc.pageContent,
        // 来源信息：加载时传入的 metadata（如文件名、文档 ID）
        source: doc.metadata.source,
        // 相似度：1 - distance，转为 0~1 的小数
        // 例如：distance=0.1 → similarity=0.9（非常相关）
        //       distance=0.8 → similarity=0.2（不太相关）
        similarity: parseFloat((1 - score).toFixed(4)),
        // 原始距离：余弦距离值，范围 0~2
        // 保留原始值便于需要精确计算的场景
        rawDistance: parseFloat(score.toFixed(4)),
      })),
    };
  }

  // ── 完整 RAG 问答 ─────────────────────────────────
  async query(question: string, topK = 3) {
    const vectorStore = await PGVectorStore.initialize(
      this.embeddings,
      this.pgVectorConfig,
    );
    // ❌ 同样不要 end()

    const retrieved = await vectorStore.similaritySearchWithScore(
      question,
      topK,
    );

    // score 是距离，越小越相关
    // 过滤掉距离 > 0.5 的结果（相似度 < 0.5，基本不相关）
    const filtered = retrieved.filter(([, score]) => score <= 0.5);

    if (!filtered.length) {
      return { question, answer: '知识库中没有找到相关内容', sources: [] };
    }

    const context = filtered
      .map(([doc], i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n');

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

    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const answer = await chain.invoke({ context, question });

    return {
      question,
      answer,
      sources: filtered.map(([doc, score]) => ({
        content: doc.pageContent,
        source: doc.metadata.source,
        similarity: parseFloat((1 - score).toFixed(4)),
      })),
    };
  }

  // ── 获取知识库状态 ───────────────────────────────────
  /**
   * 获取当前知识库的状态信息
   *
   * 查询逻辑：
   * 1. 先通过 collection name 在 langchain_pg_collection 表中找到对应的 uuid
   * 2. 用这个 uuid 在 langchain_pg_embedding 表中统计关联的向量数量
   *
   * SQL 解析：
   * ```sql
   * SELECT COUNT(*) FROM langchain_pg_embedding
   * WHERE collection_id = (
   *   SELECT uuid FROM langchain_pg_collection WHERE name = $1
   * )
   * ```
   *
   * 表关联关系：
   * langchain_pg_collection (uuid, name, cmetadata)
   *        ↓
   *        uuid (作为外键)
   *        ↓
   * langchain_pg_embedding (id, collection_id, embedding, document, cmetadata)
   *
   * @returns 状态对象，包含：
   *   - mode: 存储模式（PGVectorStore）
   *   - loaded: 是否已加载文档
   *   - chunkCount: 文档块数量
   *   - collection: collection 名称
   *   - message: 状态描述信息
   */
  async getStatus() {
    try {
      // 执行计数查询
      // 使用子查询：先找 collection 的 uuid，再统计该 collection 下的向量数量
      // $1 是参数占位符，传入 collectionName（防止 SQL 注入）
      const result = await this.pool.query(
        `SELECT COUNT(*) FROM langchain_pg_embedding
         WHERE collection_id = (
           SELECT uuid FROM langchain_pg_collection WHERE name = $1
         )`,
        [this.pgVectorConfig.collectionName],
      );

      // COUNT(*) 返回的是字符串，需要转为数字
      const chunkCount = parseInt(result.rows[0].count);

      return {
        mode: 'PGVectorStore', // 标识当前使用的是 PGVector 存储模式
        loaded: chunkCount > 0, // 有数据则为 true
        chunkCount, // 文档块总数
        collection: this.pgVectorConfig.collectionName, // collection 名称
        message:
          chunkCount > 0
            ? `PostgreSQL 向量库中有 ${chunkCount} 个文档块`
            : '向量库为空，请先加载文档',
      };
    } catch {
      // 如果查询失败（表不存在、数据库未初始化等），返回未初始化状态
      // 这里捕获异常而不是让它们冒泡，是为了给前端一个友好的提示
      return {
        mode: 'PGVectorStore',
        loaded: false,
        message: '向量表未初始化',
      };
    }
  }

  async clearKnowledge() {
    await this.pool.query(
      `DELETE FROM langchain_pg_embedding
       WHERE collection_id = (
         SELECT uuid FROM langchain_pg_collection WHERE name = $1
       )`,
      [this.pgVectorConfig.collectionName],
    );
    await this.pool.query(
      `DELETE FROM langchain_pg_collection WHERE name = $1`,
      [this.pgVectorConfig.collectionName],
    );
    this.docCount = 0;
    return {
      success: true,
      message: `已清空 collection：${this.pgVectorConfig.collectionName}`,
    };
  }

  // ✅ NestJS 应用退出时才真正关闭连接池
  async onModuleDestroy() {
    await this.pool.end();
    console.log('RagService：PostgreSQL 连接池已关闭');
  }
}
