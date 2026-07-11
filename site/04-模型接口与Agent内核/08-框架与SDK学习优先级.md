# 08 · 框架与 SDK 学习优先级

理解模型协议、工具门禁和单 Agent 状态机之后，框架才成为可以理性评估的工程选项。否则，示例代码越短，越容易看不见谁持有状态、恢复时哪些步骤会重跑，以及授权和幂等仍由哪一层负责。

本章不试图罗列所有生态工具，而是沿着本书的学习依赖给出投入顺序：先用官方 SDK 看清协议，再用同一套 Eval 与故障注入对照高层 Runtime。选择框架的依据是它能否降低已知成本且不破坏既有门禁。

> 查证基准：2026-07-11。这里的“暂不投入”是对“TypeScript + Node 主语言、先完成单 Agent L1、再渐进迁往 Rust 执行面”这条路线的排序，不是对项目质量的普遍评价。所有 SDK 和框架 API 在实施当天重新核对。

## 学习目标

- 区分“学习模型协议的官方 SDK”与“封装 Agent Runtime 语义的框架”。
- 根据 M0、L1 证据和真实非功能需求决定必学、按需或暂不投入。
- 用同一 Eval/故障注入对照手写 Runtime 与候选框架，而不以 demo 是否跑通决策。

## 1. 结论表

| 技术                                  | 结论                   | 什么时候学                                            | 只学什么                                                                                         | 不要投入什么                                                                                 |
| ----------------------------------- | -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript + Node 原生能力              | **必学，现在**            | 理论第 3 周起                                         | discriminated union、event loop、stream、`AbortSignal`、Worker Threads、有界并发                      | 不用框架类型替代领域 State/Event                                                                 |
| 模型提供方官方 TS SDK（例如 OpenAI JS/TS SDK） | **必学，第一个实现**         | 理论门禁后立即                                          | 原始 request/response、stream events、tools、structured outputs、usage/error、stateful/stateless 区别 | 不把 SDK 类型传遍领域层；不先学全部便利 API                                                             |
| JSON Schema + 运行时校验器（Ajv/Zod 等）     | **必学，现在**            | 模型 API 前后                                        | provider 支持子集、strict object、missing/null、正反 fixtures、版本                                      | 不把类型推导/Schema 当业务授权和 sink 安全                                                           |
| OpenAI Agents SDK for TypeScript    | **值得学，L1 后对照**       | 手写 Loop+Eval 已达 L1，且以 OpenAI 为主要提供方              | Agent loop、tools、sessions/HITL、guardrails、tracing；用同一 M0 对拍手写 Runtime                        | 不先学 handoff/multi-agent/sandbox agent；不假设 guardrail 自动覆盖所有 tool/handoff/hosted tool 路径 |
| LangGraph JS                        | **有条件值得，L1 后**       | 确有长任务、checkpoint/resume、HITL 或显式图状控制需求           | StateGraph/Functional API 二选一、checkpointer、interrupt/resume、序列化/重放语义                         | 不为普通 3–5 工具 Loop 先引入；不把 checkpoint 当外部 exactly-once                                    |
| MCP TypeScript SDK                  | **按需必学，不是 Agent 框架** | 真正需要互操作 client/server 时                          | 稳定协议角色、lifecycle/capability、transport、auth、tool/resource/prompt 和安全                          | 不为内部函数包一层 MCP；不用 RC/experimental Tasks 做首个实现基线                                         |
| Vercel AI SDK                       | **可选，产品 UI 层**       | React/Next.js 中需要多提供方流式 UI/工具交互时                 | `streamText`、typed tool parts、UI transport；放在 adapter/product edge                           | 不用它承担权威 Agent state、授权、幂等或 durable semantics                                           |
| Temporal/等价 durable workflow 引擎     | **值得学，但仅 L1 后按需**    | 任务真的跨进程/部署生存，需恢复和长等待                             | deterministic workflow/activity、history/replay、versioning、idempotency、lease/worker 故障        | 不为短任务先引入；不宣称提供任意外部 exactly-once                                                        |
| Mastra                              | **可选对照，不是前置**        | L1 后，需 TS 一体化 agent/workflow/memory/server 产品开发时 | 用一个小 POC 对比状态、取消、评测、可观测和逃生边界                                                                 | 不系统学整个产品面，不同时与 LangGraph/Agents SDK 并行学                                                |
| LangChain 广泛抽象                      | **不需系统投入**           | 只在某个 loader/retriever/integration 能显著节省工作时       | 就地查用到的组件，用 adapter 隔离                                                                        | 不背 chains/agents 全套 API，不让 Document/Message 类型渗入领域层                                    |
| AutoGen / CrewAI                    | **前期不投入**            | 只在 L1 后已证明需要 Python-first 多 Agent 会话/团队模式时       | 用委派协议、成本和故障评测做一次限时 POC                                                                       | 不为“Agent 应该多个”而改变 TS-first 路线，不学多 Agent 聊天模板                                           |
| Rust Agent 框架/非官方模型 SDK             | **前期不投入**            | Rust 迁移门禁通过后才评估                                  | 先学 Rust/Tokio/Serde/Axum/Tower/tracing 和稳定 wire contract；社区 SDK 放 adapter 后                  | 不用不成熟框架重写 Agent 控制面                                                                    |

## 2. 为什么官方模型 SDK 必学，Agents SDK 要晚一步

模型提供方的原始 SDK 是学习真实协议语义的最短路径：请求、响应、流 event、tool item、超时、错误和 usage。第一个 Runtime 要亲手完成这些 adapter 和 Loop，否则无法判断后续框架封装的状态、取消、工具和追踪是否符合你的业务不变量。

OpenAI Agents SDK for TypeScript 当前提供 Agent loop、tools、handoffs、guardrails、sessions/HITL 和 tracing，因此它值得在 L1 后用同一 M0 做一次对照实现。但官方文档也明确区分了 guardrail 的适用路径：例如 function-tool guardrail 不自动套用到 handoff 和某些 hosted/built-in tool 路径。因此业务授权、sink 安全和资源服务检查仍必须在 SDK 之外成立。

## 3. 什么时候 LangGraph 才值得

LangGraph 的官方定位聚焦长运行、有状态编排，包括 durable execution、streaming、human-in-the-loop 和 persistence/checkpoint。当你已有这些真实需求时，学习它可以避免自己重建一部分编排基础设施。

但“有 checkpointer”不会消除本书讨论的问题：外部 Activity 仍需幂等，恢复仍需版本语义，多 Worker 仍需所有权控制，审批仍需绑定不变提案。若任务只是一个短时、三个只读工具的 Loop，LangGraph 带来的新语义和依赖大于收益。

## 4. 框架选型实验

任何 L1 后框架都用同一个限时对照，不用“示例跑通”决策：

1. 锁定同一 M0、模型、Prompt、3–5 个 mock/只读工具和 Eval dataset。
2. 分别运行手写 Runtime 与候选框架，比较 outcome、trajectory、取消、断流、工具错误、Trace 和敏感数据。
3. 注入 ACK loss、审批过期、队列满、重放 event、跨租户检索和 Prompt Injection。
4. 记录逃生边界：是否可替换 model/tool/store/tracer，能否导出原始 event，是否能在框架外强制授权。
5. 只有减少了已知的实现成本，且未破坏门禁，才采用。

## 5. 简化决策树

```text
还没有手写单 Agent L1？
  └─ 是 → 只学官方模型 TS SDK + JSON Schema/校验器。

L1 后，主要依赖 OpenAI，希望减少 Loop/Tracing/HITL 样板代码？
  └─ 是 → 限时评估 OpenAI Agents SDK TS。

有长任务、checkpoint/resume 或显式图编排需求？
  └─ 是 → 限时评估 LangGraph JS；需更强工作流恢复时同时评估 Temporal。

只是 Next.js 流式 UI/多提供方展示？
  └─ 是 → 可用 Vercel AI SDK，但不下放权威 Runtime 语义。

没有证据需要 multi-agent？
  └─ 是 → 不学 AutoGen/CrewAI/handoffs/crews。
```

## 本章小结

官方模型 SDK 是理解协议的起点，高层 Agent 框架则应在手写 L1 Runtime 之后按真实需求限时评估；任何抽象都不能接管应用的授权、领域状态和副作用语义。下一部分从 [Context Engineering](/masterpiece-static-docs/05-上下文-知识与记忆/01-Context-Engineering.md)继续，处理 Runtime 每一轮如何在有限窗口内选择状态、工具与证据。

## 章末检查

1. 为什么学习官方模型 SDK 不等于学习 Agents SDK？
2. 哪三类真实需求出现时，LangGraph 才可能值得引入？
3. 为什么 guardrail/checkpointer/类型校验都不能替代资源服务授权与幂等副作用？
4. 你会用哪些相同 Eval 和故障注入对照手写 Runtime 与候选框架？

## 一手资料

- [OpenAI SDKs and libraries](https://developers.openai.com/api/docs/libraries)
- [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/)
- [OpenAI Agents SDK: Tracing](https://openai.github.io/openai-agents-js/guides/tracing/)
- [LangGraph JS overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vercel AI SDK: Tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)
- [Mastra](https://mastra.ai/)
- [AutoGen AgentChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/)
- [CrewAI Documentation](https://docs.crewai.com/)
