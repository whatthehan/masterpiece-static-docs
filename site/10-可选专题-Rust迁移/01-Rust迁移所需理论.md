# 01 · 何时把 Agent 组件迁移到 Rust

一个 Node.js Agent 服务的 P99 延迟突然升高。直觉反应可能是“换 Rust 提速”，但 Trace 显示 85% 的时间都在等待远程模型和第三方 API，本地 CPU 只占 3%。此时重写 Runtime 不会显著改善用户延迟，反而会引入跨语言协议、双栈部署和新的故障边界。

另一种情况则不同：文档解析器持续阻塞 Event Loop，内存峰值导致 Worker 被回收，且该组件输入输出稳定、无产品编排职责。它可能是合适的 Rust 迁移候选。

本章不把 Rust 设为 Agent 工程师的必选终点，也不为 Resolution Desk 增加新的产品能力。它只回答：哪些已测量的问题确实受益于 Rust，迁移前需要哪些语言与异步知识，以及哪些 Agent 正确性不会因为换语言自动获得。跳过本部分不影响主线总装与验收。

## 1. 先区分控制面与执行面

一种常见的长期结构是：

```text
React / TypeScript Client
          │
TypeScript + Node Control Plane
Thread · Run · Context · Policy · Product Logic · UI Events
          │  versioned process protocol
          ▼
Rust Execution / Data Plane
Tool Executor · MCP Gateway · Parser · Event Router · Sandbox Supervisor
```

TypeScript + Node 适合快速变化的产品逻辑、模型 Adapter、编排和 UI 协议；Rust 适合边界稳定、并发密集、资源敏感、需要单二进制交付或更严格生命周期约束的组件。这是职责划分，不是语言高低排序。

Agent Loop、Context 策略和产品行为频繁迭代时，过早迁移会同时调试 Agent 语义与 Rust 所有权/异步模型，难以判断问题来自哪一层。

## 2. 迁移必须由测量证据触发

至少满足以下一项，才值得进入真实迁移评估：

- CPU Profile 显示本地解析、索引、路由或序列化是主要瓶颈；
- Node Heap、GC 或 Event Loop Lag 持续违反 SLO；
- 需要更可控的并发、资源上限、Graceful Shutdown 或单二进制部署；
- 组件需要作为独立执行边界运行，并且其契约已经稳定；
- 现有实现的崩溃隔离或尾延迟无法通过更小的 Node 改造解决。

迁移评估应先比较成本更低的方案：缓存、Batch、Worker Threads、独立 Node 进程、算法改进、连接池与 Backpressure。如果这些方案已经解决问题，继续重写就没有工程收益。

以下理由单独存在时不充分：

- “Rust 理论上更快”；
- “Codex 的某些组件使用 Rust”；
- “内存安全会让 Agent 更安全”；
- “团队希望统一技术栈”；
- “社区有新的 Rust Agent Framework”。

## 3. 适合与不适合先迁移的组件

| 候选组件                              |  适合度 | 原因                                      |
| --------------------------------- | ---: | --------------------------------------- |
| 纯 State Reducer、Budget Calculator |    高 | 无副作用，输入输出明确，容易用 Fixture 对拍              |
| Parser / Indexer                  |    高 | CPU/内存特征清楚，可独立 Benchmark 与 Shadow       |
| 只读 Tool Executor                  |    高 | 故障语义简单，适合练习 Timeout、Cancel、Backpressure |
| MCP Gateway / Policy Proxy        |   中高 | 并发与协议价值明确，但身份和授权契约必须先稳定                 |
| Sandbox Supervisor                |   中高 | 资源与生命周期管理受益明显，但 Rust 本身不等于 Sandbox      |
| Agent Loop / Context Builder      |    低 | 产品语义变化快，Provider 与 Framework 生态以 TS 更成熟 |
| 完整 Application Server             | 最后评估 | 迁移面广，必须先稳定 Thread/Run/Event/Recovery 契约 |

第一个真实候选应当可以独立部署、独立回滚，并且 Shadow 不产生副作用。

## 4. 所有权不是语法细节

Rust 的所有权与借用决定 API 如何表达数据生命周期：

- 每个值有一个所有者，离开作用域时资源被释放；
- `move` 转移所有权，避免多个组件无意共享可变状态；
- `&T` 提供共享只读借用，`&mut T` 提供排他可变借用；
- Lifetime 描述引用之间的有效关系，不是手工指定内存存活时间。

对于 Agent 执行面，这些约束有助于明确谁拥有 Request Buffer、谁能更新 Connection State、任务结束后凭证何时释放，以及跨 Task 的数据是否需要 `Arc`。它们不能证明业务状态机、授权或幂等语义正确。

## 5. 用类型表达状态与错误

Rust 的 `enum` 与穷尽 `match` 很适合协议和状态机：

```rust
enum EffectStatus<R> {
    Absent,
    Committed(R),
    Unknown { call_id: String, idempotency_key: String },
}

enum ToolError {
    InvalidInput,
    Denied,
    DeadlineExceeded,
    DependencyUnavailable,
    ProtocolViolation,
}
```

- `Option<T>` 表达值可能不存在；
- `Result<T, E>` 表达可恢复失败；
- `enum + match` 迫使实现覆盖所有已知分支；
- `trait` 隔离 Model、Tool、Storage 和 Telemetry Adapter。

避免在协议和 Worker 边界依赖未解释的 `unwrap()` 或 `panic!()`。编译器能保证分支被处理，不能保证分类与业务真实情况一致；两种实现仍需共享 Contract Test。

## 6. Tokio 异步模型需要单独学习

Node 工程师熟悉 Event Loop，但 Tokio 仍有不同的并发边界：

- Tokio Task 是协作式异步任务，不等于 OS Thread；
- `Send` 表示值可安全跨线程转移，`Sync` 表示共享引用可安全跨线程使用；
- `Arc` 提供共享所有权，`Mutex` / `RwLock` 管理共享可变状态；
- `select!` 等待多个 Future，未完成分支被 Drop 后是否安全取决于 Cancellation Safety；
- Bounded Channel、Semaphore、Timeout、CancellationToken 与 Graceful Shutdown 是服务基础；
- 阻塞 I/O 或 CPU 密集任务应进入 `spawn_blocking`、专用线程池或独立进程。

“Future 被 Drop”并不自动意味着外部请求已撤销。与 Node 的 `AbortSignal` 类似，取消只传播控制意图；有副作用的外部调用仍需 Receipt 与 Reconciliation。

### 6.1 单写者 Actor：状态串行化，工作并行化

复杂 Agent Runtime 同时处理模型流、Tool Result、用户取消、审批和后台任务。如果每个异步任务都直接修改 Session，锁数量会持续增长，事件顺序也难以重放。更稳健的结构是让一个 Actor 独占可变状态：

```text
Session Actor
  ├─ owns queue, run state and event sequence
  ├─ starts model/tool futures outside the state owner
  └─ receives typed completion messages and commits transitions serially
```

Rust 可以用所有权、`mpsc` 和穷尽 `match` 表达这种边界；TypeScript 同样可以使用单消费者队列、Reducer 和 Discriminated Union。关键原则不是“使用 Actor Framework”，而是让可变状态只有一个提交者，同时允许纯计算和 I/O 在受控预算内并行。

### 6.2 RAII Guard 用于恢复不变量

异步流程可能正常完成、超时、取消、`panic` 或在持有临时状态时提前返回。Rust 的 RAII（Resource Acquisition Is Initialization）可以在正常离开作用域、Future 被 Drop，以及采用 `panic=unwind` 时的栈展开路径中，通过 Guard 的 `Drop` 清理 `in_flight` 标记、锁文件、临时目录或注册表条目，减少“受支持退出路径忘记恢复”的机会。`panic=abort`、进程崩溃、`SIGKILL` 与主机断电不会执行 `Drop`，因此进程级恢复仍需 Lease、Checkpoint、幂等 Cleanup 和启动时 Reconciliation。

不过 `Drop` 不能执行任意异步补偿，也不能证明远端副作用已撤销。适合由 Guard 恢复的是进程仍能执行清理代码时的本地不变量；外部 Command 仍然需要持久状态、Receipt 和 Reconciliation。TypeScript 中对应的是范围明确的 `try/finally`、幂等 Cleanup 与进程级 Crash Recovery，而不是依赖垃圾回收时机。

## 7. 一条渐进的 Rust 能力路径

为便于安排学习，本书使用 R0–R4 表示 Rust 能力递进；它们不是行业标准，也不要求最终走到 R4。

| 阶段                   | 学习重点                                                                    | 合适产出                                   |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| R0 · 纯逻辑             | Cargo、Ownership、Result、Enum、Trait、Test、Clippy                           | 用相同 JSON Fixture 对拍一个 Reducer 或 Parser |
| R1 · 异步与只读           | Tokio、Serde、reqwest、Stream、Actor、RAII Guard、Timeout、Cancel、Backpressure | 只读 Tool 或流解析服务                         |
| R2 · 协议 Sidecar      | Axum/Tower、Tracing、SQLx、HTTP/JSON-RPC/SSE/gRPC                          | 可独立部署和回滚的 Sidecar                      |
| R3 · 受控执行面           | MCP、Policy Context、幂等、限流、审计、Sandbox Supervisor                          | Gateway 或 Tool Executor                |
| R4 · 可选 Runtime Core | Event Store、Checkpoint、Recovery、Scheduler、版本迁移                          | 仅在契约稳定且收益持续成立时评估                       |

R0/R1 可以与 TypeScript Agent 学习并行，但“用 Rust 做练习”不等于“替换真实组件”。真实迁移还需要下一章的跨语言契约和发布准入条件。

## 8. Rust 不会自动解决 Agent 问题

Rust 的内存安全与类型系统不会自动提供：

- Prompt Injection 防护；
- actor / resource / action 授权；
- 进程、文件、网络和凭证隔离；
- 第三方 API 的 Exactly-Once；
- 正确的 Tool Schema、Context 或状态模型；
- Provider 行为一致性与 Eval。

Sandbox 仍需操作系统级文件、网络、系统调用、进程、Secret、CPU 和内存控制。业务安全仍由 Policy、Resource Service 和可验证 Outcome 持有。

## 9. SDK 与生态边界

截至 2026-07-15，OpenAI 官方 Libraries 页面只在 Community Libraries 下列出 Rust 库，没有提供官方 Rust SDK 或 Rust Agents SDK。Rust 侧的模型调用应通过自有 Adapter 隔离；关键接口可以使用 `reqwest + Serde`，采用社区库时则要固定版本，并通过 Contract/Eval Test 约束行为。MCP 官方 Rust SDK `rmcp` 适合在协议与执行面阶段学习，但仍需固定规范与 SDK 版本。

> 本节依据官方 Libraries 页面与 MCP 官方仓库，核验日期为 2026-07-15。SDK 支持状态变化较快，实施时必须重新核对官方资料。

## 10. 第一个迁移实验

选择一个无副作用 Reducer、Parser 或只读 Tool：

1. 固定 TypeScript 行为、错误分类、Latency 和资源基线；
2. 使用同一组 Golden Fixture 驱动 TS 与 Rust 实现；
3. 覆盖 Timeout、Cancel、Unicode、空输入、超大输入与协议错误；
4. Shadow 比较 Outcome、Error、Trace、P95/P99、CPU 与内存；
5. 预先写明成功阈值和停止迁移条件；
6. 没有实测收益时保留 TypeScript 实现。

## 本章小结

Rust 适合稳定、并发和资源敏感的执行面，但不是 Agent 正确性的捷径。迁移从 Profile 和 SLO 问题开始，以可隔离边界、等价测试和可回滚收益结束。下一章将把 Node 与 Rust 之间的关系落实为 [跨语言契约与控制面/执行面](/masterpiece-static-docs/10-可选专题-Rust迁移/02-跨语言契约与控制面-执行面.md)。

## 一手资料

- [The Rust Programming Language](https://doc.rust-lang.org/book/)
- [Rust Send and Sync](https://doc.rust-lang.org/book/ch16-04-extensible-concurrency-sync-and-send.html)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
- [Tokio Graceful Shutdown](https://tokio.rs/tokio/topics/shutdown)
- [OpenAI SDK libraries](https://developers.openai.com/api/docs/libraries)
- [Official MCP Rust SDK](https://github.com/modelcontextprotocol/rust-sdk)
