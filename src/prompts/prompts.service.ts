import { ChatOpenAI } from '@langchain/openai'; // [Llama.cpp] llama-server HTTP 服务（与 Ollama API 兼容）
// import { ChatOpenAI } from '@langchain/openai'; // [Ollama] 原始代码
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  FewShotPromptTemplate,
  PromptTemplate,
} from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';
import { config } from 'src/config';

/**
 * PromptsService - 提示词模板服务
 *
 * 核心概念：LangChain 提示词模板（Prompt Templates）
 * ================================================
 *
 * LangChain 提供了多种提示词模板来构建 LLM 调用：
 *
 * 1. ChatPromptTemplate - 对话提示词模板（最常用）
 *    - 支持多消息格式：[角色, 内容]
 *    - 角色：system（系统设定）、human（用户）、ai（AI回复）
 *    - 语法：fromMessages() 从消息数组创建
 *
 * 2. PromptTemplate - 简单文本模板
 *    - 使用占位符：{variable}
 *    - 语法：fromTemplate() 从模板字符串创建
 *
 * 3. FewShotPromptTemplate - 少样本学习模板
 *    - 提供示例来引导模型理解任务
 *    - 显著提升分类/推理任务的准确性
 *
 * 提示词模板的工作流程：
 * ┌──────────────────────────────────────────────────┐
 * │  提示词模板                                  │
 * │    ↓                                        │
 * │  .format() / .invoke() 填充变量              │
 * │    ↓                                        │
 * │  格式化的提示词                              │
 * │    ↓                                        │
 * │  LLM 处理                                   │
 * │    ↓                                        │
 * │  输出解析（StringOutputParser）              │
 * └──────────────────────────────────────────────────┘
 */
@Injectable()
export class PromptsService {
  // ========== LLM 实例配置 ==========
  // [Llama.cpp] 使用本地 llama-server.exe 启动的 HTTP 服务
  // 服务地址：http://localhost:8081
  // 模型：Llama-3.2-1B-Instruct-Q4_K_M
  private llm = new ChatOpenAI({
    model: config.llamaCpp.chatModel,
    apiKey: 'not-needed',
    configuration: {
      baseURL: config.llamaCpp.baseUrl,
    },
    temperature: config.llamaCpp.temperature,
  });

  // ChatPromptTemplate：多消息对话模板（最常用）
  async translate(text: string, targetLanguage: string) {
    // ChatPromptTemplate.fromMessages() 创建对话格式的提示词
    // 消息数组格式：[角色, 内容]
    // {targetLang} 和 {text} 是变量占位符
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业翻译，只输出翻译结果，不加任何解释。'],
      ['human', '请把以下内容翻译成{targetLang}：\n\n{text}'],
    ]);

    // ========== 构建处理链 ==========
    // prompt.pipe(llm).pipe(parser)
    // 含义：提示词 → LLM处理 → 字符串解析
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({ text, targetLanguage });
    return { origin: text, targetLanguage, translated: result };
  }

  //单对话模型--总结
  /**
   * summarize - 总结内容
   * 实现原理：使用 system 角色设定字数限制,将用户文本作为要总结的内容, LLM 会压缩内容并控制在指定字数内
   * @param text - 要总结的原文
   * @param maxWords - 最大字数限制
   * @returns 包含原文、字数限制、总结结果的响应
   */
  async summarize(text: string, maxWords: number) {
    // {maxWords} 和 {text} 是变量占位符
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '用不超过{maxWords}个字总结以下内容，只输出总结：\n\n{text}'],
    ]);

    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({ text, maxWords });
    return { origin: text, maxWords: maxWords, summarize: result };
  }

  //少样本学习模版 Few-Shot Learning
  /**
   * classify - 文本分类方法（情感分析）
   * 实现原理：Few-Shot Learning（少样本学习）
   * 通过提供少量示例（examples），让模型理解任务模式，无需额外训练即可提升分类准确性。
   *
   * FewShotPromptTemplate 结构：
   * - prefix：任务说明前缀
   * - examples：示例数组 [{input, output}]
   * - examplePrompt：示例格式化模板
   * - suffix：输入提示后缀
   *
   * 格式化后的提示词示例：
   * ┌────────────────────────────────────────┐
   * │ 分析文本情感...                        │
   * │ 输入这个产品太棒了！,输出正面         │
   * │ 输入完全不值这个价格,输出负面        │
   * │ 输入还可以吧，普通,输出中性       │
   * │ ...                                │
   * │ 输入{text},输出                    │
   * └────────────────────────────────────────┘
   *
   * @param text - 要分类的文本
   * @returns 包含输入文本和分类结果的响应
   */
  async classify(text: string) {
    // ========== 定义示例 ==========
    //Few-Shot Learning 需要的示例数据
    //每个示例包含输入文本和期望的输出
    const examples = [
      { input: '这个产品太棒了！', output: '正面' },
      { input: '完全不值这个价格', output: '负面' },
      { input: '还可以吧，普通', output: '中性' },
      { input: '强烈推荐！超出预期', output: '正面' },
      { input: '很失望，不会再买了', output: '负面' },
    ];
    const examplePrompt = PromptTemplate.fromTemplate(
      '输入{input},\n输出{output}',
    );
    // ========== 创建 Few-Shot 模板 ==========
    const fewShotTemplate = new FewShotPromptTemplate({
      examples, // 示例数组
      examplePrompt, // 示例格式化模板
      prefix: '分析文本情感，返回分类结果：积极、消极、中立', // 任务说明
      suffix: '输入{input},\n输出', // 最终输入的后缀
      inputVariables: ['input'], // 输入变量名
    });
    // .format() 将模板转换为可发送的提示词字符串
    const formattedPrompt = await fewShotTemplate.format({ input: text });
    const response = await this.llm.invoke(formattedPrompt);
    return { input: text, output: response.content };
  }

  //用大模型来codereview,输入一段代码和编程语言，返回代码建议
  /**
   * codeReview - 代码审查方法
   * 实现原理：
   * 1. 使用 system 角色设定为资深开发工程师
   * 2. 指定审查维度和输出格式
   * 3. 使用 markdown 代码块格式化输入代码
   * 4. LLM 返回结构化的审查意见
   */
  async codeReview(code: string, language: string) {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `你是资深{language}开发工程师，负责代码审查。审查维度：代码规范 / 潜在 Bug / 性能问题 / 改进建议输出格式：总体评分（1-10分）+ 具体问题列表 + 改进代码片段`,
      ],
      ['human', '请审查以下{language}代码：\n\n```{language}\n{code}\n```'],
    ]);

    // ========== 构建处理链并执行 ==========
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({ code, language });
    return { language, code, review: result };
  }
}
