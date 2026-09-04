import { ChatOpenAI } from '@langchain/openai'; // [Llama.cpp] llama-server HTTP 服务（与 Ollama API 兼容）
// import { ChatOpenAI } from '@langchain/openai'; // [Ollama] 原始代码
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import { Injectable } from '@nestjs/common';
import { config } from '../config';

/**
 * ChainsService - 链式调用服务
 * LangChain 提供了 Runnable 接口来创建可组合的链式调用。
 * 主要组件：
 * 1. RunnableSequence - 顺序执行多个步骤
 *    - 将多个 Runnable 按顺序连接
 *    - 前一步的输出自动作为下一步的输入

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
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    apiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: config.llamaCpp.temperature,
  });

  // 输出解析器：将 LLM 的 AIMessage 转为纯字符串
  private parser = new StringOutputParser();
  // ── Chain 一：简单线性链 ────────────────────────────────
  // 场景：文章润色（分析 → 润色）
  async polishArticle(article: string) {
    // 第一步：分析文章问题
    const analyzePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，只输出问题列表，不要其他内容。'],
      ['human', '分析这篇文章存在哪些问题：\n\n{article}'],
    ]);

    // 第二步：根据问题列表润色文章
    const polishPrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，根据问题列表润色原文，保持原意。'],
      [
        'human',
        '原文：\n{article}\n\n问题列表：\n{issues}\n\n请输出润色后的文章：',
      ],
    ]);

    // 第一条链：article → 分析问题 → issues 字符串
    const analyzeChain = analyzePrompt.pipe(this.llm).pipe(this.parser);

    // 第二条链：{ article, issues } → 润色文章 → 最终文章
    const polishChain = polishPrompt.pipe(this.llm).pipe(this.parser);

    // ── 组装完整链：RunnableSequence.from([...]) ──────────────
    // RunnableSequence 会按顺序依次执行数组里的每个步骤：
    //   第 1 步的输出对象，会原封不动作为第 2 步的输入。
    // 目标：把「原文 article」和「分析结果 issues」打包成同一个
    // 对象 { article, issues }，交给第 2 步的润色链使用。
    const fullChain = RunnableSequence.from([
      // ── 步骤一：RunnablePassthrough.assign 合并数据 ──
      // RunnablePassthrough.assign({ 字段: 子链 }) 会做两件事：
      //   1. 保留传入的原始对象（相当于浅拷贝展开 { ...输入 }）
      //   2. 并行执行其中的子链，把返回值挂到对应的新字段上
      // 效果：输入 { article } → 输出 { article, issues }
      RunnablePassthrough.assign({
        // analyzeChain 接收 { article }，返回问题列表字符串，存入 issues 字段
        issues: analyzeChain,
      }),

      // ── 步骤二：polishChain 润色 ──
      // 上一步输出的 { article, issues } 会整体传给 polishChain，
      // 它的 Prompt 里有 {article} 和 {issues} 两个占位符，
      // 正好被对象里的两个字段填满，所以不会报 Missing value。
      polishChain,
    ]);

    // 注意：invoke 必须传「对象」{ article }，不能只传字符串！
    // 因为 analyzeChain / polishChain 的 Prompt 都依赖
    // {article} 这个命名占位符，字符串无法提供它，
    // 否则会触发 INVALID_PROMPT_INPUT / Missing value 错误。
    const result = await fullChain.invoke({ article });

    return { original: article, polished: result };
  }

  // ── Chain 二：顺序链（Sequential Chain）────────────────
  // 场景：博客生成（关键词 → 大纲 → 文章 → SEO 标题）
  async generateBlog(keywords: string, style: string) {
    // 第一步：生成大纲
    const outlinePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，只输出大纲，不要正文。'],
      [
        'human',
        '根据关键词"{keywords}"，写一篇{style}风格的博客大纲（3-5个章节）',
      ],
    ]);

    // 第二步：根据大纲生成文章
    const articlePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，按照大纲写完整文章。'],
      ['human', '大纲：\n{outline}\n\n请写出完整的博客文章：'],
    ]);

    // 第三步：生成 SEO 标题
    const titlePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是 SEO 专家，只输出5个候选标题，不要其他内容。'],
      ['human', '根据以下文章，生成5个吸引点击的 SEO 标题：\n\n{article}'],
    ]);

    // 执行第一步：生成大纲
    const outlineChain = outlinePrompt.pipe(this.llm).pipe(this.parser);
    const outline = await outlineChain.invoke({ keywords, style });

    // 执行第二步：生成文章
    const articleChain = articlePrompt.pipe(this.llm).pipe(this.parser);
    const article = await articleChain.invoke({ outline });

    // 执行第三步：生成 SEO 标题
    const titleChain = titlePrompt.pipe(this.llm).pipe(this.parser);
    const titles = await titleChain.invoke({ article });

    return {
      keywords,
      style,
      outline,
      article,
      seoTitles: titles,
    };
  }

  // ── Chain 三：条件分支链（Router Chain）────────────────
  // 场景：智能客服路由（根据问题类型路由到不同处理链）
  async smartRouter(question: string) {
    // 第一步：分类问题提示词
    const classifyPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `分析用户问题，只输出分类标签（不要其他内容）：
- 技术问题 → 输出: TECH
- 退款问题 → 输出: REFUND
- 投诉建议 → 输出: COMPLAINT
- 其他 → 输出: OTHER`,
      ],
      ['human', '{question}'],
    ]);

    // 获取问题分类
    const classifyChain = classifyPrompt.pipe(this.llm).pipe(this.parser);
    const category = (await classifyChain.invoke({ question })).trim();

    // 第二步：根据分类选择不同 Prompt
    const prompts = {
      TECH: '你是技术支持专家，专业解答技术问题，给出具体操作步骤。',
      REFUND: '你是退款专员，引导用户完成退款流程，态度友好。',
      COMPLAINT: '你是客户关系专员，认真对待投诉，给出解决方案。',
      OTHER: '你是通用客服，友好回答各类问题。',
    };

    const systemPrompt = prompts[category] || prompts.OTHER;

    const answerPrompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', '{question}'],
    ]);

    const answerChain = answerPrompt.pipe(this.llm).pipe(this.parser);
    const answer = await answerChain.invoke({ question });

    return {
      question,
      category,
      answer,
    };
  }
}
