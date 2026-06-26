import { Body, Controller, Post } from '@nestjs/common';
import { PromptsService } from './prompts.service';

/**
 * PromptsController - 提示词模板控制器
 *
 * 用途：处理各种基于 LangChain 提示词模板的 HTTP 请求
 *
 * 提示词工程（Prompt Engineering）概念：
 * =========================================
 * - 精心设计的提示词可以显著提升 LLM 的输出质量
 * - 提示词模板（Prompt Template）用于可复用的提示词结构
 * - 少样本学习（Few-Shot）通过示例来引导模型理解任务
 *
 * 本控制器提供的接口：
 * 1. /prompts/translate - 翻译
 * 2. /prompts/summarize - 总结
 * 3. /prompts/classify - 文本分类
 * 4. /prompts/code-review - 代码审查
 */
@Controller('prompts')
export class PromptsController {
  // 依赖注入 PromptsService 来处理业务逻辑
  constructor(private readonly promptsService: PromptsService) {}

  /**
   * POST /prompts/translate - 翻译接口
   *
   * 用途：将文本翻译成指定语言
   *
   * @param body.text - 要翻译的原文
   * @param body.targetLanguage - 目标语言（如 "英语"、"日语"）
   * @returns 包含原文、目标语言和翻译结果的响应
   */
  @Post('translate')
  translate(@Body() body: { text: string; targetLanguage: string }) {
    const { text, targetLanguage } = body;
    return this.promptsService.translate(text, targetLanguage);
  }

  /**
   * POST /prompts/summarize - 总结接口
   *
   * 用途：将长文本压缩成简短总结
   *
   * @param body.text - 要总结的原文
   * @param body.maxWords - 最大字数限制
   * @returns 包含原文、字数限制和总结结果的响应
   */
  @Post('summarize')
  summarize(@Body() body: { text: string; maxWords: number }) {
    const { text, maxWords } = body;
    return this.promptsService.summarize(text, maxWords);
  }

  /**
   * POST /prompts/classify - 文本分类接口
   *
   * 用途：对文本进行情感分类（正面/负面/中性）
   * 使用少样本学习（Few-Shot）方法
   *
   * @param body.text - 要分类的文本
   * @returns 包含输入文本和分类结果的响应
   */
  @Post('classify')
  classify(@Body() body: { text: string }) {
    // 实现分类逻辑
    return this.promptsService.classify(body.text);
  }

  /**
   * POST /prompts/code-review - 代码审查接口
   *
   * 用途：使用 LLM 对代码进行审查
   * 审查维度：代码规范、潜在 Bug、性能问题、改进建议
   *
   * @param body.code - 要审查的代码
   * @param body.language - 编程语言（如 "Python"、"JavaScript"）
   * @returns 包含语言、代码和审查结果的响应
   */
  @Post('code-review')
  codeReview(@Body() body: { code: string; language: string }) {
    const { code, language } = body;
    return this.promptsService.codeReview(code, language);
  }
}
