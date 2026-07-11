# 07 · 架构模式与多 Agent 边界

## 学习目标

- 按控制权与任务结构选择模式，而不是按流行度。
- 知道何时不需要 Agent。
- 理解多 Agent 的真实收益、代价和前置条件。

## 1. 复杂度递进

```text
确定性代码
→ 单次模型调用
→ 模型 + RAG
→ 固定 Workflow
→ 有界单 Agent
→ 多 Agent
```

只有当前一层无法满足任务且 Eval 证明下一层有收益时才升级。自主性是连续谱，不是越高越先进。

## 2. 常用模式

| 模式                   | 谁控制流程           | 适合          | 主要风险            |
| -------------------- | --------------- | ----------- | --------------- |
| Prompt Chaining      | 代码              | 固定阶段、每步可验证  | 错误级联、额外延迟       |
| Router               | 代码+分类器/模型       | 类别清晰、后续策略不同 | 误路由、类别漂移        |
| Parallelization      | 代码              | 独立子任务或多样采样  | 成本、汇合、共享状态      |
| ReAct                | 模型逐步选择          | 下一步依赖观察     | 循环、局部贪心、上下文膨胀   |
| Plan-and-Execute     | 模型计划+Runtime 执行 | 可分解长任务      | 计划陈旧、把计划误当授权    |
| Evaluator-Optimizer  | 生成器+评估器         | 有明确“更好”标准   | grader 被利用、无限迭代 |
| Orchestrator-Workers | 总控动态拆分          | 子任务数量未知且可并行 | 协调、重复、验证困难      |
| Handoff              | 专家接管            | 责任和上下文应转移   | 责任不清、恢复困难       |
| Agents-as-Tools      | 总控保留责任          | 专家只返回有限结果   | 总控上下文和验证负担      |

## 3. ReAct 的工程化

论文中的 Reason→Act→Observe，在产品中应落为：

```text
Decision summary
→ Proposed Action
→ Validated Execution
→ Typed Observation
```

不要把公开原始 Chain-of-Thought 当协议。审计对象是动作、参数、结果、来源和状态转移。

## 4. Plan 是可修改工件

计划至少包含 `step_id / goal / dependencies / status / completion_criteria / evidence`。新证据、用户 steer、权限变化、预算变化或工具失败都可能触发重规划。计划本身永远不是执行授权。

## 5. Multi-Agent 何时合理

> 本节的实现属于 L1 后。首次门禁只要求能判断何时不该使用，并能描述新增协议责任。

可能有价值：

- 子问题可以独立并行探索。
- 需要隔离不同上下文、工具或权限。
- 单一上下文容纳不了探索过程。
- 专家角色有可测的能力差异。

通常不合理：

- 只是给同一模型添加多个角色名。
- 所有参与者必须共享完整状态。
- 没有可靠的汇总和验证器。
- 单 Agent baseline 尚未建立。
- 成本和延迟预算不允许放大。

多 Agent 会增加通信损耗、上下文重述、权限传播、终止检测和失败归因难度。

## 6. L1 后的最小委派 Envelope

多 Agent 不能只传一段自然语言。委派消息至少需要：

```text
protocol/schema version
sender workload identity + original actor/delegation chain
parent_run_id + task_id + attempt_id + idempotency_key
goal + constraints + success criteria
allowed tools/scopes + data classification
deadline + cancel correlation
input refs + provenance + trust labels
expected result schema + ownership
trace context + sequence/version
```

接收方重新验证身份和衰减后的权限，不能因为消息“来自内部 Agent”就信任。协调器必须处理重复、迟到、乱序、恶意/失败 Worker、循环委派和取消传播；迟到结果不能覆盖已关闭或新版本任务。

## 前置桌面推演（30 分钟）

对同一研究任务画四个实现：固定 Workflow、ReAct、Plan-and-Execute、Orchestrator-Workers。分别标记控制权、状态归属、终止条件、最大调用数、错误传播和评测方法。选择最简单且满足要求的一个。

通过证据：如果选择 Multi-Agent，必须指出可测的上下文隔离、权限隔离或并行收益，以及委派、终止和验证成本；“角色更多”不通过。

## L1 后系统实验

用固定 mock Worker 注入重复结果、迟到结果、权限扩大、循环委派和恶意内容。只有 envelope 校验、task ownership、deadline/cancel 和 Eval 全部通过后，才允许接入真实 Worker。

## 常见误区

- 用了工具就是 Agent。
- 多次调用模型就是多 Agent。
- Agent 必须先生成完整计划。
- Multi-Agent 天然比单 Agent 更全面。
- 框架决定了架构模式。

## 章末检查

1. Router 为什么通常仍是 Workflow？
2. Plan-and-Execute 为什么必须允许重规划？
3. 多 Agent 至少要证明哪一种隔离或并行收益？

## 一手资料

- [Anthropic Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [ReAct](https://arxiv.org/abs/2210.03629)
- [ReWOO: Decoupling Reasoning from Observations](https://arxiv.org/abs/2305.18323)
- [MAST: Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)
