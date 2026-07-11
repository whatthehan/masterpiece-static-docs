# 01 · TypeScript + Node 运行时先修

前一部分已经建立了评测和归因方法，现在才进入实现。订单退款 Workbench 的一次运行会同时面对模型流、参数校验、审批等待、工具回执和用户取消；如果底层异步与类型边界含糊，后面再严密的 Agent 设计也会被阻塞、失控并发或非法状态破坏。

本章不是一份通用 TypeScript 教程，而是挑出实现 Agent Runtime 必须掌握的语言与 Node.js 运行时能力。目标是先建立可靠的状态表达、并发边界和取消传播，再把这些能力用于后续的模型接口与状态机。

## 学习目标

- 掌握实现 Agent 状态机所需的类型、异步、流与取消模型。
- 理解 TypeScript 类型在运行时会被擦除。
- 能识别 Event Loop 阻塞、无界 Promise 和流背压问题。

## 1. TypeScript 类型是设计约束，不是输入验证

网络、模型和工具返回的 JSON 在运行时仍是不可信数据。TypeScript interface 不会自动验证它；必须在边界使用 JSON Schema/Zod 等 runtime validator。

适合 Agent 状态的类型骨架如下。这是为了展示 discriminated union；权威字段和完整转移表见 04/06：

```ts
type RunState =
  | { kind: "created" }
  | { kind: "running_model"; responseId: string }
  | { kind: "validating_action"; proposalId: string }
  | { kind: "waiting_input"; questionId: string }
  | { kind: "waiting_approval"; proposalId: string }
  | { kind: "executing_tool"; callId: string }
  | { kind: "observing"; callId: string }
  | { kind: "cancel_requested" }
  | { kind: "cancelling" }
  | { kind: "in_doubt"; callId: string }
  | { kind: "reconciling"; callId: string }
  | { kind: "completed"; outputId: string }
  | { kind: "completed_with_effect_after_cancel"; receiptId: string }
  | { kind: "refused"; reason: string }
  | { kind: "denied"; policyDecisionId: string }
  | { kind: "incomplete"; reason: string }
  | { kind: "failed"; error: AppError }
  | { kind: "cancelled" }
  | { kind: "budget_exhausted"; budget: string }
  | { kind: "partial"; summaryId: string }
  | { kind: "manual_intervention"; incidentId: string };
```

Discriminated union、exhaustive switch 和明确 Result/error 类型能让非法状态更难表示。

## 2. Event Loop

Node 用少量线程和 Event Loop 编排大量 I/O。`async/await` 不会自动把 CPU 密集任务移出主线程；同步解析大文件、压缩、加密或无限循环会阻塞所有请求。

- I/O-bound：模型、数据库、HTTP，适合异步并发。
- CPU-bound：大解析、计算、embedding 本地推理，使用 worker/process/Rust sidecar。

## 3. Promise 并发不是容量控制

`Promise.all(10000 calls)` 会立即创建大量工作。使用 semaphore、bounded queue、batch 和 per-tool concurrency。所有异步边界携带 deadline/AbortSignal。

## 4. Cancellation

`AbortController/AbortSignal` 是统一取消信号，但下游必须显式支持和传播。收到 signal 后：停止排队、新调用和读取；关闭流；持久化取消状态。不能假设取消会回滚已完成工具。

## 5. Streams 与 Backpressure

模型 SSE、文件和工具结果都适合流式处理。生产者必须尊重消费者速度；Node stream/pipeline 能处理一部分背压和错误传播，但业务事件仍需有界缓冲、类型化解析和断流语义。

## 6. 边界层结构

```text
transport DTO
→ runtime validation
→ domain command/event
→ policy/state machine
→ adapter
```

不要让提供方 SDK 类型穿透整个领域层。模型、MCP、数据库和 Rust 服务都通过 adapter 隔离。

## 7. 必须会的测试

- 状态 reducer 的 table/property tests。
- Schema/协议 fixture tests。
- fake clock、mock model/tool 的确定性失败测试。
- Abort、timeout、重复事件、乱序和预算耗尽。
- 跨租户与策略拒绝。

## 微实验

写或手工设计一个 RunState reducer：对每个 state/event 组合标出允许、拒绝和终态。再为一条 streaming pipeline 加 AbortSignal 与 bounded queue，证明取消后无新工具调用。

## 常见误区

- TypeScript 类型能验证模型 JSON。
- `await` 会把 CPU 工作放到后台线程。
- `Promise.all` 是高性能并发最佳实践。
- AbortController 能强制所有第三方停止。
- 使用 SDK 类型作为领域模型最省事且无升级风险。

## 本章小结

TypeScript 的类型系统负责让非法状态更难表达，运行时 Schema、容量控制、背压与取消协议则负责守住真实边界；两者缺一不可。下一章将进入[指令层级、Prompt 与 Context](/masterpiece-static-docs/04-模型接口与Agent内核/02-指令层级-Prompt与Context.md)，讨论 Runtime 每一轮应如何组织交给模型的决策输入。

## 章末检查

1. 为什么 TS interface 不能替代 runtime Schema？
2. CPU-bound 工具为什么会阻塞 Agent Server？
3. Discriminated union 怎样帮助状态机穷尽检查？

## 一手资料

- [TypeScript Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Node.js: Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- [Node.js Streams](https://nodejs.org/api/stream.html)
