# 03 · 模型 API、状态与流式事件

把 Context 组装好并不等于完成了一次模型调用。真实 API 返回的是带类型和关联 ID 的事件序列：退款参数可能分多个增量到达，连接可能中途断开，工具调用也只有在完整 Item 关闭后才具备校验条件。把这些事件粗暴拼成文本，会让部分输出被误当成成功，也会给重复执行留下入口。

本章把提供方协议与应用状态分开：流式传输（Streaming）负责交付响应事件，Thread、Run 与 Item 负责产品中的权威运行语义。理解这层分界，是下一步设计 Schema 和安全工具调用的前提。

## 学习目标

- 区分消息、response item、tool call、tool result 和应用运行状态。
- 理解 stateful 与 stateless 调用的权衡。
- 能从类型化事件重建响应并正确处理终态。

## 1. 模型调用不是字符串进、字符串出

现代模型 API 的响应可能包含多类 item：文本、结构化输出、reasoning item、工具调用、工具结果关联、拒绝或其他模态数据。应用不应只取一个拼接后的 `text` 字段并丢弃语义。

典型工具交互：

```text
request(tools, context)
→ response(function_call with call_id)
→ application validates and executes
→ request(function_call_output linked by call_id)
→ response(final output or more calls)
```

## 2. 三种状态不要混合

- Provider conversation state：提供方保存的 conversation/previous response 关系。
- Application thread state：产品自己的 Thread/Run/Item、权限、预算和审批。
- Model context：某一次调用实际送入模型的 Token。

提供方保存会话可以降低应用重放复杂度，但不替代权威业务状态。数据保留、隐私、可移植性和重放能力也必须单独评估。

- Stateful 调用：提供方 conversation/previous response 保存或关联 item；应用仍要持有业务状态与版本。
- Stateless 调用：应用显式重放需要的 item，控制数据保留和可复现性，但承担更多 Context 管理。

两种模式都可能对历史输入计费，也都不自动成为长期记忆；以目标 API 的数据控制和计费文档为准。

## 3. 一个通用应用模型

```text
Thread：用户可持续交互的容器
Run：一次目标驱动的执行
Item：消息、工具提案、结果、审批、工件等有类型记录
Event：Run 生命周期中的不可变语义变化
```

这不是某一家 API 的强制命名，而是避免用一个 messages 数组承担所有职责的实用分层。

## 4. Streaming 是事件协议

流式响应通常通过 SSE 或等价机制发送增量事件。应用需要：

- 按 event type 分发，而不是解析自由文本前缀。
- 处理 item created、delta、done、completed、failed、incomplete 等语义。
- 正确关联 response、item、content part 和 tool call ID。
- 区分 TCP chunk、完整 SSE event 与应用语义 item；单连接 SSE event 有序，但 chunk 可拆分 event。
- 重连、服务端 replay、多通道或内部消息总线可能产生重复、缺口或跨通道乱序，应使用 event/sequence ID 去重和检测。
- 只有收到明确完成事件并通过应用校验，才把 Run 标为完成。

“用户已经看到一部分文本”不代表事务提交或工具完成。

### Provider Event 不是产品事件

这里最容易出现一条看似省事、实际很脆弱的捷径：浏览器直接消费模型提供方的原始事件。这样做会让 UI 绑定厂商事件名，也会在断线后失去“哪些 Item 已经成为应用事实”的判断依据。

真实链路至少有四层：

```text
Provider Event
  → Provider Adapter：解析厂商协议、闭合 Item、保留 provider IDs
  → Canonical RunEvent：应用稳定的 Thread / Run / Item 语义
  → SSE / WebSocket Adapter：重连、序列、兼容和公开字段
  → UI Reducer：派生用户看到的状态
```

| 层                  | 可以变化的内容                        | 不应承担的责任                    |
| ------------------ | ------------------------------ | -------------------------- |
| Provider Event     | 厂商事件名、delta 结构、finish reason   | 产品长期兼容契约                   |
| Canonical RunEvent | 领域事件版本、Run/Item 语义             | 直接暴露密钥、原始 reasoning 或未校验参数 |
| Transport Frame    | SSE `id`、heartbeat、snapshot 通知 | 定义退款是否成功                   |
| UI Projection      | 文本、工具卡片、审批和终态展示                | 充当业务权威状态                   |

例如，工具参数 delta 可以先由 Provider Adapter 累积；只有 Item 明确闭合并通过 Schema 校验，Runtime 才产生 `tool.proposed`。提供方的 response completed 也不能越过 Runtime，直接把应用 Run 写成 `COMPLETED`。

完整 TypeScript 契约、断线补发和 UI Reducer 将在 [Agent Application Server 与 UI 事件协议](/masterpiece-static-docs/04-模型接口与Agent内核/09-Agent-Application-Server与UI事件协议.md)实现。

## 5. 错误分类

| 层               | 例子                | 处理责任                   |
| --------------- | ----------------- | ---------------------- |
| Transport       | DNS、TLS、断连        | client/network adapter |
| Protocol        | 未知事件、缺字段、关联 ID 错  | API adapter            |
| Provider        | 限流、服务错误、拒绝、截断     | model gateway/runtime  |
| Model semantics | 错工具、错参数、无根据结论     | validation/eval/policy |
| Tool            | timeout、业务错误、权限拒绝 | executor/tool adapter  |
| Application     | 非法状态转移、预算错误       | runtime core           |

把所有错误都重试会制造费用、循环和重复副作用。

## 前置桌面推演（30 分钟）

使用手写的十条伪事件 fixture，不要求真实 Agent，实现或手工验证：

1. 重建文本与工具调用。
2. 在任意 delta 后断流，状态必须是 incomplete/failed，而非 completed。
3. 重放重复事件，不能重复提交工具。
4. 模拟用户取消，停止模型流并传播到下游。

通过证据：能从事件恢复 item；遇到缺口、`incomplete` 或未闭合 tool call 时绝不进入 `COMPLETED`。

## 常见误区

- Provider 保存 conversation 就等于应用拥有持久状态。
- 收到 tool call delta 就可以执行。
- HTTP 200 表示模型任务完整成功。
- Streaming 只影响 UI 打字机效果。
- messages 数组可以同时充当事件日志、状态和长期记忆。

## 本章小结

模型响应应被视为一组可关联、可判定完整性的语义 Item，而不是一个最终字符串；Provider state、应用状态和本轮 Context 也必须分别治理。Provider Event 先经过 Adapter 才能成为稳定的产品事件。下一章将用 [JSON Schema](/masterpiece-static-docs/04-模型接口与Agent内核/04-JSON-Schema基础.md) 为这些模型输出和工具参数建立可执行的结构契约。

## 章末检查

1. Provider state、application state 和 model context 有何差异？
2. 为什么工具只能在完整 item 并通过校验后执行？
3. 断流后怎样避免把部分回答误标为完成？
4. 为什么浏览器不应直接把 Provider Event 当作产品状态协议？

## 一手资料

- [OpenAI Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

[前置探针后、M0 尚未冻结：返回 M0 收敛任务基线](/masterpiece-static-docs/00-导读/04-M0任务契约-Baseline与数据集.md) · [M0 已冻结：继续 L0 JSON Schema](/masterpiece-static-docs/04-模型接口与Agent内核/04-JSON-Schema基础.md)
