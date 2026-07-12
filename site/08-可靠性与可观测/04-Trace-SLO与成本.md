# 04 · Trace、SLO 与成本

`order_123` 最终只产生一笔 100 元退款，但这还不足以说明系统工作良好。小林为什么看见政策冲突？ACK 在哪里丢失？Cancel 为什么没有阻止已经发生的 Commit？Worker B 接管用了多久？如果这些问题只能靠翻找零散日志回答，下一次事故仍然无法快速收敛。

本章把前四步串成一次 Trace 复盘，并据此定义任务成功、安全、恢复时间和成功任务成本。重点不再是收集更多遥测，而是让每种证据回答一个明确问题。

## 学习目标

- 区分 Metrics、Logs、Traces、Audit 与 Evals。
- 用同一个 `run_id` 对齐 Outcome、状态转移、责任链和费用。
- 定义包含未知效果收敛时间的 Agent SLI/SLO。

## 1. 一条可以复盘的事件链

```text
trace_id=tr_refund_123  run_id=run_refund_123

policy.conflict_detected
  sources=[refund-policy-2026-04, refund-policy-2026-07]
context.rebuilt
  selected=refund-policy-2026-07  excluded=refund-policy-2026-04
proposal.created
  order=order_123  amount=CNY100  resource_version=42
approval.granted
  actor=小林  proposal_hash=...  expires_at=...
tool.attempt.started
  idempotency_key=refund:order_123:v42  attempt=1
tool.attempt.timeout
  execution=timeout  effect=unknown
control.cancel_requested
  actor=小林
worker.lease_acquired
  ownership_epoch=8
reconciliation.query.completed
  refund_id=rf_789  effect=committed
run.completed_with_effect_after_cancel
  outcome=one_refund  amount=CNY100
```

这段结构化记录不需要保存模型原始思维链，却足以解释 Context 选择、授权、工具尝试、Cancel、Worker 接管和真实 Outcome。

## 2. 五类证据各自回答什么

| 类型      | 在 `order_123` 中回答的问题                         |
| ------- | -------------------------------------------- |
| Metrics | ACK-loss、`IN_DOUBT`、核对延迟是否正在上升？              |
| Logs    | 某个 Worker 为什么退出、某次 Provider/Tool 调用返回了什么错误码？ |
| Traces  | 从政策冲突到退款回执的跨组件因果路径是什么？                       |
| Audit   | 谁代表谁读取政策、批准并执行了哪笔退款？                         |
| Evals   | 新版本在固定任务集上是否提高 Outcome 且没有增加违规？              |

五者互补。“日志很全”不能替代权威 Outcome、授权审计或版本化 Eval。

## 3. Trace Context 与 Agent 语义

Run、Context Build、Model Call、Retrieval、Policy、Approval、Tool Attempt 与 Reconciliation 共享 Trace ID，并用 Parent/Child Span 表示因果关系。跨 Node、Rust、MCP 和第三方 Adapter 传播 W3C Trace Context 或等价稳定协议。

除了通用 Span 字段，还要保留 Agent 语义：

```text
thread_id / run_id / item_id / call_id / attempt_id
state_before / event / state_after
model + prompt + toolset + policy + context_builder versions
actor / tenant / resource / action（脱敏或引用）
idempotency_key hash / ownership_epoch / approval reference
execution_status / effect_status / outcome reference
token / latency / money / retry / queue time
```

## 4. 从这次事故得到的 SLI

- Task Outcome 成功率与 Protected Slice 成功率。
- 未授权、跨租户、重复副作用等安全不变量违规率。
- `IN_DOUBT` 产生率、自动核对成功率和转人工率。
- **Time to Truth**：从效果未知到用户得到权威结论的时间。
- Stale/Orphan Run 数、Worker 接管成功率和旧 epoch 写入拒绝数。
- End-to-end p50/p95/p99 延迟及 Queue/Approval/Reconciliation 分解。
- 每成功任务 Token、工具、沙箱、重试和人工处理成本。

模型 API Uptime 只是依赖指标。Provider 全绿时，错误 Policy、拥塞队列或无法恢复的 Worker 仍会让 Agent SLO 失败。

## 5. SLO、错误预算与零容忍边界

SLO 在时间窗口内承诺服务水平，错误预算决定继续发布还是优先修复。例如可以为普通退款任务定义 Outcome 成功率、p95 Time to Truth 和人工升级率目标。

安全不变量不能被普通错误预算稀释：跨租户读取、未经授权的写操作、同一幂等意图产生重复退款等事件应立即阻断发布或触发 Kill Switch。`order_123` 的 ACK 丢失可以计入可靠性预算；重复退两次不能因为“仍低于 0.1%”而被接受。

## 6. Cost per Successful Task

按 Run 汇总：

```text
model input/output/cache/reasoning
+ retrieval and third-party tools
+ sandbox/compute/storage/network
+ queue, retries and failed attempts
+ reconciliation and manual review
+ eval/judge cost
```

报告 p50/p95 及失败任务成本。只比较 Token 单价会漏掉 Provider 故障、重试放大、人工核对和 Multi-Agent Fan-out。`order_123` 虽然 Outcome 正确，Time to Truth 与核对成本仍可能说明当前版本不适合扩大流量。

## 7. 最小披露仍然适用

默认记录类型化事件、版本、哈希/摘要、错误码和用量；全文只在最小必要、严格 ACL 与保留期内保存。不要默认写入凭证、完整订单、全部工具结果、个人数据或原始思维链。Telemetry Exporter 和第三方观测平台本身也是新的数据出境边界。

## 事故复盘练习（45 分钟）

使用上面的事件链写一页复盘：

1. 真实 Outcome 与用户影响。
2. ACK 丢失为何变成 Unknown Effect，而非重复退款。
3. Cancel、Worker 重启与 Fencing 分别发挥了什么作用。
4. 哪个 SLI 最早暴露问题，哪个发布门禁应阻止扩大流量。
5. 删除订单正文和凭证后，剩余证据能否仍然完成归因。

## L1 后系统实验

注入政策冲突、Tool ACK 丢失、Cancel、Worker 强杀与旧 epoch 迟到写入。验证所有组件传播同一 Trace Context，并能用 `run_id` 对齐权威 Outcome、Audit、Eval 和成本；随后检查告警是否能在孤儿任务或 Time to Truth 超标前触发。

## 常见误区

- 模型 API 99.9% 可用等于 Agent 99.9% 成功。
- 平均延迟足以代表用户体验。
- Trace 保存全部正文才可诊断。
- Token 单价就是成功任务成本。
- OpenTelemetry 自动定义了正确的业务语义。

## 章末检查

1. Audit 与 Trace 分别解决什么问题？
2. 为什么需要单独度量 Time to Truth？
3. 哪些安全指标不适合普通错误预算？
4. 为什么成本应按成功任务而不是单次模型调用计算？

## 本章小结

一次事故只有被 Outcome、Trace、Audit、Eval 与成本共同解释，才会变成可改进的工程事实。`order_123` 的复盘证明系统没有重复退款，也暴露了 ACK-loss、核对延迟和 Worker 切换的运营代价。知道问题还不够；下一章进入[发布、模型依赖与生产运营](/masterpiece-static-docs/08-可靠性与可观测/05-发布-模型依赖与生产运营.md)，决定新模型、新 Provider 或新配置怎样安全进入真实流量。

## 一手资料

- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenAI Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization)

> GenAI OpenTelemetry 语义约定仍在演进。应用应固定版本并通过 Adapter 映射，不把实验字段扩散为领域模型。
