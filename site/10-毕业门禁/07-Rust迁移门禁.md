# 07 · Rust 真实迁移门禁（L1 后）

这份门禁是一份真实组件迁移决策记录，而不是 Rust 学习进度表。R0/R1 基础学习可以在 L0/L1 并行；只要开始替换 Workbench 或生产组件，无论处于 R0–R4 哪一阶段，都必须使用本门禁。

## 何时使用

这不是首个 Agent 的闭卷考试。只有 TypeScript + Node 单 Agent Runtime 已达 L1，并且有 profile/SLO/部署/隔离数据指向一个具体组件时，才启动本门禁。若模型/第三方网络占据主要延迟，或 Node 未达资源/SLO 上限，正确结论可以是“不迁移”。

## 硬性前置

- L1 Eval 、安全不变量、故障注入、成本与延迟基线已固定。
- 已通过 profile 定位到候选组件，不用“Rust 更快”代替数据。
- 候选边界可独立输入/输出、可 shadow、可回滚，首选纯函数、parser/indexer、只读工具或独立 sidecar。
- 业务授权、Agent State 和产品 UX 暂仍以 Node 控制面为权威。

## 阶段门禁

### R0 · 纯逻辑

必须证明：

- 能用 ownership/borrow/lifetime 解释值与 API 边界。
- 用 `Option/Result/enum/match/trait` 建模，无未解释 `unwrap/panic`。
- tests + Clippy + formatter 通过；TS/Rust 用同一 golden fixtures 对拍。
- 先迁移无副作用 reducer/parser，结果与错误分类等价。

达标后才进 R1。

### R1 · 异步与只读执行

必须证明：

- 能区分 Tokio task、OS thread、`spawn_blocking` 与独立进程。
- bounded channel/semaphore、timeout、cancellation safety、graceful shutdown 均有故障测试。
- 只读工具在并发与取消下无泄漏任务、无无界队列、Trace 连续。
- CPU/阻塞工作不占用 async executor。

### R2 · Sidecar 与协议

必须证明：

- 版本化 JSON-RPC/HTTP/gRPC/MCP 边界与 capability negotiation。
- ID、金额、时刻/时长/deadline、missing/null、bytes、Unicode、canonical hash 全有 wire-level 规范和 golden vectors。
- mTLS/等价 workload identity、audience-bound 短期凭证、签名/不透明 policy decision reference、anti-replay 和资源服务重新授权。
- contract/golden/property tests 覆盖版本、边界、错误、断流、取消、迟到响应和 unknown effect。
- 进程边界不被宣称为自动资源/安全隔离；CPU/内存/文件/网络/凭证限制均有独立设置和测试。

### R3 · 受控执行面

必须证明：

- Rust MCP server/gateway、policy proxy、parser/indexer 或 sandbox supervisor 仍由 Node 控制面编排。
- 身份、权限上下文和 policy decision reference 可验证；资源服务执行前重新授权，不信任 `authorized=true`。
- 幂等键、资源版本、连接池、限流、重试、背压和审计字段均有明确契约。
- property/fuzz/chaos test 覆盖重复请求、并发冲突、越权、依赖故障与资源耗尽。
- 文件、网络、凭证、CPU 和内存隔离独立生效，不把 Rust 内存安全当作沙箱。

### R4 · 可选运行时核心

必须证明：

- 只有 Thread / Run / Item、事件存储、checkpoint、恢复、调度和流程版本契约稳定后，才选择候选运行时核心。
- Node 与 Rust 对同一版本化事件、状态转移和错误分类达到 contract、golden、Eval 与 Trace parity。
- 崩溃、重放、升级与旧版本在途 Run 的恢复测试通过，不改变业务授权和产品 UX 语义。
- 实测收益仍满足预注册标准；证据不足时保留 Node 控制面与运行时核心。

## 横切发布门禁

以下要求适用于每一次真实组件迁移，不占用 R0–R4 的阶段编号：

- Shadow 不产生副作用，比较 outcome/error/trace/audit/latency/resource/cost 而非只比文本。
- 在预注册的 MDE 上显示真实改善，安全、正确性和尾延迟无退化。
- Limited canary 有流量/租户/工具范围、自动停止条件和资源上限。
- 一键回滚后，旧 Node/Rust 组合仍能解码持久事件和恢复在途 Run。
- 具体的迁移成功标准和“不再继续迁移”停止条件已写明。

## 硬失败

出现任一项则停止迁移：

- 无 profile/SLO/部署证据，理由只是“Rust 更快/更安全”。
- 用 float 传金额，用 JS number 传不透明 ID，或未定义 missing/null/canonical hash。
- Rust 执行面信任 Node 传来的 `authorized=true` 而无可验证身份/决策引用/资源服务重新授权。
- 把内存安全或进程边界当作沙箱。
- 缺少 contract tests、shadow 副作用禁止、canary 停止条件或可验证 rollback。
- 为迁移改写 Agent 语义/授权/评测，却无独立业务需求和证据。

## 通过后的原则

只迁移已证明受益的边界。TypeScript + Node 可以长期保留为产品与 Agent 控制面；“最终全部 Rust”不是默认目标。

## 本章小结

Rust 迁移通过的标志不是代码量，也不是局部 benchmark，而是 outcome、Trace、安全、尾延迟和回滚能力共同满足预注册标准。任何阶段证据不足，都应回到 [跨语言契约](/masterpiece-static-docs/09-Rust迁移理论-L1后/02-跨语言契约与控制面-执行面.md) 或直接停止迁移。
