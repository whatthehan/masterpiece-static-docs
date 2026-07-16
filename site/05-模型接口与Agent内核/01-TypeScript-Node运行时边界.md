# 01 · TypeScript + Node：Agent Runtime 的运行时边界

前端工程师第一次实现 Agent，通常会从一个熟悉的接口开始：接收请求，调用模型，再把结果流式返回浏览器。只要模型开始调用工具，这个看似普通的 BFF 就会同时处理多条异步链路：模型流还没有结束，用户可能已经取消；工具返回的是未知 JSON；两个互不相关的查询可以并行，但一次写操作必须等待上一条回执。

这些问题并不要求重新学习 TypeScript，却要求重新审视几项常被 Web UI 隐藏的运行时能力：运行时校验、显式状态、取消传播、并发上限、流与背压。它们构成 Agent Runtime 的基础设施。

## 本章目标

- 用 discriminated union 表达运行状态，避免非法组合。
- 理解 TypeScript 类型擦除与 runtime validation 的边界。
- 正确处理 Event Loop、并发、流、背压和 cancellation。
- 为模型、工具和存储建立稳定的 adapter 边界。

## 1. TypeScript 类型不会验证外部数据

下面的代码可以通过编译，但 `body` 仍可能来自模型、HTTP 请求或数据库中的旧数据：

```ts
type RefundDraft = {
  orderId: string;
  amountMinor: number;
};

const draft = JSON.parse(body) as RefundDraft;
```

`as RefundDraft` 只改变编译器的看法，不改变运行时数据。模型若返回 `{"amountMinor":"1000"}`，程序仍会得到字符串。正确边界是：先解析，再校验，最后转换为领域对象。

```ts
import { z } from "zod";

const RefundDraftSchema = z.object({
  orderId: z.string().min(1),
  amountMinor: z.number().int().positive(),
}).strict();

const parsed = RefundDraftSchema.safeParse(JSON.parse(body));
if (!parsed.success) {
  return { ok: false, code: "INVALID_TOOL_ARGUMENTS" } as const;
}

const draft = parsed.data;
```

Zod、Ajv 或其他 validator 负责结构检查；订单是否存在、金额是否超过可退余额、当前用户是否有权限，仍由领域服务判断。

## 2. 用状态表达过程，不用布尔值拼状态

多个布尔字段很容易产生矛盾：

```ts
type BadRun = {
  running: boolean;
  completed: boolean;
  cancelled: boolean;
};
```

`running=true` 与 `completed=true` 是否允许？仅凭类型无法回答。Discriminated union 会迫使代码面对每一种状态：

```ts
type RunState =
  | { kind: "created" }
  | { kind: "calling_model"; responseId?: string }
  | { kind: "validating_tool"; callId: string }
  | { kind: "executing_tool"; callId: string }
  | { kind: "waiting_approval"; proposalId: string }
  | { kind: "completed"; outputId: string }
  | { kind: "cancelled" }
  | { kind: "failed"; error: AppError };

function isTerminal(state: RunState): boolean {
  switch (state.kind) {
    case "completed":
    case "cancelled":
    case "failed":
      return true;
    default:
      return false;
  }
}
```

状态类型不是状态机本身。真正的约束仍在 reducer 或 transition function 中：哪些 event 可以让 `calling_model` 进入 `validating_tool`，哪些状态收到 cancel 后只能停止新工作。

## 3. Event Loop：异步不等于后台线程

Node.js 适合编排模型 API、数据库和工具服务等 I/O-bound 工作。`await` 会让出当前任务的执行权，却不会自动把 CPU 工作移出主线程。

下列操作可能阻塞所有连接：

- 同步解析或转换大型文档；
- 在主线程压缩大量 Trace；
- 运行 CPU 密集的本地 reranker；
- 对巨大 JSON 做多轮深拷贝；
- 在流式回调中执行长时间同步逻辑。

CPU-bound 工作应进入 Worker Thread、独立进程或边界清晰的服务；是否迁移到 Rust 取决于 profiling、隔离和部署需求，而不是“Agent 应用天然需要 Rust”。

## 4. Promise 并发不是容量控制

`Promise.all(items.map(callTool))` 会立刻创建所有调用。面对 10,000 条记录，它可能同时耗尽连接池、供应商配额和内存。

Agent Runtime 至少需要三层限制：

- 每个 Run 的最大并发工具数；
- 每个 Tool 或下游服务的独立并发上限；
- 整个 Worker 的有界队列和背压策略。

并行也受语义约束。读取订单和读取政策可以并行；“创建退款”与“发送退款成功通知”存在因果关系，不能因为接口都是 Promise 就并发执行。

## 5. Cancellation 是一条需要逐层传递的协议

`AbortController` 只负责发出取消信号，下游是否停止取决于每一层是否支持并传播 `AbortSignal`。

```ts
async function executeRun(input: RunInput, signal: AbortSignal) {
  signal.throwIfAborted();

  const response = await model.generate(input, { signal });
  for await (const event of response.events) {
    signal.throwIfAborted();
    await consume(event, { signal });
  }
}
```

收到取消后，Runtime 应停止排队新的模型调用和工具调用、关闭仍可中断的流，并持久化 cancel intent。已经提交到外部系统的动作不会因为本地 `abort()` 自动回滚；这类情况必须查询回执并确认真实效果。

## 6. 流式处理与 Backpressure

模型的 SSE、文件读取和工具结果都可能是流。需要区分三层对象：

```text
网络 chunk → 完整协议 event → 应用语义 item
```

一个 JSON 参数可能跨多个 chunk；一个网络 chunk 也可能包含多个 SSE event。只有协议 event 完整，且语义 item 闭合并通过校验后，才能进入工具执行阶段。

当生产速度超过消费速度时，无界缓存会把延迟问题变成内存问题。可采用 Node `stream.pipeline`、bounded async queue、批量合并文本 delta，以及明确的队列满处理策略。背压不是底层传输细节，它会直接影响取消延迟和系统稳定性。

## 7. 把 SDK 类型挡在领域层之外

模型供应商、MCP SDK、数据库驱动和 UI 协议都会升级。稳定的应用边界应保持如下结构：

```text
transport DTO
→ runtime validation
→ domain command / event
→ policy and state machine
→ provider / tool / storage adapter
```

领域代码依赖自己的 `RunEvent`、`ToolProposal` 和 `AppError`，adapter 负责把外部类型转换进来。这样更换模型 SDK 不会迫使整个应用跟着修改状态语义。

## 8. 最小测试集

第一个 Runtime Skeleton 不需要真实模型或 Tool Loop 也能覆盖关键边界：

- reducer 的 table tests 与 exhaustive transition tests；
- 合法和非法 Schema fixtures；
- mock model 的流式完成、截断和协议错误；
- tool timeout、重复结果、乱序事件和取消；
- fake clock 驱动 deadline 与重试；
- bounded queue 达到上限时的拒绝或等待策略。

## 实践：为 Resolution Desk 建立 Fixture 驱动的 Runtime Skeleton

### 进入本章时已有能力

Resolution Desk 已有订单、工单和退款政策的 Mock 数据，以及不依赖模型的固定规则 Baseline；此时还没有 Agent Loop，也不会执行退款。

### 本章增加的能力

只使用 Recorded Fixture 建立 TypeScript 运行时骨架，不连接 Provider，也不执行 Tool：

1. 为 `run.started`、`mock.item.completed`、`mock.tool.result`、`cancel.requested` 与终态定义 discriminated union。
2. 所有 Fixture Event 先经过运行时校验，再交给纯 Reducer。
3. 用两个延迟 Promise 模拟并发工作，最多同时运行 2 个。
4. 所有模拟工作共享一个 deadline 与 `AbortSignal`，取消后不再调度新工作。
5. 记录状态转移、队列深度、取消和错误；不在本章定义 Provider Event 或 Agent Loop。

### 验收证据

分别注入结构非法的 Fixture Event、模拟任务超时、重复 Event 和主线程阻塞，保存状态转移与测试结果。正常路径能够把录制的订单和政策结果归约进 Snapshot；异常路径不会被误判为完成，也不会在取消后调度新工作。本章产物只是运行时骨架，Provider Adapter、Tool Contract 与完整只读 Loop 分别在后续章节加入。

## 常见误区

- TypeScript interface 可以验证模型返回的 JSON。
- `await` 会把 CPU 密集工作自动放到后台线程。
- `Promise.all` 等同于受控并发。
- 调用 `abort()` 后，外部副作用一定已经撤销。
- 直接复用 SDK 类型可以长期降低维护成本。

## 本章小结

TypeScript 负责表达合法状态，runtime validator 负责检查外部数据，Node.js 的并发、流与取消机制负责控制真实执行。三者共同形成 Agent Runtime 的底层边界。下一章将讨论[指令层级、Prompt 与 Context](/masterpiece-static-docs/05-模型接口与Agent内核/02-指令层级-Prompt与Context.md)，解释模型每一轮实际接收的内容，以及 Harness 在模型窗口之外承担的控制职责。

## 延伸阅读

- [TypeScript: Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Node.js: Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- [Node.js Streams](https://nodejs.org/api/stream.html)
