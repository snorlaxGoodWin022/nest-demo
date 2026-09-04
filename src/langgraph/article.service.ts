import { HumanMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

// 自定义state  定义这个工作流里所有节点共享的数据结构
const ArticleState = Annotation.Root({
  //原始文章 (输入,各节点只读)
  article: Annotation<string>(),
  //关键词数组 extractKeywords写入, generateSummary 读取
  keywords: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  //最终摘要 generateSummary 写入
  summary: Annotation<string>(),
  //执行日志
  log: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
});
@Injectable()
export class ArticleService implements OnModuleInit {
  private articleGraph: any;
  async onModuleInit() {
    // 初始化 LLM 模型
    const llm = new ChatOpenAI({
      model: config.llamaCpp.chatModel,
      apiKey: 'not-needed',
      configuration: {
        baseURL: config.llamaCpp.baseUrl,
      },
      temperature: 0.3,
    });

    //节点一:提取关键词
    const extractKeywords = async (state: typeof ArticleState.State) => {
      const t0 = Date.now();
      const res = await llm.invoke([
        new HumanMessage(`
        从文章中提取3到5个关键词,关键词之间用逗号隔开,只输出关键词: ${state.article}
        \n\n`),
      ]);
      const keywords = (res.content as string)
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean);

      return { keywords, log: [`提取关键词耗时: ${Date.now() - t0}ms`] };
    };

    //节点二:生成摘要
    const generateSummary = async (state: typeof ArticleState.State) => {
      const t0 = Date.now();
      const res = await llm.invoke([
        new HumanMessage(`
        请以下文章生成30字的摘要: \n关键词参考：${state.keywords.join('、')}\n\n文章：\n${state.article}`),
      ]);
      const summary = res.content;
      return { summary, log: [`生成摘要耗时: ${Date.now() - t0}ms`] };
    };

    //创建工作流图
    this.articleGraph = new StateGraph(ArticleState)
      .addNode('extractKeywords', extractKeywords)
      .addNode('generateSummary', generateSummary)
      .addEdge(START, 'extractKeywords')
      .addEdge('extractKeywords', 'generateSummary')
      .addEdge('generateSummary', END)
      .compile();
  }

  async process(article: string) {
    const result = await this.articleGraph.invoke({ article });
    return {
      keywords: result.keywords,
      summary: result.summary,
      log: result.log,
    };
  }
}
