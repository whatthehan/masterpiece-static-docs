# 02 · 结果、轨迹与 Trace

## 学习目标

- 同时评估最终结果与执行过程。
- 用不变量检查轨迹，而不是锁死唯一正确路径。
- 建立不依赖原始 Chain-of-Thought 的可诊断 Trace。

## 1. Outcome 优先

```text
Agent 文本："退款成功"
真实 Outcome：支付系统是否存在且只存在一笔合法退款
```

完成声明、工具返回文本和 UI 成功页都可能错误。Outcome grader 应直接查询权威环境。

## 2. 为什么还要评轨迹

两个相同 outcome 可能有完全不同风险：一个用一次正确查询完成，另一个越权读取大量数据后碰巧答对。轨迹可检查：

- 工具选择和参数。
- 是否跳过授权/审批。
- 是否泄露无关数据。
- 是否重复、循环或浪费预算。
- 是否在取消或终态后继续行动。
- 证据是否真的支撑结论。

## 3. 不要锁死唯一路径

Agent 对开放任务可能有多个合法解。Trajectory grader 应检查必要不变量、禁止行为和效率边界，不要求每一步等于参考轨迹。

示例不变量：

```text
所有外部写操作前必须有 policy_allow
高风险写操作必须引用未过期 approval_id
任意 tool_result.call_id 必须对应已有 proposal
Run 进入终态后不得有 tool_started
跨租户数据不得进入 model context
```

## 4. 最小 Trace 树

```text
Run
├─ context/retrieval
├─ model invocation
├─ tool proposal
├─ validation/policy decision
├─ approval wait/resume
├─ tool execution/attempts
├─ checkpoint
└─ final outcome/grading
```

每个 span 记录 trace/run/parent ID、版本、开始结束、状态、错误类别、用量和经过脱敏的参数摘要。

## 5. Trace 不等于 CoT

记录可验证的输入摘要、计划工件、动作、证据、策略结论、状态转移和真实效果。不要默认记录隐藏推理或全部原文；它们可能不忠实、含敏感数据且难以稳定解析。

## 微实验

制造三个失败：模型选错工具、策略拒绝合法动作、工具提交后丢 ACK。仅看最终文本尝试定位，再使用结构化 Trace 定位，比较可诊断性。

## 常见误区

- Outcome 正确就不需要检查过程。
- Reference trajectory 是唯一合法路径。
- Trace 越完整越好，应保存全部 Prompt 和 CoT。
- Logs、Trace、Audit 和 Eval 是同一种数据。
- 一条模型 span 足以覆盖整个 Agent Run。

## 章末检查

1. 为什么 outcome 与 trajectory 必须同时评？
2. 什么是轨迹不变量？
3. 怎样在不保存原始 CoT 的情况下诊断错误工具选择？

## 一手资料

- [OpenAI Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
- [Anthropic Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [AgentBoard](https://arxiv.org/abs/2401.13178)
