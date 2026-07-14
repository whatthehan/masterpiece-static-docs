# 07 · Rust 迁移决策清单

本章是一份组件迁移决策与验收模板，不是 Rust 学习进度表。学习 Ownership、Tokio 或 Serde 可以与 TypeScript 主线并行；一旦开始替换 Workbench 或生产组件，就必须证明迁移解决了一个已测量的问题，并且没有改变 Agent 的业务语义。

“保持 TypeScript + Node”是完全有效的结论。Rust 迁移只在收益、边界和回滚都能够验证时成立。

## 1. 启动迁移前必须回答的问题

### 问题是否真实存在

- 哪个 SLO、Profile、Event Loop Lag、CPU、Memory、GC 或部署指标不达标？
- 瓶颈位于本地组件，还是远程 Model / Tool / Queue？
- Cache、Batch、算法优化、Worker Thread 或独立 Node 进程是否已经比较？
- 预期改善阈值、成本上限和停止条件是什么？

### 候选边界是否足够稳定

- 输入、输出、Error、Cancel、Deadline 和 Side Effect 能否独立定义？
- 是否可以 Shadow 且不产生副作用？
- 是否可以单独部署、Canary 和 Rollback？
- 是否有版本化 Fixture、Trace 与 Eval Baseline？

第一个候选优先选择纯 Reducer、Parser / Indexer、只读 Tool 或独立 Sidecar。Agent Loop、Context Builder 和产品 UX 继续由 Node 控制面持有。

## 2. 迁移决策记录模板

```md
# Rust Migration Decision

## Problem
- Current SLO / profile evidence:
- Affected users / workload:
- Lower-cost alternatives tested:

## Boundary
- Component and responsibility:
- Request / response / event contract:
- Side effects and authority:
- Current TypeScript baseline:

## Success criteria
- Latency / throughput / memory target:
- Correctness / security non-regression:
- Maximum migration and operations cost:
- Stop / rollback condition:

## Release
- Record / replay:
- Shadow:
- Canary:
- Rollback and compatibility:
```

没有预注册成功标准时，迁移很容易在投入后把“已经写完”误当成“值得上线”。

## 3. 基础语言与纯逻辑检查

开始真实替换前，应能证明：

- 用 Ownership、Borrow 与 Lifetime 解释值和 API 边界；
- 使用 `Option`、`Result`、`enum`、`match` 和 `trait` 表达状态与 Adapter；
- 协议和 Worker 边界没有未解释的 `unwrap()` / `panic!()`；
- Test、Clippy 与 Formatter 通过；
- TypeScript 与 Rust 对同一 Golden Fixture 产生相同结果和错误分类；
- 第一个实现是无副作用 Reducer / Parser，而不是完整 Agent Runtime。

未通过时继续学习，不进入生产迁移。

## 4. Async 与只读执行检查

异步服务至少证明：

- 能区分 Tokio Task、OS Thread、`spawn_blocking` 和独立进程；
- Bounded Channel、Semaphore、Timeout、Cancellation Safety 与 Graceful Shutdown 有测试；
- Cancel 后没有泄漏 Task、无界 Queue 或悬挂连接；
- CPU / Blocking Work 不占用 Async Executor；
- Trace Context 跨 Node 与 Rust 保持连续；
- 只读 Tool 在依赖限流、断流和迟到响应下具有一致错误语义。

这一阶段只承接 Query，不接触高风险 Command。

## 5. Process Boundary 与协议检查

Sidecar 或独立服务必须具备：

- 版本化 HTTP、JSON-RPC、MCP 或 gRPC 协议与 Capability Negotiation；
- ID、金额、时刻、时长、Deadline、Missing/Null、Bytes、Unicode 与 Canonical Hash 的 Wire Spec；
- Contract、Golden 和 Property Test，覆盖旧版、未知字段、Error、断流、Cancel、迟到响应和 Unknown Effect；
- W3C Trace Context 或等价传播，以及统一 Audit 字段；
- mTLS 或等价 Workload Identity、短期 Audience-bound 凭证和 Anti-replay；
- 可核验 Policy Decision Reference，Resource Service 在执行前重新授权。

Process Boundary 不等于自动隔离。CPU、Memory、File、Network、Process 与 Secret 必须独立配置上限并进行故障测试。

## 6. 受控执行面检查

当 Rust 开始承接 MCP Gateway、Policy Proxy、Tool Executor 或 Sandbox Supervisor 时，追加要求：

- Node 仍持有 Thread、Run、Context、Product Policy 与 UX；
- 身份、Delegation 和 Policy Decision 可验证，不信任普通 JSON 中的 `authorized: true`；
- Command 使用稳定 Intent、Idempotency Key、Resource Version 与 Receipt；
- Connection Pool、Rate Limit、Retry、Backpressure 和 Audit 语义明确；
- Property、Fuzz 与 Chaos Test 覆盖重复请求、并发冲突、越权、依赖故障与资源耗尽；
- File、Network、Secret、CPU 和 Memory 隔离独立生效，不把 Rust Memory Safety 当 Sandbox。

## 7. Runtime Core 是最后一类候选

只有以下契约长期稳定后，才评估迁移 Agent Application Server 的核心：

- Thread / Run / Item 与 Canonical Event；
- Event Store、Snapshot、Checkpoint 与 Recovery；
- Scheduler、Lease、Fencing/CAS 与 Workflow Version；
- Error、Cancel、Unknown Effect 与 Reconciliation；
- Provider Adapter、Policy 和 UI Protocol 的稳定边界。

Node 与 Rust 必须对相同 Event 和 Fixture 达到 Contract、Golden、Eval 与 Trace Parity；崩溃、Replay、升级和旧 Run 恢复不能改变授权与 UX 语义。实测收益下降或边界持续变化时，应保留 Node Runtime。

## 8. 每次迁移都经过发布验证

不论候选大小，都要完成：

1. **Record / Replay**：新旧实现消费同一生产形态 Fixture；
2. **Shadow**：Rust 不产生外部效果，比较 Outcome、Error、Trace、Audit、Latency、Resource 与 Cost；
3. **Limited Canary**：限制 Tenant、Tool、流量和资源，设置自动停止条件；
4. **Compatibility Test**：新 Node/旧 Rust、旧 Node/新 Rust 与 Rollback 组合可解码持久 Event；
5. **Rollback Drill**：一键恢复旧实现，在途 Run 继续或安全转人工；
6. **Decision Review**：收益达到预注册阈值，正确性、安全和 P99 无退化。

## 9. 硬失败条件

出现任一项，停止迁移并回到设计阶段：

- 没有 Profile / SLO / 部署 / 隔离证据，理由只是“Rust 更快或更安全”；
- 使用 Float 传金额、用 JS Number 传不透明 ID，或未定义 Missing/Null/Canonical Hash；
- Rust 执行面信任 Node 的 `authorized: true`，没有可信身份、决策引用和资源服务再授权；
- 把 Memory Safety、Container 或 Process Boundary 当作完整 Sandbox；
- 缺少 Contract Test、无副作用 Shadow、Canary 停止条件或可验证 Rollback；
- 为迁移同时改写 Agent State、Authorization、Eval 或 UX，却没有独立业务需求和对照证据；
- 局部 Benchmark 变快，但端到端 Outcome、P99 或 Cost per Successful Task 没有改善。

## 10. 决定迁移后的约束

只迁移已经证明受益的边界。TypeScript + Node 可以长期承担产品与 Agent 控制面，Rust 可以长期只承担一个 Parser、Gateway 或 Executor。“最终全部 Rust”不是默认目标，也不应成为新的架构约束。

## 本章小结

Rust 迁移的完成标志不是代码量，而是相同 Outcome、Trace、安全语义和可回滚性之上的实测收益。证据不足时，应返回 [跨语言契约](/masterpiece-static-docs/10-可选专题-Rust迁移/02-跨语言契约与控制面-执行面.md) 缩小边界，或直接停止迁移。
