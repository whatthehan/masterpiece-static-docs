# 03 · 模型 API、状态与流式事件

浏览器调用普通 JSON API 时，`200 OK` 后通常可以一次性解析完整响应。模型 API 的行为更像一个事件源：文本、reasoning item、Tool Call 参数、拒绝和用量信息可能分批到达，连接也可能在任意位置中断。若应用只把所有 delta 拼成字符串，就无法判断工具参数是否完整，也无法可靠区分“用户看到了部分文本”和“本次运行已经完成”。

本章建立模型协议层的基本对象，并把 Provider Event 与应用自己的运行状态分开。这个分层会直接影响后续的工具执行、断线恢复和 UI 设计。

## 本章目标

- 理解 response、item、content part、Tool Call 与 Tool Result 的关系。
- 区分 provider state、application state 和 model context。
- 从流式事件安全地重建语义 Item。
- 建立可操作的错误分类，而不是对所有失败统一重试。

## 1. 模型调用不是“字符串进、字符串出”

现代模型 API 的输入和输出都可能包含多种 item：

- 用户或开发者消息；
- 模型生成的文本或结构化数据；
- reasoning item 或其受控摘要；
- Tool Call；
- 与 `call_id` 关联的 Tool Result；
- 拒绝、截断和其他模态内容。

一次工具交互的通用时序如下：

```mermaid
sequenceDiagram
    participant R as Runtime
    participant M as Model API
    participant T as Tool Executor
    R->>M: context + tool definitions
    M-->>R: completed Tool Call item
    R->>R: protocol / schema / policy validation
    R->>T: execute validated command
    T-->>R: typed Tool Result
    R->>M: Tool Result linked by call_id
    M-->>R: final item or another Tool Call
```

模型只负责产生候选调用。应用校验并执行工具，再把观察结果送回下一轮。Tool Result 必须与原始 `call_id` 关联，否则模型和 Runtime 无法判断它回答了哪一项请求。

## 2. 三种“状态”属于不同层

### Provider conversation state

模型提供方保存的 conversation、response 或 previous-response 关系。它能减少每次显式重发历史的工作量，但数据保留、计费和可移植性取决于具体 API。

### Application state

产品自己的 Thread、Run、Item、预算、权限、审批和业务引用。它是 UI 恢复、审计和领域规则的权威来源，不能委托给模型提供方。

### Model context

某一次调用实际进入模型窗口的 token。它是从应用状态和外部知识中选择出来的临时投影，并不等于完整历史。

三者的关系可以概括为：

```text
Application state ──select/compact──> Model context
Model context ──request──> Provider conversation/response
Provider events ──adapt/reduce──> Application state
```

Stateful 与 stateless 调用只是 provider state 的两种管理方式。无论采用哪一种，应用都必须保留自己的业务状态和版本。

## 3. 用 Thread、Run、Item 和 Event 组织产品语义

一种通用、与供应商无关的建模方式是：

| 对象     | 含义            | 示例                                          |
| ------ | ------------- | ------------------------------------------- |
| Thread | 一段长期任务或交互的容器  | 一次售后问题处理                                    |
| Run    | 针对一个目标的单次执行   | 判断退款资格并生成提案                                 |
| Item   | 有类型、可持久化的产物   | 消息、Tool Call、Tool Result、审批、报告              |
| Event  | Run 中发生的不可变变化 | item completed、approval required、run failed |

这些名称不是某一家 API 的强制标准。它们的价值在于避免一个 `messages[]` 同时承担聊天记录、事件日志、恢复状态、审批记录和长期记忆。

## 4. Streaming 是协议，不只是打字机效果

流式处理至少需要识别三层边界：

```text
TCP/HTTP chunk
→ 完整 SSE 或协议 event
→ 完整的应用语义 item
```

应用应按 `event.type` 分发，而不是从文本前缀猜测类型；同时保留 response ID、item ID、content-part ID 和 call ID。一个简化的 assembler 可以这样设计：

```ts
type Assembly = {
  itemId: string;
  kind: "message" | "tool_call";
  text: string;
  argumentsText: string;
  closed: boolean;
};

function reduceProviderEvent(
  state: Map<string, Assembly>,
  event: ProviderEvent,
): Map<string, Assembly> {
  switch (event.type) {
    case "item.created":
      return addItem(state, event.itemId, event.kind);
    case "text.delta":
      return appendText(state, event.itemId, event.delta);
    case "tool.arguments.delta":
      return appendArguments(state, event.itemId, event.delta);
    case "item.completed":
      return closeItem(state, event.itemId);
    default:
      return state;
  }
}
```

Assembler 只负责重建协议对象。`item.completed` 之后，Runtime 还需要解析 JSON、执行 Schema 校验和领域校验。收到第一段工具参数时绝不能提前执行。

## 5. Provider Event 不能直接成为产品事件

让浏览器直接消费供应商原始流看似简单，却会产生三类耦合：

- UI 依赖供应商事件名和增量格式；
- 页面刷新后难以判断哪些 item 已经成为应用事实；
- provider response 完成可能被错误映射为业务 Run 完成。

稳定链路应包含 adapter：

```mermaid
flowchart LR
    P["Provider Event"] --> A["Provider Adapter"]
    A --> C["Canonical RunEvent"]
    C --> T["SSE / WebSocket Adapter"]
    T --> U["UI Reducer"]
```

| 层                  | 负责                             | 不负责                   |
| ------------------ | ------------------------------ | --------------------- |
| Provider Adapter   | 解析厂商协议、闭合 item、保留 provider IDs | 判断退款是否成功              |
| Canonical RunEvent | 表达稳定的应用语义                      | 暴露原始 reasoning 或未校验参数 |
| Transport Adapter  | sequence、重连、心跳和兼容              | 定义业务状态                |
| UI Reducer         | 从事件派生可见状态                      | 执行工具或写领域事实            |

完整的 Canonical Event、Snapshot 与重连协议将在[Agent Application Server 与 UI 事件协议](/masterpiece-static-docs/05-模型接口与Agent内核/09-Agent-Application-Server与UI事件协议.md)中实现。

## 6. 完成、截断与断流

应用只有在满足以下条件时才能把一个模型 item 视为完整：

1. 收到协议定义的明确完成事件；
2. 所有引用 ID 可以解析；
3. 内容满足目标类型的完整性要求；
4. 对 Tool Call，参数能够解析且通过结构校验。

连接断开、内容截断或 provider 标记 incomplete 时，应保留已接收内容用于诊断，但不能把它升级为可执行动作。用户已经看到一段文本，与 Runtime 已经提交结果，是两个不同事实。

## 7. 错误按发生层分类

| 层               | 示例                    | 主要处理位置                        |
| --------------- | --------------------- | ----------------------------- |
| Transport       | DNS、TLS、连接中断          | HTTP client / network adapter |
| Protocol        | 未知必需事件、缺字段、关联 ID 错误   | Provider Adapter              |
| Provider        | rate limit、服务错误、拒绝、截断 | Model Gateway / Runtime       |
| Model semantics | 错工具、错误参数、无依据结论        | validation / policy / eval    |
| Tool            | timeout、业务冲突、权限拒绝     | Tool Adapter / Executor       |
| Application     | 非法状态转移、预算计算错误         | Runtime Core                  |

只有明确可重试的瞬时错误才应重试。Schema 错误、权限拒绝和协议不兼容不会因为指数退避自动恢复；Tool Command 超时还可能意味着副作用已经发生，必须先查询回执。

## 实践：从事件 fixture 重建一次响应

不连接真实模型，先准备类型化 fixture：

1. 文本由三个 delta 组成并正常关闭。
2. Tool Call 参数跨四个 delta，在第三个 delta 后断流。
3. 同一完成 event 被重放两次。
4. response 标记 completed，但应用仍在等待审批。

实现 Provider Adapter，并验证：

- 正常文本只生成一个 completed item；
- 未闭合 Tool Call 永远不会产生 `tool.proposed`；
- 重复事件不会重复创建 item；
- provider completed 不会把等待审批的 Run 标记为 completed。

## 常见误区

- Provider 保存 conversation 等于应用已经拥有持久状态。
- 收到 Tool Call delta 后即可执行工具。
- HTTP 200 表示模型任务完整成功。
- Streaming 只影响 UI 的显示速度。
- 一个 messages 数组足以承担状态、审计和长期记忆。

## 本章小结

模型 API 返回的是带类型、生命周期和关联 ID 的事件，而不是一个最终字符串。Provider state、应用状态和本轮 Context 分属不同层；Provider Event 也必须经过 adapter 才能成为稳定的产品事件。下一章将用 [JSON Schema](/masterpiece-static-docs/05-模型接口与Agent内核/04-JSON-Schema基础.md) 为模型输出和工具参数建立运行时结构契约。

## 延伸阅读

- [OpenAI: Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI: Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [WHATWG: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
