# 04 · 从一次 Run 到 Trace、SLO 与成本

某次退款最终只发生了一次，但用户等待了十二分钟才得到确认。团队能从日志中找到几个 Timeout，却无法说明哪份政策进入了 Context、谁批准了提案、Command 提交后 ACK 在哪个环节丢失、新 Worker 何时接管，以及费用为什么比正常请求高四倍。

“记录了很多日志”不等于系统可观测。Agent 应用需要把一次 Run 的输入版本、模型决策、工具轨迹、策略、外部 Outcome 和费用连成因果链，才能判断质量、可靠性和成本是否同时达标。

## 1. 五类证据各有职责

| 信号      | 主要回答的问题                      |
| ------- | ---------------------------- |
| Metrics | 系统整体是否正在退化？哪些率、分位数或队列深度异常？   |
| Logs    | 某个组件在某一时刻记录了什么错误或诊断上下文？      |
| Traces  | 一次 Run 跨模型、工具、队列和服务的因果路径是什么？ |
| Audit   | 谁代表谁，在什么授权和审批下，对什么资源做了什么？    |
| Evals   | 某个版本在固定任务与真实结果上是否变好或退化？      |

Trace 不能替代 Audit：Span 能说明调用关系，却不一定满足不可抵赖、保留和访问控制要求。Eval 也不能替代生产指标：离线 Case 通过，不代表 Queue Time 和 Provider Error Rate 正常。

## 2. 为一次 Run 建立可复盘的 Trace

```text
trace_id=tr_123  run_id=run_123

context.build
  selected_policy=refund-policy-v7
  excluded_policy=refund-policy-v6 reason=stale
proposal.created
  order_ref=order_123 amount_minor=10000 resource_version=42
approval.granted
  actor_ref=user_42 proposal_hash=... expires_at=...
tool.attempt.started
  call_id=call_7 attempt_id=attempt_1 idempotency_key_hash=...
tool.attempt.timeout
  execution_status=timeout effect_status=unknown
control.cancel_requested
  actor_ref=user_42
worker.lease.acquired
  ownership_epoch=8 queue_time_ms=...
reconciliation.completed
  receipt_ref=receipt_789 effect_status=committed
run.completed
  outcome=completed_with_effect_after_cancel
```

这条记录没有保存模型原始 Chain-of-Thought，却足以还原 Context 选择、提案、审批、调用、Cancel、接管和真实 Outcome。

## 3. 建立稳定的 Canonical Telemetry Schema

Provider SDK 和 GenAI Observability 约定会演进，应用内部仍需要稳定字段：

```text
thread_id / run_id / item_id
call_id / attempt_id / activity_id
state_before / event / state_after
model_route / prompt_version / context_builder_version
tool_contract_version / policy_version / runtime_version
actor_ref / tenant_ref / resource_ref / action
approval_ref / idempotency_key_hash / ownership_epoch
execution_status / effect_status / outcome_ref
queue_ms / latency_ms / tokens / money / retry_count
```

跨 Node、Rust、MCP Server 和外部 Adapter 传播 W3C Trace Context 或等价协议。领域代码依赖内部 Schema，再由 Adapter 映射到具体 OpenTelemetry 版本，避免实验字段渗入业务模型。

## 4. SLI 从用户任务和安全不变量出发

Model API Uptime 只是依赖指标，不是 Agent 成功率。Agent 应用常见的 SLI 包括：

- Task Outcome Success Rate，以及关键 Protected Slice 的成功率；
- 未授权读取、重复副作用、跨租户访问等安全不变量违规率；
- `IN_DOUBT` 发生率、自动核对成功率和人工升级率；
- **Time to Truth**：从效果变为未知，到用户得到权威结论的时间；
- Orphan / Stale Run 数与 Worker 接管成功率；
- 端到端 P50/P95/P99，以及 Model、Queue、Approval、Tool、Reconciliation 分解；
- 每个成功任务的 Token、工具、计算和人工成本。

Time to Truth 特别适合衡量有副作用的 Agent。一次操作最终正确，但持续数小时处于未知状态，仍然是严重的产品与运营问题。

## 5. SLO 与零容忍边界

SLO 是某个时间窗口内对服务水平的目标，例如：

```text
退款任务成功率 ≥ 99.0%
P95 Time to Truth ≤ 5 min
自动核对率 ≥ 98.0%
人工升级率 ≤ 1.0%
P95 每成功任务成本 ≤ CNY 0.80
```

这些数字必须来自业务风险和基线，不应从示例直接复制。

错误预算适合管理普通可靠性退化，不适合稀释安全不变量。未经授权的写操作、跨租户泄漏、同一 Intent 产生重复退款等事件应直接阻断发布或触发 Kill Switch，而不是因为“仍在 0.1% 以内”被接受。

## 6. 计算 Cost per Successful Task

按 Run 汇总：

```text
Model input / output / cache / reasoning
+ Retrieval and third-party tools
+ Sandbox / compute / storage / network
+ Queue, retries and failed attempts
+ Reconciliation and manual review
+ Eval / Judge amortized cost
```

同时报告成功和失败任务的 P50/P95。只比较 Token 单价会漏掉重试放大、长 Queue、第三方工具、人工核对和 Multi-Agent Fan-out。更便宜的模型如果让成功率下降、工具调用增加，单位成功任务成本反而可能更高。

## 7. 遥测本身也是数据边界

默认记录类型化 Event、版本、引用、Hash、错误码和用量。全文只在确有诊断需要、严格 ACL 和短保留期下保存。以下内容不应默认进入普通 Trace：

- API Key、Cookie、OAuth Token 与完整 Authorization Header；
- 完整个人资料、订单正文和附件；
- 未脱敏 Tool Result；
- 模型原始 Chain-of-Thought；
- 可由低权限观察者推断敏感信息的高基数字段。

第三方观测平台属于新的数据出境方，需要独立的权限、保留、删除和供应链评估。

## 8. 事故复盘练习

为一次包含 Context 冲突、Tool Timeout、Cancel、Worker 重启和 Reconciliation 的 Run 生成 Trace，并写一页复盘：

1. 权威 Outcome 与用户影响；
2. 故障在哪个 Span 开始，为什么没有演变为重复效果；
3. 哪个 SLI 最早出现异常，告警是否及时；
4. Queue、Retry、核对和人工分别贡献多少时间与成本；
5. 删除敏感正文后，剩余结构化证据是否仍能完成归因；
6. 哪条 Eval Case 和发布门禁应由此次事故新增。

## 本章小结

可观测性把 Run 从零散日志还原为可验证的因果链。Trace 解释路径，Audit 解释责任，Outcome 解释真实结果，Eval 解释版本差异，SLI/SLO 与成本决定系统是否值得继续扩大流量。下一章将讨论这套证据如何进入 [发布、模型依赖与生产运营](/masterpiece-static-docs/09-可靠性与可观测/05-发布-模型依赖与生产运营.md)。

## 一手资料

- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenAI Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization)

> OpenTelemetry 的 GenAI Semantic Conventions 仍在演进。相关状态核验日期为 2026-07-15；实施时应固定依赖版本并通过 Adapter 映射。
