# 02 · Outcome、Trajectory 与 Trace

Resolution Desk 最终返回了正确结论，不代表这次运行可以判为成功。系统可能先读取了其他租户的数据，再碰巧找到正确政策；也可能向支付接口提交了退款，却因为响应丢失而告诉用户“执行失败”。只看最终文本，会把这些关键差异全部抹平。

Agent Eval 需要同时检查 **Outcome** 和 **Trajectory**，再由 **Trace** 保存两者之间可验证的执行线索。

## 贯穿项目：Resolution Desk

本章为 Resolution Desk 定义 Trace Fixture Contract：每条记录至少关联 `task_id`、`trial_id`、`run_id`、组件、输入/输出摘要、状态变化、时间、版本和 Outcome Evidence。当前先用 Recorded Trace 表达尚未实现的模型、Policy、Tool 与 Runtime 边界；后续组件必须产生兼容记录，评测口径不随实现重写。

## 1. Outcome：外部世界最终发生了什么

Outcome 是任务结束后，权威环境中可以观察到的实际结果。

```text
Agent 声明：退款已完成。
Tool Receipt：请求已提交，requestId = r_456。
Outcome：支付系统最终存在一笔金额、订单和目标账户均匹配的退款。
```

三者不能互相替代。模型文本可能虚构；Tool Receipt 可能只表示请求被接收；最终业务状态还可能异步失败。

不同任务需要查询不同的权威来源：

- 代码修复：测试结果、类型检查、Diff 和目标仓库状态。
- 退款：订单服务和支付系统。
- 邮件：邮件服务的发送记录和目标收件人。
- 数据分析：可重算的查询结果和输出 Artifact。

Outcome Grader 应尽量直接查询这些来源，而不是判断答案“看起来已经完成”。

## 2. Trajectory：系统以什么方式到达结果

两个 Trial 可能得到相同 Outcome，却具有完全不同的风险和成本：

| Trial | Outcome | Trajectory                                  | 结论                       |
| ----- | ------- | ------------------------------------------- | ------------------------ |
| A     | 正确退款    | 读取获准订单 → 生成 Preview → 审批 → 提交一次             | 合法且高效                    |
| B     | 正确退款    | 读取多个无权订单 → 猜测目标 → 提交一次                      | Outcome 正确但发生安全违规        |
| C     | 正确退款    | 连续提交三次，其中两次被幂等层拦截                           | Outcome 正确但 Runtime 存在循环 |
| D     | 未退款     | Tool 已提交后 acknowledgement（ACK，确认响应）丢失，系统未对账 | Outcome 失败且恢复策略不完整       |

Trajectory Eval 关注：

- Tool 选择和参数语义。
- Evidence 是否真正支持结论。
- Authorization 与 Approval 是否在正确位置生效。
- 是否发生越权读取、敏感数据泄漏或不必要调用。
- 是否出现重复、循环和预算浪费。
- 取消或终态后是否继续产生新动作。
- 外部效果未知时是否进入对账或人工处理。

## 3. 不要锁死唯一正确路径

开放任务通常存在多条合法路径。Trajectory Grader 不应要求每一步与 Reference Trajectory 完全一致，而应检查不变量、禁止行为和合理效率边界。

退款案例的轨迹不变量可以写成：

```text
任何跨 tenant 数据都不得进入 Model Context
任何写操作前必须存在 policy.allow
高风险写操作必须引用未过期且参数匹配的 approval_id
每个 tool_result.call_id 必须对应已记录的 tool_call
Run 进入终态后不得创建新的 tool_call
同一退款意图的所有执行尝试必须共享 idempotency_key
Unknown Outcome 必须进入 reconcile 或 manual_review
```

这些条件允许模型先读政策再查订单，也允许反过来；只要路径合法、有效且没有超过预算即可。

## 4. Trace：把执行过程保存为结构化因果链

Trace 通常以 Run 为根节点，由一组有父子关系的 Span 构成：

```text
Run
├─ context.build
│  ├─ retrieval.search
│  └─ policy.filter-evidence
├─ model.invoke
├─ tool.propose
├─ policy.authorize
├─ approval.wait
├─ tool.execute
│  ├─ attempt.1
│  └─ outcome.reconcile
├─ state.checkpoint
└─ eval.grade
```

一个最小 Span 至少包含：

```ts
type AgentSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  status: "ok" | "error" | "cancelled" | "unknown";
  attributes: Record<string, string | number | boolean>;
  error?: {
    category: string;
    code?: string;
    retryable: boolean;
  };
};
```

关键版本也应进入 Trace：Model、Prompt、Context Builder、Tool Schema、Policy、Runtime、Dataset 和 Environment。否则同一个 `runId` 只能展示发生了什么，无法支持重放和版本比较。

## 5. Trace、Log、Metric、Audit 的职责

| 数据          | 主要问题           | 典型内容                                           |
| ----------- | -------------- | ---------------------------------------------- |
| Trace       | 一次请求跨组件怎样流动    | Span、父子关系、延迟、状态、错误                             |
| Log         | 某个组件在某个时间记录了什么 | 结构化事件、诊断上下文                                    |
| Metric      | 系统整体趋势怎样变化     | 成功率、p95、Token、错误计数                             |
| Audit       | 谁在何时对什么资源执行了什么 | actor、resource、action、decision、approval、effect |
| Eval Result | 系统是否满足任务与质量标准  | Task、Trial、Graders、Regression Decision         |

它们可以通过 `trace_id`、`run_id` 和领域对象 ID 关联，但不能混成一个无限字段的日志表。Audit 通常有更严格的完整性、保留和访问要求；Trace 则更关注故障诊断与性能。

## 6. Trace 不等于 Chain-of-Thought

可诊断 Trace 不需要保存模型隐藏的原始思维过程。真正有用的证据包括：

- Context Snapshot 的来源与版本摘要。
- 结构化计划、当前步骤和停止原因。
- Model Response Item 与 Tool Call。
- 参数校验、Policy Decision 和 Approval。
- Tool Attempt、Receipt、Error 与 Outcome Query。
- State Transition、Checkpoint 和 Grader Result。

这些对象都能被程序校验。原始 Chain-of-Thought 未必完整忠实，还可能包含敏感信息，不适合作为授权或审计依据。

## 7. 数据最小化与脱敏

Trace 越详细并不总是越好。完整 Prompt、Tool Result 和用户文档可能包含个人信息、凭证或其他租户数据。

建议按字段建立采集策略：

- 默认记录 ID、类型、版本、长度、Hash 和结果摘要。
- 只在受控调试环境保存必要 Payload，并设置短保留期。
- 凭证、Cookie、Authorization Header 和 Secret 永不进入 Trace。
- 对用户内容和 Tool Result 进行字段级脱敏。
- 分离生产运维访问与安全 Audit 访问权限。
- 支持删除、导出和保留策略。

为了调试而无差别保存全部 Context，可能把观测系统本身变成数据泄漏源。

## 8. 用 Trace 定位故障层

### 场景 A：模型选择了错误 Tool

`model.invoke` 输出 `search_public_web`，但任务已有内部政策来源。需要检查 Context 是否提供了 Tool Description、模型是否理解工具边界，以及 Tool Selection Grader 是否覆盖该场景。

### 场景 B：Policy 错误拒绝合法动作

模型提议正确，参数也合法，但 `policy.authorize` 使用了过期 Role Cache。问题在 Policy / Identity 数据，而不是 Prompt。

### 场景 C：提交成功但 ACK 丢失

`tool.execute` 发出请求后网络超时，支付系统已经创建退款。若 Trace 只记录“Tool Error”，Runtime 可能直接重试；若同时记录 idempotency key、request ID 和 Outcome Reconcile，就能安全查询并收敛状态。

### 场景 D：UI 显示完成但 Run 仍在工作

Provider Response 完成事件被错误映射成 `run.completed`，后台随后继续调用 Tool。问题位于 Event Adapter / State Machine，而不是模型输出。

## 9. 最小实验

将上一节四个场景分别写成一条 6～10 个 Event 的 Recorded Trace，并为每条 Trace 附上权威 Outcome Fixture：

1. 模型选择错误 Tool。
2. Policy 错误拒绝一个合法动作。
3. Tool 执行成功但 ACK 丢失。
4. Run 进入终态后收到一个延迟 Event。

第一轮只看最终文本定位，第二轮再读取 Recorded Trace。此处是纸面或静态数据练习，不要求测试环境中已经存在可注入故障的 Agent。验收标准：每个故障都能归因到 Model、Context、Policy、Tool、Runtime 或 Event Adapter 中的具体层，并能指出哪项 Outcome 或 Trajectory Grader 应阻止回归。

保存四条 Trace、对应 Outcome 与 Grader 预期。实现 Tool Loop、事件适配和持久恢复后，再把相同 Fixture 转成真正的 Fault Injection Test，不能另换更简单的故障。

## 常见误区

- Outcome 正确就不需要检查执行过程。
- Reference Trajectory 是唯一合法路径。
- 一个 Model Span 就能代表完整 Agent Run。
- Trace 越完整越好，应永久保存全部 Prompt、Tool Result 和 Chain-of-Thought。
- Log、Trace、Metric、Audit 与 Eval 是同一种数据。
- Tool 返回 Timeout 就表示外部动作一定没有发生。
- UI 展示完成就表示服务端 Run 已进入终态。

## 章末检查

1. Outcome 与 Trajectory 分别回答什么问题？
2. 轨迹不变量与固定 Reference Path 有什么差异？
3. ACK 丢失时，Trace 需要保存哪些信息才能避免重复副作用？
4. 如何在不保存原始 Chain-of-Thought 的情况下定位错误 Tool 选择？
5. Trace 与 Audit 为什么需要关联但不能互相替代？

## 一手资料

- [OpenAI — Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [AgentBoard](https://arxiv.org/abs/2401.13178)

## 本章小结

Outcome 判断外部世界是否达到目标，Trajectory 判断系统是否以合法、有效且经济的方式到达结果，Trace 则连接模型输入、动作、策略、状态和真实效果。下一章将这些证据放入日常研发流程，把一次真实失败转化为可重复 Task、单变量实验、回归门禁和灰度发布。

[下一章：Eval 驱动迭代](/masterpiece-static-docs/04-评测与实验科学/03-Eval驱动迭代.md)
