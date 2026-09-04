import { HumanMessage } from '@langchain/core/messages';
import {
  Annotation,
  Command,
  END,
  interrupt,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from 'src/config';

//定义EmailState
const EmailState = Annotation.Root({
  emailRequest: Annotation<string>(),
  draftEmail: Annotation<{
    subject: string; // 邮件主题
    recipient: string; // 收件人
    body: string; // 邮件内容
  }>(),
  approvalStatus: Annotation<
    'pending' | 'approved' | 'rejected' | 'need_modify'
  >(),
  modifyFeedback: Annotation<string>(),
  //修订次数
  revisionCount: Annotation<number>({
    reducer: (prev, curr) => curr ?? prev + 1, // 如果有新值则使用新值，否则在基础上 +1
    default: () => 0,
  }),
  finalStatus: Annotation<string>(),
});

@Injectable()
export class EmailApprovalService implements OnModuleInit {
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

    // ── 节点一：起草邮件 ─────────────────────────────
    // 节点名改为 draftNode，避免和 State 字段 draftEmail 冲突
    const draftNode = async (state: typeof EmailState.State) => {
      // 判断是否为修订版本（有修改意见说明是重新起草）
      const isRevision = !!state.modifyFeedback;
      console.log(
        `\n✍️  [draftNode] ${isRevision ? '根据修改意见重新起草' : '初次起草'}邮件`,
      );

      // 根据是否修订构造不同的提示词
      const prompt = isRevision
        ? `根据修改意见重新起草邮件：
修改意见：${state.modifyFeedback}
原始需求：${state.emailRequest}
上次草稿：${JSON.stringify(state.draftEmail)}`
        : `根据需求起草一封专业邮件：${state.emailRequest}`;

      // 调用 LLM 生成邮件草稿
      const res = await llm.invoke([
        new HumanMessage(
          `${prompt}\n\n输出 JSON（不要其他内容）：
{"subject":"邮件主题","recipient":"收件人","body":"正文内容"}`,
        ),
      ]);

      // 解析 LLM 返回的 JSON 结果
      let draft: { subject: string; recipient: string; body: string };
      try {
        // 移除 Markdown 代码块标记
        const json = (res.content as string)
          .replace(/```json\n?|\n?```/g, '')
          .trim();
        draft = JSON.parse(json);
      } catch {
        // 解析失败时使用降级方案
        draft = {
          subject: '草稿',
          recipient: '未知',
          body: res.content as string,
        };
      }

      console.log(`   收件人: ${draft.recipient}，主题: ${draft.subject}`);
      return {
        draftEmail: draft, // 保存草稿
        approvalStatus: 'pending' as const, // 状态设为待审批
        revisionCount: isRevision ? 1 : 0, // 修订次数 +1
      };
    };

    // ── 节点二：等待人工审批（interrupt 暂停）──────────
    // 节点名改为 waitNode，避免和可能的字段名冲突
    const waitNode = async (state: typeof EmailState.State) => {
      console.log(
        `\n⏸️  [waitNode] 等待人工审批（第 ${state.revisionCount + 1} 版）`,
      );

      // interrupt 会暂停工作流，等待外部 resume 调用
      const decision = interrupt({
        type: 'email_review',
        message: `请审查邮件草稿（第 ${state.revisionCount + 1} 版）`,
        draft: state.draftEmail,
        options: {
          approve: '批准发送',
          reject: '拒绝（取消发送）',
          modify: '需要修改（附修改意见）',
        },
      });

      console.log(`   人工决定: ${JSON.stringify(decision)}`);

      // 根据人工决策返回不同的状态
      if (typeof decision === 'string') {
        // 批准或拒绝（直接返回字符串）
        return { approvalStatus: decision as any };
      }
      if (
        typeof decision === 'object' &&
        (decision as any)?.action === 'modify'
      ) {
        // 需要修改（返回对象包含修改意见）
        return {
          approvalStatus: 'need_modify' as const,
          modifyFeedback: (decision as any).feedback as string,
        };
      }
      // 默认拒绝
      return { approvalStatus: 'rejected' as const };
    };

    // ── 路由函数 ──────────────────────────────────────
    // 根据审批状态决定下一步跳转
    const routeAfterApproval = (state: typeof EmailState.State) => {
      console.log(`\n🔀 [route] approvalStatus = ${state.approvalStatus}`);
      switch (state.approvalStatus) {
        case 'approved':
          return 'sendNode'; // 批准 → 发送邮件
        case 'need_modify':
          return 'draftNode'; // 需要修改 → 回到起草节点重新起草（循环）
        default:
          return 'cancelNode'; // 拒绝或其他 → 取消
      }
    };

    // ── 节点三：发送邮件 ──────────────────────────────
    // 节点名改为 sendNode
    const sendNode = async (state: typeof EmailState.State) => {
      console.log(`\n📤 [sendNode] 发送邮件`);
      console.log(`   收件人: ${state.draftEmail.recipient}`);
      console.log(`   主题:   ${state.draftEmail.subject}`);
      // 实际项目里调用 Nodemailer / SendGrid / 企业邮件 API
      return {
        finalStatus: `✅ 邮件已发送\n收件人：${state.draftEmail.recipient}\n主题：${state.draftEmail.subject}`,
      };
    };

    // ── 节点四：取消发送 ──────────────────────────────
    // 节点名改为 cancelNode
    const cancelNode = async (state: typeof EmailState.State) => {
      console.log(
        `\n🚫 [cancelNode] 邮件已取消，状态: ${state.approvalStatus}`,
      );
      return {
        finalStatus: `❌ 邮件已取消（审批状态：${state.approvalStatus}）`,
      };
    };

    // ── 构建状态图 ──────────────────────────────────────
    this.graph = new StateGraph(EmailState)
      // 添加节点（节点名全部改掉，不再和 State 字段名冲突）
      .addNode('draftNode', draftNode) // 起草节点
      .addNode('waitNode', waitNode) // 等待审批节点（含 interrupt）
      .addNode('sendNode', sendNode) // 发送节点
      .addNode('cancelNode', cancelNode) // 取消节点
      // 定义边（执行流程）
      .addEdge(START, 'draftNode') // 入口：起草
      .addEdge('draftNode', 'waitNode') // 起草完成 → 等待审批
      .addConditionalEdges('waitNode', routeAfterApproval, {
        sendNode: 'sendNode', // 批准 → 发送
        draftNode: 'draftNode', // 需要修改 → 回到起草（循环）
        cancelNode: 'cancelNode', // 拒绝 → 取消
      })
      .addEdge('sendNode', END) // 发送完成 → 结束
      .addEdge('cancelNode', END) // 取消完成 → 结束
      .compile({ checkpointer: new MemorySaver() }); // 使用内存存储状态（支持 interrupt/resume）

    console.log('✅ 邮件审批工作流初始化完成');
  }

  // ── 对外方法 ──────────────────────────────────────

  // 启动邮件流程
  async start(emailRequest: string, threadId: string) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📨 [email/start] threadId: ${threadId}`);
    console.log(`   需求: "${emailRequest}"`);

    // 调用工作流，传入邮件需求和线程 ID
    const result = await this.graph.invoke(
      { emailRequest },
      { configurable: { thread_id: threadId } },
    );

    // 如果结果包含 interrupt，说明工作流暂停等待人工审批
    if (result.__interrupt__) {
      return {
        status: 'waiting_for_approval',
        threadId,
        reviewData: result.__interrupt__[0].value, // 审批数据
        message: '邮件草稿已生成，请审批',
      };
    }
    return { status: 'completed', result };
  }

  // 批准邮件
  async approve(threadId: string) {
    console.log(`\n✅ [email/approve] threadId: ${threadId}`);
    // 恢复工作流，传入 'approved' 作为决策
    await this.graph.invoke(new Command({ resume: 'approved' }), {
      configurable: { thread_id: threadId },
    });
    // 获取最终状态
    const state = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    return { status: 'email_sent', finalStatus: state.values.finalStatus };
  }

  // 拒绝邮件
  async reject(threadId: string) {
    console.log(`\n❌ [email/reject] threadId: ${threadId}`);
    // 恢复工作流，传入 'rejected' 作为决策
    await this.graph.invoke(new Command({ resume: 'rejected' }), {
      configurable: { thread_id: threadId },
    });
    return { status: 'cancelled', message: '邮件已取消发送' };
  }

  // 请求修改邮件
  async requestModify(threadId: string, feedback: string) {
    console.log(`\n✏️  [email/modify] threadId: ${threadId}`);
    console.log(`   修改意见: "${feedback}"`);
    // 恢复工作流，传入修改决策和反馈意见
    const result = await this.graph.invoke(
      new Command({ resume: { action: 'modify', feedback } }),
      { configurable: { thread_id: threadId } },
    );
    // 如果重新起草后又暂停，返回等待审批状态
    if (result.__interrupt__) {
      return {
        status: 'waiting_for_approval',
        reviewData: result.__interrupt__[0].value,
        message: '邮件已修改，请重新审批',
      };
    }
    return { status: 'completed' };
  }

  // 获取当前状态
  async getState(threadId: string) {
    const state = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    return state.values;
  }
}
