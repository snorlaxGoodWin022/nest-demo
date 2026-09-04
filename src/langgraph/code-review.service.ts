import { HumanMessage } from '@langchain/core/messages';
import {
  Annotation,
  Command,
  END,
  Send,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//reviewState
const ReviewState = Annotation.Root({
  code: Annotation<string>(),
  language: Annotation<string>(),
  reviewResults: Annotation<
    { aspect: string; issues: string[]; score: number }[]
  >({
    reducer: (prev, cur) => [...prev, ...cur], // 合并多个 Agent 完成记录
    default: () => [],
  }),
  report: Annotation<string>(),
});

const SingleReviewState = Annotation.Root({
  code: Annotation<string>(),
  language: Annotation<string>(),
  aspect: Annotation<string>(),
  prompt: Annotation<string>(),
});

@Injectable()
export class CodeReviewService implements OnModuleInit {
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

    // 分发节点：用 Send 同时启动 3 个审查实例
    const dispatch = (state: typeof ReviewState.State) => {
      // 定义 3 个不同维度的审查任务配置
      const tasks = [
        {
          aspect: '安全性',
          prompt: `检查代码安全问题（SQL 注入、XSS、敏感信息泄露等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
        },
        {
          aspect: '性能',
          prompt: `检查代码性能问题（算法复杂度、N+1 查询、内存泄漏等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
        },
        {
          aspect: '代码规范',
          prompt: `检查代码规范（命名、注释、DRY 原则、错误处理等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
        },
      ];

      // 为每个任务创建独立的 Send 实例，并行执行
      return new Command({
        goto: tasks.map(
          (t) =>
            new Send('reviewAgent', {
              code: state.code, // 待审查的代码
              language: state.language, // 编程语言
              aspect: t.aspect, // 审查维度
              prompt: t.prompt, // 审查提示词
            }),
        ),
      });
    };

    // 审查节点：多个实例并行运行，各自处理一个维度
    const reviewAgent = async (state: typeof SingleReviewState.State) => {
      // 调用 LLM 执行审查任务
      const res = await llm.invoke([
        new HumanMessage(
          `${state.prompt}\n\n${state.language} 代码：\n\`\`\`\n${state.code}\n\`\`\``,
        ),
      ]);

      // 解析 LLM 返回的 JSON 结果
      let parsed: { issues: string[]; score: number };
      try {
        // 移除 Markdown 代码块标记（```json 和 ```）
        const json = (res.content as string)
          .replace(/```json\n?|\n?```/g, '')
          .trim();
        parsed = JSON.parse(json);
      } catch {
        // 解析失败时使用默认值
        parsed = { issues: ['结果解析失败'], score: 5 };
      }

      // 返回审查结果（包含审查维度和解析后的数据）
      return {
        reviewResults: [{ aspect: state.aspect, ...parsed }],
      };
    };

    // 汇总节点：所有审查实例完成后生成综合报告
    const generateReport = async (state: typeof ReviewState.State) => {
      // 计算所有维度的平均分
      const avgScore = Math.round(
        state.reviewResults.reduce((s, r) => s + r.score, 0) /
          state.reviewResults.length,
      );

      // 格式化每个维度的审查详情
      const detail = state.reviewResults
        .map(
          (r) =>
            `【${r.aspect}】评分：${r.score}/10\n问题：\n${r.issues.map((i) => `  - ${i}`).join('\n')}`,
        )
        .join('\n\n');

      // 调用 LLM 生成综合报告
      const res = await llm.invoke([
        new HumanMessage(
          `根据以下代码审查结果生成综合报告（综合评分、主要问题、改进建议）：\n\n${detail}`,
        ),
      ]);

      // 返回最终报告（包含平均分和 LLM 生成的建议）
      return { report: `综合评分：${avgScore}/10\n\n${res.content}` };
    };

    this.graph = new StateGraph(ReviewState)
      .addNode('dispatch', dispatch, { ends: ['reviewAgent'] })
      .addNode('reviewAgent', reviewAgent)
      .addNode('generateReport', generateReport)
      .addEdge(START, 'dispatch')
      .addEdge('reviewAgent', 'generateReport')
      .addEdge('generateReport', END)
      .compile();
  }

  async review(code: string, language = 'TypeScript') {
    const t0 = Date.now();
    const result = await this.graph.invoke({
      code,
      language,
    });
    return {
      language,
      reviewResults: result.reviewResults,
      report: result.report,
      cost: `${(Date.now() - t0) / 1000}秒`,
    };
  }
}
