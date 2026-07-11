# 03 · 最小权限、隐私与 Confused Deputy

## 学习目标

- 把 Agent 当作非人身份和受托代理治理。
- 设计最小 agency、最小 privilege 和最小 disclosure。
- 覆盖数据从输入到记忆、Trace、Eval 和删除的完整生命周期。

## 1. 三个最小化原则

- Least Agency：任务不需要模型动态决定时，不增加自主性。
- Least Privilege：只授予当前 actor、resource、action 所需权限。
- Least Disclosure：只把完成当前步骤所需最少数据交给模型和工具。

这三者分别缩小控制流、执行能力和数据暴露面。

## 2. Agent 身份与委派

每次动作都应可回答：

```text
哪个用户/服务发起？
哪个 Agent/Runtime 代表它？
使用了什么短期凭证？
允许访问哪些资源和动作？
谁批准了什么？
最终由哪个 Executor 执行？
```

共享静态 API Key 会形成 attribution gap。优先短期、限定 audience、scope、purpose 和 session 的凭证。

## 3. Confused Deputy 与跨工具组合

即使每个工具调用都在自身权限内，`内部敏感读取 → 外部发送` 的组合仍可能违规。策略需要理解数据分类、来源与目的地，而不是只检查单个工具名。

跨 Agent 委派时必须传递原始 actor 和缩减后的权限，不能让高权限 Worker 只因请求“来自内部 Agent”就执行。

## 4. 隐私数据流

```text
input
→ context/RAG
→ model provider
→ tools/third parties
→ state/memory
→ logs/traces
→ eval datasets
→ backups/deletion
```

对每一跳定义目的、法定/业务依据、最小字段、保留、访问者、地域/第三方和删除。摘要、embedding、Trace 和模型评测样本都可能保留敏感信息，不能默认匿名。

## 5. Supply Chain

风险来源包括模型、SDK、MCP Server、Prompt/Skill、容器镜像、工具描述、数据集和观测平台。需要版本固定、来源验证、最小权限、变更审查、依赖清单和撤销路径。

## 6. 删除传播

用户删除需要映射到：Thread、Memory、Knowledge chunk、vector index、cache、Trace、Eval dataset、backup 和第三方。无法立即物理删除的层要有明确 tombstone、保留期与访问阻断。

## 微实验

模拟一个合法用户要求 Agent 读取另一租户记录，再让低权限 Agent 委派给高权限 Worker。即使 token 有效、Schema 合法，两条路径都必须在资源服务端拒绝并写 Audit。

## 常见误区

- 内部 Agent 可以相互信任。
- 只要 token 有效就能使用。
- Embedding 无法还原原文，所以不敏感。
- 删除聊天记录就完成数据删除。
- 供应商可信意味着其可访问内容也可信。

## 章末检查

1. Least Agency、Privilege、Disclosure 分别缩小什么？
2. 为什么策略要识别“敏感读取后外发”的组合？
3. Agent 的 Audit 记录必须保留哪些委派信息？

## 一手资料

- [NIST SP 800-207 Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [MCP Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [RFC 8707 Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
