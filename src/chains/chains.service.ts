import { ChatOpenAI } from '@langchain/openai'; // [Llama.cpp] llama-server HTTP 服务（与 Ollama API 兼容）
// import { ChatOpenAI } from '@langchain/openai'; // [Ollama] 原始代码
import { Injectable } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnableSequence,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { config } from '../config';

/**
 * ChainsService - 链式调用服务
 *
 * 核心概念：LangChain 的链式调用（Chains）
 * ======================================
 * LangChain 提供了 Runnable 接口来创建可组合的链式调用。
 * 主要组件：
 *
 * 1. RunnableSequence - 顺序执行多个步骤
 *    - 将多个 Runnable 按顺序连接
 *    - 前一步的输出自动作为下一步的输入
 *
 * 2. RunnablePassthrough - 透传数据
 *    - 将输入原封不动传递给下一步
 *    - 用于在复杂链中保留原始数据
 *
 * 3. .pipe() 方法 - 管道连接
 *    - A.pipe(B) 表示 A 的输出作为 B 的输入
 *    - 语法糖，等同于 RunnableSequence.from([A, B])
 *
 * 本服务实现的多步骤链：
 * ┌─────────────────────────────────────────────┐
 * │  输入: article (原始文章)                  │
 * │         ↓                                   │
 * │  步骤1: analyzeChain (分析问题)             │
 * │         → LLM 分析文章存在的问题             │
 * │         ↓                                   │
 * │  输出: issues (问题列表)                     │
 * │         ↓                                   │
 * │  步骤2: polishChain (润色文章)              │
 * │         → 基于问题列表润色原文               │
 * │         ↓                                   │
 * │  输出: polished (润色后的文章)               │
 * └─────────────────────────────────────────────┘
 */
@Injectable()
export class ChainsService {
  // ========== LLM 实例配置 ==========
  // [Llama.cpp] 使用本地 llama-server.exe 启动的 HTTP 服务
  // 服务地址：http://localhost:8081
  // 模型：Llama-3.2-1B-Instruct-Q4_K_M
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    openAIApiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: config.llamaCpp.temperature,
  });

  // 输出解析器：将 LLM 的 AIMessage 转为纯字符串
  private parser = new StringOutputParser();

  // ── 多步骤链：文章润色（分析问题 → 润色文章）──────────
  // RunnableSequence：把多个步骤组合成顺序链
  // RunnablePassthrough：透传输入值（用于在分叉步骤保留原始输入）

  /**
   * polishArticle - 文章润色核心方法
   *
   * 实现两步骤的链式调用：
   * 1. 分析文章存在的问题（analyzeChain）
   * 2. 根据问题列表润色文章（polishChain）
   *
   * @param article - 原始文章内容
   * @returns 包含原始文章和润色后文章的对象
   */
  async polishArticle(article: string) {
    // ========== 步骤1：定义分析提示词 ==========
    // ChatPromptTemplate.fromMessages() 创建多消息格式的提示词
    // 格式：[角色, 消息内容]
    // 角色：system（系统设定）、human（用户输入）
    const analyzePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，只输出问题列表，不要其他内容'],
      ['human', '分析这篇文章存在的问题:\n\n{article}'],
    ]);

    // ========== 步骤2：定义润色提示词 ==========
    // 注意这里有两个变量：{article}原文 和 {issues}问题列表
    const polishPrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，根据问题列表润色原文，保持原意'],
      ['human', '原文:\n{article},\n问题:{issues},\n\n请输出润色后的文章'],
    ]);

    // ========== 构建分析链 ==========
    // analyzePrompt.pipe(this.llm).pipe(this.parser)
    // 含义：提示词 → LLM处理 → 解析输出
    // 管道操作 (.pipe) 将前一个 Runnable 的输出作为下一个的输入
    const analyzeChain = analyzePrompt.pipe(this.llm).pipe(this.parser);

    // ========== 构建完整链 ==========
    // RunnableSequence.from() 创建顺序执行的链
    // 输入 { article: "原文" } 会同时传递给两个分支：
    //   - article: RunnablePassthrough() → 直接透传原文
    //   - issues: analyzeChain → 分析得到问题列表
    const fullChain = RunnableSequence.from([
      {
        article: new RunnablePassthrough(), // 原文直接透传，不做任何处理
        issues: analyzeChain, // 问题列表（来自分析链的输出）
      },
      // 第二步：使用 polishPrompt 处理，接收 {article, issues}
      polishPrompt.pipe(this.llm).pipe(this.parser),
    ]);

    // ========== 执行链 ==========
    // invoke() 是同步执行方法，输入 article 对象，返回润色后的结果
    // 注意：需要传入对象 { article: string }，因为链的第一部分使用 RunnablePassthrough 透传 article
    const result = await fullChain.invoke({ article });

    // 返回原始文章和润色后的文章
    return { origin: article, polished: result };
  }

  async generateBlog(keywords: string, style: string) {
    const outlineChain = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，只输出大纲，不要正文。'],
      ['human', '根据关键词"{keywords}"生成一个{style}大纲。'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const articleChain = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，按照大纲写完整文章。'],
      ['human', '请根据大纲{outline}生成一篇完整的博客文章'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const titleChain = ChatPromptTemplate.fromMessages([
      ['system', '你是SEO专家，只输出5个候选标题。'],
      ['human', '请根据文章生成3个吸引人的标题:\n\n{content}'],
    ]);

    const outline = await outlineChain.invoke({ keywords, style });
    const article = await articleChain.invoke({ outline });
    const titles = await titleChain.invoke({ content: article });

    return {
      keywords,
      style,
      outline,
      article,
      seoTitle: titles,
    };
  }

  async smartRouter(question: string) {
    //第一步：分类
    const classifyChain = ChatPromptTemplate.fromMessages([
      [
        'system',
        `
      分析用户问题，只输出分类标签：技术问题 -> TECH
      退款问题 -> REFUND
      投诉建议 -> COMPLAINT
      其他 -> OTHER`,
      ],
      ['human', '{question}'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const category = (await classifyChain.invoke({ question })).trim();

    //第二步，根据分类选对应的prompt
    const systemMap: Record<string, string> = {
      TECH: '你是技术支持专家，给出具体操作步骤。',
      REFUND: '你是退款专员，引导完成退款流程，态度友好。',
      COMPLAINT: '你是客户关系专员，认真对待投诉，给出解决方案。',
      OTHER: '你是通用客服，友好回答各类问题。',
    };
    const systemPrompt = systemMap[category] || systemMap.OTHER;

    const answerChain = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', '{question}'],
    ]);

    const answer = await answerChain.invoke({ question });
    return { question, category, answer };
  }
}
