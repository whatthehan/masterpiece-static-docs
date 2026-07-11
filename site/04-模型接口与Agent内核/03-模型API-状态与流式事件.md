# 03 · 模型 API、状态与流式事件

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

## 章末检查

1. Provider state、application state 和 model context 有何差异？
2. 为什么工具只能在完整 item 并通过校验后执行？
3. 断流后怎样避免把部分回答误标为完成？

## 一手资料

- [OpenAI Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
