# 04 · Trace、SLO 与成本

## 学习目标

- 区分 Metrics、Logs、Traces、Audit 和 Evals。
- 用任务成功、安全、尾延迟和成功任务成本定义 SLO。
- 在可诊断与隐私之间做有意识的数据设计。

## 1. 五类证据

| 类型      | 回答的问题               |
| ------- | ------------------- |
| Metrics | 整体分布、趋势与告警是什么？      |
| Logs    | 某个离散事件或错误发生了什么？     |
| Traces  | 一个 Run 跨组件的因果路径是什么？ |
| Audit   | 谁代表谁，经何授权执行了什么？     |
| Evals   | 系统在定义任务集上的质量如何？     |

它们互补，不能用“日志很全”替代评测或审计。

## 2. Trace Context

Run、model call、retrieval、policy、approval 和 tool attempt 共享 trace ID，通过 parent/child span 表示因果关系。跨 Node/Rust/MCP 服务需要传播 W3C Trace Context 或等价稳定协议。

## 3. Agent SLI

- 任务成功率与 protected slice 成功率。
- 未授权/高风险违规率。
- 正确拒绝与错误拒绝率。
- loop、retry、approval 和 escalation 率。
- end-to-end p50/p95/p99 latency。
- 每成功任务 Token、调用和金额成本。
- 恢复成功、重复副作用和孤儿任务数。

模型 API uptime 只是依赖指标，不代表 Agent SLO。

## 4. Cost per Successful Task

按 Run 记账：

```text
model input/output/cache/reasoning
+ retrieval and third-party tools
+ sandbox/compute/storage/network
+ retries and failed attempts
+ eval/judge cost
```

只比较单次模型价格会忽略失败、重试和多 Agent 放大。报告 p50/p95，避免平均数掩盖长尾。

## 5. 敏感数据控制

默认记录结构化字段、hash/摘要、版本、错误码和用量；全文按最小必要、访问控制和保留期处理。不要默认记录凭证、完整工具结果、个人数据或隐藏 CoT。Telemetry exporter 和第三方观测平台本身也是数据出境边界。

## 6. SLO 与错误预算

SLO 是在时间窗口内承诺的服务水平。错误预算用于决定继续发布还是优先可靠性修复。安全关键不变量不应用普通错误预算合理化；它们可能要求零容忍和立即停用。

## 纸面微实验（30–45 分钟）

为模型慢、工具超时、策略拒绝和写操作重复四种 Run 画 trace tree，定义 span/event/metric/audit 字段和每成功任务成本算式。然后删除全文与凭证，检查剩余结构化证据是否仍能定位故障层。

## L1 后系统实验

实际注入上述四种故障，验证跨模型、Runtime、工具和执行面的 trace 传播，并用同一 Run ID 对齐真实 outcome、audit 和计费数据。

## 常见误区

- 模型 API 99.9% 可用等于 Agent 99.9% 成功。
- 平均延迟足以描述用户体验。
- Trace 应保存全部正文才能排障。
- Token 单价就是 Agent 成本。
- OpenTelemetry 自动定义了正确业务字段。

## 章末检查

1. Audit 与 Trace 分别解决什么问题？
2. 为什么应计算 cost per successful task？
3. 哪些安全指标不适合用普通错误预算放宽？

## 一手资料

- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenAI Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization)

> GenAI OpenTelemetry 语义约定仍在演进。应用应固定版本并通过 adapter 映射，不把实验字段扩散为领域模型。
