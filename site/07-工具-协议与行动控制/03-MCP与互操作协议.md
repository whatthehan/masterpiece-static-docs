# 03 · MCP：能力发现与互操作边界

应用内 Tool 可以直接注册为 TypeScript 函数；当同一项能力需要被多个 Agent Host 使用，或由独立进程和外部服务提供时，就需要稳定的发现与调用协议。Model Context Protocol（MCP）为 Tool、Resource 和 Prompt 提供统一连接方式，但不会替应用完成 Agent Loop、业务授权或沙箱隔离。

标准化连接扩大了可复用性，也扩大了信任边界。Host 接入一个 MCP Server 时，等于接入了新的代码、数据源、描述文本和网络路径。本章同时讲协议结构与 Host 必须承担的安全责任。

> 版本核验日期：2026-07-15。此时最新稳定 MCP protocol revision 为 `2025-11-25`；已锁定的 `2026-07-28` Release Candidate 包含 breaking changes，计划在 7 月 28 日发布最终版，因此不作为本章实现基线。实际开发前必须重新核对最终规范和目标 SDK。

## 本章目标

- 理解 MCP Host、Client、Server 的职责。
- 区分 data layer 与 transport layer。
- 掌握 Tool、Resource、Prompt 的不同控制关系。
- 理解 initialize、capability negotiation、timeout 与 cancellation。
- 明确 MCP 不提供哪些 Runtime 与安全能力。

## 1. Host、Client 与 Server

```mermaid
flowchart LR
    subgraph H["MCP Host"]
        A["Agent Runtime / UI / Policy"]
        C1["MCP Client A"]
        C2["MCP Client B"]
        A --> C1
        A --> C2
    end
    C1 <--> S1["MCP Server A"]
    C2 <--> S2["MCP Server B"]
```

- **Host** 是完整 AI 应用，管理模型、Context、权限、用户同意和多个 Client。
- **Client** 代表 Host 与一个 Server 建立隔离、有状态的协议会话。
- **Server** 暴露聚焦的 Tool、Resource 或 Prompt，可以是本地进程，也可以是远端服务。

Host 不能把多个 Server 当成一个共享信任域。Server A 返回的敏感内容，不应未经数据流策略就发送给 Server B。

## 2. Data Layer 与 Transport Layer

### Data layer

负责 JSON-RPC 2.0 消息、生命周期、capability negotiation、请求/响应/通知，以及 Tool、Resource、Prompt 等原语。

### Transport layer

负责消息如何传输、连接如何建立、认证和传输安全。稳定规范中常见 transport 包括 stdio 与 Streamable HTTP。

两层分离意味着同一 data-layer 方法可以运行在不同 transport 上，但认证、session、origin 和网络威胁会因 transport 不同而变化。本地 stdio 也不天然可信：Server 进程仍可能来自恶意包，拥有过宽文件权限或输出诱导内容。

## 3. 三个 Server 原语

| 原语        | 主要用途            | 谁控制使用                     |
| --------- | --------------- | ------------------------- |
| Tools     | 查询或执行能力         | 模型可以提出调用建议，Host 或用户决定是否执行 |
| Resources | 可读取的 Context 数据 | Host 应用选择和加载              |
| Prompts   | 可复用的交互模板        | 通常由用户显式选择                 |

这三者不是同一种“插件内容”：

- Tool 可能产生副作用，需要 Tool Gate、authorization 和 approval。
- Resource 是数据，仍需 ACL、provenance、freshness 和 Prompt Injection 防御。
- Prompt 是模板，不应自动获得高优先级或绕过 Host 指令策略。

Client 还可能向 Server 提供 sampling、roots、elicitation 等能力。它们会扩大模型调用、文件访问和用户交互边界，应分别授权、限额与审计。

## 4. 生命周期与 Capability Negotiation

```text
client connects
→ initialize(protocol version, client capabilities)
← server version and capabilities
→ initialized
↔ list / get / call + notifications
→ shutdown / disconnect
```

双方只能使用协商后明确支持的能力。不兼容版本应显式失败，不能静默猜测。

Capability negotiation 解决的是“双方会说什么协议”，不是“调用是否获准”。Server 声明 `tools` capability 后，Host 仍需决定：

- 是否信任这个 Server；
- 哪些 Tool 对当前 Run 可见；
- 当前 actor 是否有权调用；
- 参数、数据披露和风险是否可接受；
- 是否需要 Approval。

## 5. 从 Tool discovery 到执行

一条安全调用链可以表示为：

```mermaid
sequenceDiagram
    participant H as Host Runtime
    participant C as MCP Client
    participant S as MCP Server
    H->>C: list allowed capabilities
    C->>S: tools/list
    S-->>C: tool descriptions + schemas
    C-->>H: untrusted discovered metadata
    H->>H: trust / allowlist / schema validation
    H->>H: model proposes tool call
    H->>H: semantic / auth / approval checks
    H->>C: validated call + deadline
    C->>S: tools/call
    S-->>C: result or protocol error
    C-->>H: typed observation
```

Tool description 和 Schema 来自 Server，也要视为供应链输入。Host 可以缓存已审查版本，但需固定 Server identity、protocol/SDK version 和 capability digest，避免运行中静默变化。

## 6. MCP 与应用 Tool Registry 的 Adapter

领域层不应直接依赖某个 MCP SDK 类型。可以把远端 Tool 映射到统一接口：

```ts
type RemoteToolDescriptor = {
  serverId: string;
  toolName: string;
  schemaVersion: string;
  inputSchema: unknown;
  trust: "first_party" | "reviewed" | "untrusted";
  capabilitiesDigest: string;
};

type ToolRegistryEntry = {
  canonicalName: string;
  kind: "query" | "draft" | "command";
  remote?: RemoteToolDescriptor;
  policyId: string;
  timeoutMs: number;
};
```

Provider、模型和 UI 只看到 canonical Tool contract。MCP Client adapter 负责 transport、JSON-RPC、Server error 和 cancellation 的转换。

## 7. Authentication 与 Authorization 分属不同边界

远程 MCP 连接可能使用 OAuth 或其他认证方式。连接认证确认 Client/Server 身份，不自动完成业务资源授权。

Host 仍需：

- 使用面向正确 audience 的最小权限 token；
- 保留 original actor 与 delegation scope；
- 防止 token passthrough 到错误 Server；
- 在 Tool 产生外部副作用前进行 resource-level authorization；
- 对 redirect、session 和 token lifecycle 做安全处理；
- 记录 Server identity、actor、Tool、参数 hash 和结果引用。

Server 也应在自身边界重新授权，不能只因为请求来自受信 Host 就允许任意资源访问。

## 8. Timeout、Cancellation 与动态变化

MCP 请求需要 Deadline 与 Cancellation；但取消不能撤销已经产生的外部副作用。Command 超时后，应进入与普通 Tool 相同的 `in_doubt → reconcile` 路径。

Tool 与 Resource 列表可能动态变化。Host 应定义：

- 何时刷新 capabilities；
- 当前 Run 是否固定 capability digest；
- Tool 消失或 Schema 变化时如何失败；
- 旧 Run 恢复时使用哪个协议和 Tool version；
- 未知 notification 是否可安全忽略。

## 9. MCP 不提供什么

MCP 不是：

- planner 或 Agent Loop；
- Workflow / durable runtime；
- RAG 算法或长期 Memory；
- identity provider 或业务 policy engine；
- sandbox；
- Multi-Agent coordination protocol；
- Tool 外部副作用的 exactly-once 保证。

它标准化的是能力如何被发现和调用。使用 MCP 不会降低 Tool Contract、authorization、idempotency 和 isolation 的必要性。

## 10. Host 的安全检查表

- 固定并验证 Server 来源、版本和 digest。
- 只暴露当前任务需要的 Tools 和 Resources。
- 把 Server metadata、Resource 和 Tool Result 视为不可信输入。
- 在 candidate generation 前执行 tenant/ACL filter。
- 验证参数、结果和 result size。
- 对 Command 使用 Approval、Idempotency 和 Receipt。
- 设置 timeout、rate limit、concurrency 和 cancellation。
- 限制一个 Server 向另一个 Server的数据流。
- 记录协议版本、capabilities、actor、decision 和 Trace。
- 对本地进程设置 filesystem、network、credential 与 resource isolation。

## 实践：实现一个最小但受控的 MCP 接入

建立一个日历或知识查询场景：

1. 一个 Server 提供只读 Resource 和 query Tool。
2. 另一个 Server 提供需要 Approval 的 Command Tool。
3. 手工推演 `initialize → tools/list → tools/call`。
4. 为 Server Schema 变化、Timeout、重复响应和 Cancellation 准备 Fixtures。
5. 验证 Resource 内容中的恶意指令不能扩大 Tool 权限。
6. 验证 Server A 的敏感结果不会自动进入 Server B 的请求。

实现完成后应能指出：协议协商、身份认证、业务授权、用户审批和真实副作用分别发生在哪一层。

## 常见误区

- 接入 MCP 后应用自然获得完整 Agent 能力。
- MCP 自动解决 OAuth、业务授权和 Prompt Injection。
- 所有内部函数都应该包装成 MCP Tool。
- 本地 stdio Server 天然可信。
- Elicitation 可以直接替代应用自己的 Approval。

## 本章小结

MCP 统一了 Host、Client 与 Server 之间发现和调用能力的方式，但 Host 仍然持有 Context、策略、授权、审批和数据流责任。标准连接让工具生态更可组合，也要求更严格的供应链、版本与隔离治理。下一章将用[幂等、补偿与沙箱](/masterpiece-static-docs/07-工具-协议与行动控制/04-幂等-补偿与沙箱.md)处理 Command 结果不明、重复副作用和受限执行。

## 官方资料

- [MCP 2025-11-25 Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [MCP 2026-07-28 Release Candidate 公告](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
