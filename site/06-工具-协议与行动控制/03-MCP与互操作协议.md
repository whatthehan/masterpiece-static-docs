# 03 · MCP 与互操作协议

## 学习目标

- 理解 MCP 的 Host/Client/Server、数据层与传输层。
- 区分 Tool、Resource、Prompt 及其控制权。
- 知道 MCP 标准化了连接，不会自动提供 Agent Runtime 或安全策略。

## 1. 当前事实边界

截至 2026-07-11，最新稳定 MCP protocol revision 为 `2025-11-25`。已锁定的 `2026-07-28` Release Candidate 包含破坏性变更，最终版计划于 7 月 28 日发布；它不是本教材实施基线。学习时要把“稳定规范的事实”与“候选版的迁移预告”分开，实施前再核对最终规范和 SDK。

## 2. 架构

```text
MCP Host（AI 应用、策略与用户界面）
 ├─ Client A ↔ Server A
 └─ Client B ↔ Server B
```

- Host 管理模型、Context、权限、同意和多个 Client。
- 一个 Client 与一个 Server 建立隔离的有状态会话。
- Server 暴露聚焦的上下文或能力，可为本地进程或远端服务。

## 3. 两层协议

- Data layer：JSON-RPC 2.0、生命周期、能力协商、请求/响应/通知和原语。
- Transport layer：stdio、Streamable HTTP、连接、认证与传输安全。

新实现不应把旧 HTTP+SSE 兼容路径误当默认传输。实验性 Tasks 等能力不属于前置必修。

## 4. 三个服务端原语

| 原语        | 用途        | 典型控制关系            |
| --------- | --------- | ----------------- |
| Tools     | 查询或执行能力   | 模型可提议，Host/用户最终控制 |
| Resources | 可读取的上下文数据 | 应用选择与加载           |
| Prompts   | 可复用交互模板   | 用户显式选择            |

Client 还可能提供 sampling、roots、elicitation。它们会扩大数据、成本和信任边界，应单独授权和审计。

## 5. 生命周期与能力协商

```text
initialize(version, capabilities)
→ negotiate
→ initialized
→ list/get/call + notifications
→ shutdown
```

- 双方只能使用已声明能力。
- 不兼容版本应失败，而非静默猜测。
- 请求需要 timeout/cancellation。
- 工具列表和资源可动态变化，需要版本和缓存策略。

## 6. MCP 不是什么

MCP 不是 planner、workflow engine、长期记忆、RAG 算法、身份提供商、授权策略引擎、沙箱或多 Agent 协商协议。接入 MCP Server 只是扩展能力表面，也同时扩大供应链和数据泄漏风险。

## 7. Host 的安全责任

- Server 信任与版本固定。
- 凭证存储和 token audience 校验。
- 最小工具与数据暴露。
- 参数/结果验证、审批、rate limit、timeout 和 audit。
- 不把一个 Server 的敏感数据无控制转给另一个 Server。
- 把工具描述、annotations 和结果视为不可信，除非来源已验证。

## 纸面微实验（30–45 分钟）

为日历场景画 Host/Client/Server；把 12 项能力分为 Tool/Resource/Prompt；手工推演 `initialize → tools/list → tools/call`，标出身份、授权、审批和执行分别在哪层发生。

## 常见误区

- 接 MCP 就获得 Agent 能力。
- MCP 自动解决 OAuth、业务授权和 Prompt Injection。
- 所有内部函数都应该变成 MCP Tool。
- 本地 stdio Server 天然可信。
- Elicitation 可以直接替代应用审批。

## 章末检查

1. MCP Host 为什么不能把安全责任交给 Server？
2. Tool、Resource、Prompt 的控制关系为何不同？
3. Capability negotiation 解决什么问题？

## 一手资料

- [MCP 2025-11-25 Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [MCP 2026-07-28 Release Candidate 公告](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
