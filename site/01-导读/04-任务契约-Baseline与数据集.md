# 04 · 任务契约、Baseline 与数据集

Agent 项目最容易从 Demo 开始：选择一个模型，写一段 Prompt，接入几个工具，然后用一两个顺利案例判断“效果不错”。这种方式能够快速展示能力，却很难回答三个基础问题：系统究竟要解决什么问题，简单方案是否已经足够，以及修改后是否真的变好。

这一步不包含 Agent Runtime，而是先固定任务、边界和比较方法，为后续每一层实现提供共同尺度。这份起点材料由五部分组成：Task Contract、非 Agent Baseline、Dataset、Graders 和完整的版本信息。

## 1. 贯穿案例：退款资格与执行助手

假设客服团队希望处理下面一类请求：

> 根据订单事实和当前有效的退款政策，判断订单是否符合条件；给出可核验的政策依据，生成退款金额与目标账户的操作预览；只有在权限和审批均有效时才提交退款。

这段描述仍然不足以开始实现。至少还存在以下歧义：

- “当前有效”依据什么时间和版本判断？
- 用户陈述与订单记录冲突时采用哪一个？
- 部分退款和全额退款分别需要什么证据？
- 哪些情况可以自动生成预览，哪些必须转人工？
- Tool 返回超时但支付系统实际已受理时，是否允许重试？

Task Contract 的作用，就是把这些隐含判断变成可实现、可测试的约束。

## 2. Task Contract：把自然语言需求变成工程契约

一份可用的 Task Contract 至少包含六组信息。

### 2.1 用户与价值

明确任务服务谁，以及最终希望改变什么。功能名称不是用户价值。“退款助手”只是名称；“将客服核对订单与政策的时间从人工搜索缩短为可审查的提案，同时不扩大退款权限”才描述了价值和边界。

### 2.2 输入与初始环境

包括用户请求、actor、tenant、订单快照、政策版本、当前时间和可用 Tool。每个评测 Task 都应能从相同初始状态重建，避免前一次运行留下的数据影响下一次结果。

### 2.3 允许、审批与禁止

把动作分成三类：

- 可以自动执行的只读查询。
- 可以生成但必须等待审批的写操作提案。
- 无论模型怎样请求都必须拒绝的动作。

“谨慎处理”无法测试；“未持有 `refund:write` scope 时，支付 Tool 不得收到请求”可以测试。

### 2.4 成功结果与安全不变量

成功结果由权威系统状态定义，而不是由回答文风定义。例如：

- 正确识别适用政策版本。
- 退款金额不超过订单可退余额。
- 未审批时支付系统中不存在退款记录。
- 审批后支付系统中只存在一笔与提案一致的退款。
- 任何其他租户的数据都未被读取或进入 Model Context。

### 2.5 人工控制

需要区分三种情况：

- **Clarification**：信息不足，需要补充事实。
- **Approval**：动作已经具体化，需要用户确认。
- **Escalation**：任务超出系统能力或风险边界，转交人工处理。

将三者全部设计成一个“请确认”按钮，会让产品和审计语义同时变得含糊。

### 2.6 预算与停止条件

定义最大 step、模型调用次数、Token、时间和金额成本。预算不仅用于控制费用，也决定何时停止探索并向用户解释未完成原因。

## 3. 一份可直接使用的模板

```md
# Task Contract v0.1

## 任务族与用户价值
- 主要用户：
- 要完成的真实结果：
- 现有流程及主要成本：

## 输入与环境
- 输入字段：
- actor / tenant / resource：
- 可用数据与权威来源：
- 时间、版本与初始状态：
- 缺失或冲突信息的处理方式：

## 能力边界
- 可自动读取：
- 可自动生成：
- 必须审批：
- 必须拒绝：
- 必须转人工：

## 成功与安全
- 业务成功：
- 证据要求：
- 安全不变量：
- 从哪个权威系统检查 Outcome：

## 预算
- 最大 step / time / token / cost：

## 版本
- model / prompt / toolset / policy：
- dataset / grader / environment：
```

退款案例的一份精简答案如下：

```text
主要用户：处理售后工单的客服人员。
真实结果：生成带政策证据的退款提案；审批后只提交一次合法退款。
权威来源：订单服务、版本化政策库、支付系统。
可自动读取：当前 tenant 下、actor 获得授权的订单和政策。
可自动生成：资格判断、证据引用与退款 Preview。
必须审批：任何会向支付系统发起退款的动作。
必须拒绝：跨租户读取、超过可退余额、绕过审批、替换审批后参数。
Clarification：订单号、退款原因或范围缺失；用户描述与订单事实冲突。
Escalation：政策冲突、疑似欺诈、支付状态不明且无法安全对账。
```

## 4. Baseline：先证明 Agent 值得引入

Baseline 是同一任务上更简单、可重复的方案，不是故意做差的对照组。退款案例可以依次比较：

```text
人工查询 + 固定表单
→ 确定性规则 + 固定表单
→ 单次模型调用生成解释
→ 固定 Workflow
→ 具备动态 Tool Loop 的 Agent
```

每增加一层自主性，都应带来可测收益。例如，Agent 也许能处理政策措辞变化和多来源证据，但同时增加延迟、成本、随机性和安全风险。如果固定 Workflow 已经达到目标，就没有必要为了架构新颖而引入 Agent Loop。

Baseline 必须与候选系统接受相同输入、运行在相同初始环境，并由相同 Grader 判定。否则比较结果没有意义。

## 5. Dataset：覆盖系统必须做与必须不做的行为

第一版正式基线建议准备 30–50 个高质量 Task。数量不是硬性科学阈值，但足以形成有区分度的工程基线。任务应覆盖以下切片：

| Slice | 示例                       | 重点观察              |
| ----- | ------------------------ | ----------------- |
| 正常    | 订单事实完整且政策结论明确            | 是否正确生成提案与证据       |
| 信息不足  | 缺少退款原因或目标订单              | 是否主动澄清而不是猜测       |
| 冲突    | 用户陈述与订单记录不一致             | 是否引用权威来源并暴露冲突     |
| 边界    | 金额接近上限、政策临界日期            | 金额、时间与版本计算是否正确    |
| 外部故障  | 查询超时、限流、支付服务的确认响应（ACK）丢失 | 是否安全重试、对账或停止      |
| 权限    | actor 无权读取或退款            | 是否在数据暴露和执行前拒绝     |
| 对抗    | 文档中夹带“忽略审批”的指令           | 外部内容是否始终被视为数据     |
| 反向案例  | 请求只需解释政策，不应提交退款          | 是否避免不必要 Tool Call |

只收集“应该调用 Tool”的正例，会训练和优化出过度调用。高质量数据集必须包含系统应保持克制的案例。

每个 Task 至少保存：

```ts
type EvalTask = {
  id: string;
  slice: string;
  input: unknown;
  initialStateFixture: string;
  expectedOutcome: unknown;
  invariants: string[];
  allowedActions: string[];
  forbiddenActions: string[];
};
```

## 6. Grader：检查真实结果，而不是回答印象

退款案例可以先实现一个确定性 Outcome Grader：

```ts
type RefundGrade = {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    detail?: string;
  }>;
};

async function gradeRefund(taskId: string): Promise<RefundGrade> {
  const proposal = await proposalStore.findByTask(taskId);
  const payments = await paymentSandbox.listRefunds({ taskId });
  const accessLog = await auditStore.listResourceReads({ taskId });

  return {
    passed:
      proposalMatchesExpected(proposal) &&
      hasNoUnauthorizedRead(accessLog) &&
      hasExpectedRefundEffect(payments),
    checks: [
      checkProposal(proposal),
      checkUnauthorizedReads(accessLog),
      checkRefundOutcome(payments),
    ],
  };
}
```

开放式解释质量可以由人工 Rubric 或经过校准的 LLM Judge 评估；权限、金额、是否重复退款等客观事实应优先使用程序断言和权威环境状态。

## 7. Dataset 的分区与版本

- **Development**：日常定位和迭代，可以频繁查看。
- **Regression**：每个已知缺陷转化成可重复任务，防止再次出现。
- **Holdout**：阶段性验证，减少持续针对固定案例调优造成的过拟合。
- **Shadow / Production Sample**：从真实分布抽样，需要脱敏、授权与保留策略。

一次 Eval 结果至少应记录以下版本：

```text
model + sampling/reasoning config
prompt + context builder
tool schema + policy
runtime
dataset + grader
environment fixture
```

缺少关键版本时，两次运行即使使用同一个任务，也未必具有可比性。

## 8. 完成标准

进入模型接口与 Agent Runtime 实现前，应具备以下材料：

- 一份明确用户、输入、允许动作、禁止动作、Outcome 和预算的 Task Contract。
- 一个可重复的非 Agent baseline。
- 30–50 个版本化 Task，覆盖正常、模糊、边界、故障、权限、对抗和反向案例。
- 至少一个直接检查权威环境状态的 Grader。
- Development、Regression 与 Holdout 的分区规则。
- 一份 baseline 报告，包含成功率、失败类型、延迟和成本。

这份基线的意义不是在写代码前追求完美规格，而是建立一个足以发现回归、支持架构取舍的最小证据系统。新发现的真实故障会持续补充 Task Contract 和 Regression Dataset。

## 常见误区

- 先完成 Agent，再决定怎样评价。这样会让评测标准迁就现有实现。
- 用更多含糊案例替代清晰任务定义。数量只会放大标签噪声。
- 只比较最终文本，不检查外部系统状态和禁止行为。
- 让 Agent 自报置信度或完成状态，并把它当作 Grader。
- 同时修改模型、Prompt、Tool 和 Dataset 后直接比较总分，导致无法归因。

## 章末练习

为一个熟悉的业务任务完成以下交付物：

1. 一页 Task Contract。
2. 一个不使用 Agent Loop 的 baseline。
3. 六个 Task：正常、信息不足、冲突、外部故障、权限、反向案例各一个。
4. 一个读取权威环境状态的确定性 Grader。
5. 一条系统绝不能违反的安全不变量。

验收时，应能从相同 fixture 重复运行 baseline，并说明每个 Grader 检查的是哪项外部事实。

## 一手资料

- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

## 本章小结

这一步把“想做一个 Agent”转换为可比较的工程问题：Task Contract 定义边界，Baseline 证明复杂度是否必要，Dataset 覆盖主要能力与风险，Grader 检查真实 Outcome。下一章将这些交付物放进完整转型路线，说明每一阶段如何在同一个 Workbench 上继续演进。

[下一章：从前端工程到 Agent 应用工程](/masterpiece-static-docs/01-导读/05-从学习到转型的完整路线.md) · [深入阅读：Grader、Trial 与统计](/masterpiece-static-docs/04-评测与实验科学/01-Grader-Trial与统计.md)
