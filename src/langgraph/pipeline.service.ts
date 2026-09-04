import { HumanMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//定义 state
const PipelineState = Annotation.Root({
  topic: Annotation<string>(),
  research: Annotation<string>(),
  outline: Annotation<string>(),
  draft: Annotation<string>(),
  finalArticle: Annotation<string>(),
  progress: Annotation<string[]>({
    reducer: (prev, cur) => [...prev, ...cur], // 合并多个 Agent 完成记录
    default: () => [],
  }),
});

@Injectable()
export class PipelineService implements OnModuleInit {
  private graph: any;
  async onModuleInit() {
    // 创建 chatOllama 实例
    const llm = new ChatOllama({
      model: config.ollama.chatModel,
      temperature: config.ollama.temperature,
      baseUrl: config.ollama.host,
      think: false,
      numPredict: 512,
    });

    const researchAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是研究员，为主题"${state.topic}"收集素材：
1. 背景介绍（2-3 句）
2. 核心要点（3-5 个）
3. 典型案例（1-2 个）
每条不超过 50 字。`),
      ]);
      return {
        research: res.content as string,
        progress: ['✅ 素材收集完成'],
      };
    };

    const outlineAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是内容策划，根据素材为"${state.topic}"生成大纲：
素材：${state.research}
格式：# 章节 / - 子项，共 3-5 章`),
      ]);
      return { outline: res.content as string, progress: ['✅ 大纲生成完成'] };
    };

    const writingAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(`你是撰稿人，根据大纲写文章（400-600 字）：
主题：${state.topic}
大纲：${state.outline}
参考素材：${state.research}`),
      ]);
      return { draft: res.content as string, progress: ['✅ 初稿写作完成'] };
    };

    const reviewAgent = async (state: typeof PipelineState.State) => {
      const res = await llm.invoke([
        new HumanMessage(
          `你是编辑，优化以下文章，直接输出优化后全文：\n${state.draft}`,
        ),
      ]);
      return {
        finalArticle: res.content as string,
        progress: ['✅ 审校优化完成'],
      };
    };

    this.graph = new StateGraph(PipelineState)
      .addNode('researcher', researchAgent)
      .addNode('outliner', outlineAgent)
      .addNode('writer', writingAgent)
      .addNode('reviewer', reviewAgent)
      .addEdge(START, 'researcher')
      .addEdge('researcher', 'outliner')
      .addEdge('outliner', 'writer')
      .addEdge('writer', 'reviewer')
      .addEdge('reviewer', END)
      .compile();
  }

  async creteContent(topic: string) {
    const t0 = Date.now();
    const result = await this.graph.invoke({ topic: topic });
    return {
      topic,
      progress: result.progress,
      finalArticle: result.finalArticle,
      time: `${(Date.now() - t0) / 1000}秒`,
    };
  }
}
