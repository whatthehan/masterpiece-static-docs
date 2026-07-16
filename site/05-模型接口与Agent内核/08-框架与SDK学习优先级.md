# 08 · 如何学习和选择 Agent SDK

Agent 生态中最容易浪费时间的方式，是把框架名称当成能力清单：学完一个 SDK，再追下一个 SDK，却仍然无法回答状态存在哪里、恢复时哪些代码会重跑、Tool Call 在哪里获得授权。

前几章已经手写了模型 adapter、Tool Gate 和 Agent Loop，因此现在可以从工程职责评估框架。SDK 的价值不是让示例代码更短，而是以可接受的抽象成本接管一部分 Harness 工作，同时保留领域状态、授权和副作用边界。

> 版本与状态核验基准：2026-07-15。本章涉及 AI SDK 7、preview/experimental 状态和框架能力的结论均基于文末官方资料；实施时必须重新核对目标版本。框架版本变化不应进入领域契约。

## 本章目标

- 区分 Provider SDK、Agent Runtime、UI Runtime、Generative UI、Durable Workflow 与互操作协议。
- 按学习依赖选择框架，而不是同时横向铺开。
- 用同一任务、Trace 和故障 fixture 比较手写 Runtime 与候选框架。
- 识别 SDK 接管的职责与应用仍需持有的职责。

## 1. 先把技术放回所属层

```text
Model API        official provider SDK
Agent Runtime    OpenAI Agents SDK / LangGraph / Mastra / AI SDK Core
UI Runtime       AI SDK UI / assistant-ui / CopilotKit / AG-UI adapter
Generative UI    A2UI renderer / application component catalog
Durable Runtime  Temporal / Inngest / workflow SDK
Tool Integration MCP SDK / provider tools / connectors
Agent Interop    A2A SDK / application adapter
Observability    OpenTelemetry + one eval/trace product
```

这些组件不是同一类竞品。例如 MCP 解决 Host 与 Server 的能力发现和调用，并不提供 Agent Loop；AG-UI 连接 Agent Backend 与用户界面，A2UI 表达受限的声明式界面，A2A 连接独立 Agent 系统；Temporal 让 Workflow 跨故障恢复，并不替模型选择 Context。任何 UI SDK 也不应成为订单状态的 source of truth。

## 2. 第一站：Provider 官方 TypeScript SDK

学习原始模型协议的最短路径，是只选择一个主要 Provider 的官方 TypeScript SDK，完整实现一次请求、流式响应和 Tool Calling。

需要掌握：

- request、response、item 与 Tool Call 的真实对象模型；
- streaming event、完成、拒绝、截断和 usage；
- stateful 与 stateless conversation 的差异；
- timeout、rate limit、retry 和 error type；
- Structured Outputs 与 Provider 支持的 Schema subset。

不需要背诵全部模型参数和便利 API。Provider 类型只停留在 adapter 层，转换成应用自己的 `RunEvent`、`ToolProposal` 和 `AppError`。

官方 SDK 是协议客户端，不等于 Agents SDK。前者帮助理解模型 API，后者开始接管 Loop、Tool、Session、HITL 和 Trace 等 Harness 职责。

## 3. 第二站：用手写 Runtime 建立比较基线

在引入高层框架之前，至少保留一个可测试的最小实现：

```text
Context Builder
→ Provider Adapter
→ complete Tool Item validation
→ Tool Registry / Executor
→ typed Observation
→ budgets / cancellation
→ Event / Trace
```

这个实现不追求生产功能完备，它的作用是建立认知和测试基线。没有它，框架替应用处理了什么、隐藏了什么都无法判断。

## 4. OpenAI Agents SDK for TypeScript

当主要 Provider 是 OpenAI，并且需要减少 Agent Loop、tools、session/HITL、guardrail 和 tracing 的样板代码时，OpenAI Agents SDK 值得用同一任务做一次对照实现。

重点检查：

- Tool 调用在什么位置被校验和执行；
- session 保存哪些内容，哪些领域状态仍需外部存储；
- pause/resume 与 approval 如何关联具体 proposal；
- streaming、cancel 和 error 如何映射为 canonical event；
- trace 能否导出并接入既有 Eval。

Guardrail 不是业务授权系统。官方文档区分不同 guardrail 的适用路径，function tool、handoff 和 hosted/built-in tool 不能假定天然共享同一门禁。资源服务仍须在每次产生外部副作用前重新授权。

## 5. LangGraph.js

LangGraph 的价值出现在显式状态图、checkpoint、interrupt/resume、human-in-the-loop 或 subgraph 成为真实需求之后。短时、少量只读工具的 Loop 通常不需要先引入图运行时。

值得系统学习：

- StateGraph 或 Functional API 选择一种主写法；
- state、node、edge、conditional edge 和 reducer；
- checkpointer、thread、interrupt 与 resume；
- node 重跑、副作用幂等和状态 Schema 演进；
- cancellation、concurrency 与 subgraph 边界。

Checkpoint 解决图状态恢复，不会让外部副作用自动 exactly-once。恢复时 node 可能重跑，command 必须放在有幂等和回执语义的执行边界中。

如果要进入实现，不应另起一套业务模型。先定义框架无关的 `AgentRuntimePort`，再用相同 Domain Types、Canonical Event、Dataset 和故障 Fixture 做对照；完整方法见 [AI SDK 与 LangGraph 对照实践](/masterpiece-static-docs/05-模型接口与Agent内核/12-AI-SDK与LangGraph对照实践.md)。

## 6. AI SDK 7：按切片采用

截至核验基准，AI SDK 7 已覆盖多步 Agent、类型化 runtime/tool context、工具审批、timeout、telemetry、UI transport，以及 `WorkflowAgent` 和 `HarnessAgent` 等能力。它不再只是 React 流式 UI 封装，但也不应作为需要一次性全部采用的平台。

适合按真实需求选择切片：

| 需求                       | 可评估的切片                 | 应用仍负责                        |
| ------------------------ | ---------------------- | ---------------------------- |
| 多 Provider 与有界 Tool Loop | Core + `ToolLoopAgent` | 领域 State/Event、Policy、Eval   |
| 工具审批 UI                  | approval API           | proposal hash、actor、资源版本、有效期 |
| 跨进程长任务                   | `WorkflowAgent`        | 外部副作用的幂等性、流程版本、故障矩阵          |
| React/Next.js Agent UI   | UI message / transport | Canonical RunEvent、重连和业务事实   |

在核验基准中，AI SDK 7 要求 Node.js 22 与 ESM。官方发布说明明确把 harness abstractions 与 `HarnessAgent` 标为 experimental；这项显式状态高于“无 `experimental_` 前缀通常视为 stable”的一般版本规则。`ToolLoopAgent` 用于进程内多步 Loop，`WorkflowAgent` 用于可恢复的 durable execution，`HarnessAgent` 则适配 Claude Code、Codex 等既有 Harness，三者不能互换。采用时应逐项核对实际文档与 package 状态，并通过故障实验确认语义，不能把框架版本写进领域契约。

## 7. MCP SDK 不是 Agent 框架

需要让应用通过标准协议发现 Tool、Resource 或 Prompt 时，再系统学习 MCP TypeScript SDK：

- initialize 与 capability negotiation；
- stdio / Streamable HTTP transport；
- Tool、Resource、Prompt 的不同控制关系；
- authentication、timeout、cancellation 和 audit；
- Server 来源、协议版本、Schema 演进和信任边界。

内部函数不必为了“标准化”全部包装成 MCP Server。只有存在跨进程、跨产品或生态互操作需求时，协议层才带来净收益。

同理，不要因为名称相近就把协议视为同一抽象：

| 真实互操作需求                                         | 候选协议  | 学习位置                                                                                                      |
| ----------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| Agent Backend 向产品 UI 发送运行、消息、Tool 与 State Event | AG-UI | 理解 Canonical Event 后，按互操作需求阅读 [AG-UI 前端事件适配](/masterpiece-static-docs/05-模型接口与Agent内核/10-AG-UI与前端事件适配.md) |
| Agent 生成可由本地组件安全渲染的声明式界面                        | A2UI  | 完成 Agent UX 与 Renderer 安全后按需学习                                                                            |
| 两个独立 Agent 系统发现能力并协作完成长任务                       | A2A   | 单 Agent Baseline、Identity 与可靠行动稳定后按需学习                                                                    |
| Host 发现和调用外部 Tool、Resource 与 Prompt             | MCP   | Tool Contract 与 Authorization 之后学习                                                                        |

主线必须先掌握 Canonical Event、Public Snapshot、Reducer 与断线恢复，因为它们定义产品自己的状态语义。对于 AG-UI，还必须理解四个架构事实：它位于 Product Edge；协议 Run 不等于业务 Outcome；共享 State 不是领域事实源；前端发来的 Action 必须回到服务端重新认证、授权和校验。是否实现 AG-UI Adapter、采用其 SDK，则取决于标准客户端或多前端互操作需求。

A2UI 与 A2A 都是场景专项，不应成为第一个 Agent 应用的默认依赖。侧栏因此把 AG-UI Adapter、A2A 与 A2UI 放在主线闭环后的进阶实验区；这表示实现可选，不表示可以忽略它们揭示的边界。

## 8. Durable Workflow 只在任务需要跨故障生存时引入

当任务会跨分钟、小时或部署运行，需要等待审批、timer、webhook 或外部 event 时，应评估 Temporal、Inngest 或等价 durable runtime。

选择时要验证：

- Workflow 与 Activity/Step 的分离；
- history、replay、checkpoint 和版本迁移；
- retry、heartbeat、cancellation 与 timeout；
- worker 崩溃和滚动升级；
- 外部副作用的 Idempotency、Outbox 和 Reconciliation。

Durable Workflow 与 Agent Runtime 不是二选一。前者持有长期控制流与恢复，后者持有模型决策和 Context；两者通过明确的 Activity/Step 边界组合。

## 9. 一体化框架与广泛抽象的投入边界

- **Mastra**：适合需要 TypeScript 一体化 agent/workflow/memory/server 体验时做限时 POC。若采用，再深入其 state、suspend/resume、storage 和 eval；无需同时深学多个同层框架。
- **LangChain.js 高层组件**：某个 loader、retriever 或 integration 能节省明确成本时按需使用，并通过 adapter 隔离。无需背诵历史 chains 和全部 integrations。
- **AutoGen / CrewAI**：默认不作为 TypeScript-first、单 Agent-first 路线的前置。只有评测证明需要 Python-first Multi-Agent 模式时再做 POC；Multi-Agent 的状态、权限与汇合语义见 [Multi-Agent：协作、状态与验证](/masterpiece-static-docs/05-模型接口与Agent内核/11-Multi-Agent协作状态与验证.md)。
- **Rust Agent 框架或非官方模型 SDK**：先稳定 wire contract 和 TypeScript 控制面。Rust 优先承接边界清晰的 executor、gateway 或 parser，不因语言偏好提前重写 Agent Runtime。

## 实践：用 Resolution Desk 做框架对照实验

### 进入本章时已有能力

Resolution Desk 已有一套手写的 Provider Adapter、Tool Gate、有界 Loop 与 Harness 测试，因此框架可以与真实基线比较，而不是只比较示例代码长度。

### 本章增加的能力

选择一个候选框架，在不改变领域类型和 Canonical Event 的前提下，重做“读取订单与政策并生成退款 Proposal”这一条只读、process-local 路径。候选框架必须使用同一任务和故障集：

1. 固定模型、Prompt、Tool Schema、dataset 和预算。
2. 手写 Runtime 与候选框架分别运行多次 trial。
3. 注入流式断开、半截 Tool Call、只读 Tool Timeout、重复 Event 和 Cancel。
4. 检查是否能替换 Model、Tool 与 Tracer，是否能导出原始事件；再执行当前层级的 Ejection Test，确认替换 Runtime Adapter 不会改写 Domain、Canonical Event 与 Eval。
5. 比较 Outcome、Trajectory、Latency、Cost、取消收敛和敏感数据暴露。

### 验收证据

输出同一 Dataset 下的 Outcome、Trajectory、Latency、Cost、取消收敛和敏感数据暴露对比。只有框架减少了已知实现成本，且没有破坏既有不变量，才进入 Resolution Desk；否则继续使用手写 Runtime。

### 完成行动控制与可靠性部分后的回访

建立 Authorization、Approval、Idempotency、Checkpoint 与 Reconciliation 后，再用相同 Framework Port 增加 durable tier：注入 Approval 过期、外部服务 Commit 后 ACK 丢失、Worker 重启与旧 Checkpoint 恢复。此时 Ejection Test 才同时固定 Policy、UI Reducer 与权威 Outcome。候选框架不支持该层级时记为 `unsupported`，不能把 process-local Loop 的通过结果解释为 durable recovery。完整实验见 [AI SDK 与 LangGraph 对照实践](/masterpiece-static-docs/05-模型接口与Agent内核/12-AI-SDK与LangGraph对照实践.md)。

## 10. 一张实用决策图

```mermaid
flowchart TD
    A{"已经理解 Provider Event<br/>并手写过最小 Tool Loop?"} -->|否| B["先学官方 Provider SDK<br/>+ runtime validation"]
    A -->|是| C{"需要哪类能力?"}
    C -->|OpenAI 原生 Loop/HITL/Trace| D["评估 OpenAI Agents SDK"]
    C -->|显式状态图/checkpoint/interrupt| E["评估 LangGraph.js"]
    C -->|TS 多 Provider/UI/Harness 切片| F["评估 AI SDK 7 对应能力"]
    C -->|跨小时/部署的可靠恢复| G["评估 Temporal / Inngest"]
    C -->|跨产品 Tool/Resource 互操作| H["使用 MCP SDK"]
    C -->|标准 Agent↔UI 事件| J["评估 AG-UI Adapter"]
    C -->|受限声明式生成界面| K["按需评估 A2UI"]
    C -->|独立 Agent 系统协作| L["按需评估 A2A"]
    C -->|没有清晰需求| I["保留当前简单实现"]
```

## 常见误区

- 示例代码最短的框架一定最适合生产。
- SDK 的 session 可以替代领域状态和长期工作流。
- Guardrail、approval UI 或 checkpointer 可以替代服务端授权与幂等。
- 采用 AI SDK UI 后应直接把 UI message 当作领域事件。
- 同时熟悉多个同层框架能自然降低技术风险。

## 本章小结

框架学习应沿着职责边界推进：先用 Provider 官方 SDK 理解协议，再用手写 Runtime 建立基线，之后才按状态图、HITL、UI、durability 或互操作需求选择相应工具。任何框架都不应接管应用的领域事实、授权和副作用语义。下一章将实现 [Agent Application Server 与 UI 事件协议](/masterpiece-static-docs/05-模型接口与Agent内核/09-Agent-Application-Server与UI事件协议.md)，把模型流转成前端能够可靠消费的产品状态。

## 官方资料

- [OpenAI SDKs and libraries](https://developers.openai.com/api/docs/libraries)
- [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/)
- [LangGraph.js overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [AG-UI](https://docs.ag-ui.com/)
- [A2UI](https://a2ui.org/)
- [A2A Protocol v1.0.0](https://a2a-protocol.org/v1.0.0/specification/)
- [Vercel: AI SDK 7](https://vercel.com/changelog/ai-sdk-7)
- [Vercel: AI SDK 7 release](https://vercel.com/blog/ai-sdk-7)
- [Vercel AI SDK: Versioning](https://ai-sdk.dev/docs/migration-guides/versioning)
- [Vercel AI SDK: Tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Temporal: Workflow Execution](https://docs.temporal.io/workflow-execution)
- [Mastra](https://mastra.ai/)
