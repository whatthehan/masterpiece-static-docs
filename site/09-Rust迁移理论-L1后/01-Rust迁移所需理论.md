# 01 · Rust 迁移所需理论

> 本模块全部属于 **L1 之后**。首个 Agent 仍以 TypeScript + Node 完成控制面、评测和运行时闭环；Rust 迁移只由测量到的资源、尾延迟、部署或隔离需求驱动。

## 学习目标

- 理解 Rust 为何适合稳定、并发、资源敏感的执行面。
- 掌握迁移前必须具备的语言与异步心智模型。
- 不把 Rust 性能或内存安全误认为 Agent 正确性与沙箱安全。

## 1. 语言策略

```text
TypeScript + Node：产品、Agent 控制面、快速试验、高层编排
Rust：稳定协议服务、工具执行、网关、解析/索引、沙箱监督、高并发 worker
```

模型主要在远端推理时，改写客户端语言通常不会显著降低模型延迟。迁移应由资源、隔离、部署、尾延迟或稳定性测量驱动。

## 2. 所有权与借用

- 每个值有所有者，离开作用域被释放。
- move 转移所有权；borrow 通过引用临时访问。
- 可变引用在同一时刻具有排他性。
- lifetime 描述引用有效关系，不是手工内存时间。

这些规则能在编译期排除大量悬垂引用和数据竞争，但需要在 API 边界设计清楚所有权。

## 3. 类型化错误与状态

- `Option<T>` 表达缺失。
- `Result<T,E>` 表达可恢复失败。
- `enum + match` 表达 Agent 状态与协议事件。
- trait 表达 adapter 能力。

Rust 的穷尽匹配非常适合状态机，但仍不能证明业务授权或外部系统效果正确。

## 4. 并发与异步

- `Send`：值可安全转移到另一线程。
- `Sync`：共享引用可安全跨线程使用。
- `Arc` 提供共享所有权；Mutex/RwLock 管理可变共享状态。
- Tokio task 是协作式异步任务，不等于 OS thread。
- `select!` 同时等待多个事件；被丢弃的 future 是否真正取消取决于 cancellation safety。
- bounded channel、semaphore、timeout、CancellationToken 和 graceful shutdown 是执行面基础。
- 阻塞或 CPU 密集工作不能直接占用 async executor；使用 `spawn_blocking`、专用线程池或独立进程。

## 5. 渐进阶梯

- R0：Cargo、ownership、Result、enum、trait、tests、Clippy；迁移纯函数。
- R1：Tokio、Serde、reqwest、stream、timeout/cancel/backpressure；实现只读工具或流解析器。
- R2：Axum/Tower、tracing、SQLx、JSON-RPC/SSE/gRPC；实现 sidecar。
- R3：rmcp、policy proxy、MCP gateway、sandbox supervisor。
- R4：只有契约、Trace 和 Eval 稳定后才考虑 runtime core。

## 6. SDK 事实边界

截至 2026-07-11，OpenAI 没有官方 Rust SDK 或 Rust Agents SDK。社区库必须封装在 adapter 后并用 contract/eval test 约束。MCP 官方 Rust SDK `rmcp` 值得在 R3 学习，但仍需固定协议/SDK 版本。

## 7. Rust 不保证什么

- 不保证 Prompt Injection 防护。
- 不提供 actor/resource/action 授权。
- 不自动提供进程、文件、网络和凭证隔离。
- 不让外部 API exactly-once。
- 不修复错误工具契约和状态模型。

## L1 后迁移实验

把 TS 中一个无副作用的 state reducer 用 Rust enum 重写，用相同 JSON fixtures 对拍。然后迁移一个只读工具，验证 timeout、cancel、bounded concurrency 和 trace propagation，而不是先重写 Agent Loop。

## 常见误区

- Rust 更快，所以应从第一天重写全部 Agent。
- 内存安全等于沙箱安全。
- Tokio task 会自动并行执行 CPU 工作。
- 使用 Rust Agent 框架可以跳过 Runtime 原理。
- 编译通过代表跨语言协议语义一致。

## 章末检查

1. 哪些组件适合先迁移 Rust，为什么？
2. `Send/Sync` 与业务线程安全/授权有什么边界？
3. 为什么纯函数 reducer 是比完整 Agent 更好的第一个迁移对象？

## 一手资料

- [The Rust Programming Language](https://doc.rust-lang.org/book/)
- [Rust Send and Sync](https://doc.rust-lang.org/book/ch16-04-extensible-concurrency-sync-and-send.html)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
- [Tokio Graceful Shutdown](https://tokio.rs/tokio/topics/shutdown)
- [OpenAI SDK libraries](https://developers.openai.com/api/docs/libraries)
- [Official MCP Rust SDK](https://github.com/modelcontextprotocol/rust-sdk)
