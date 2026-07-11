# 03 · 最小权限、隐私与 Confused Deputy

在注入攻击链中，“读取内部记录”和“向外发送结果”可能分别通过单点权限检查，组合起来却构成数据泄露。这正是 Agent 治理比普通 API 授权更难的地方：系统既要追踪原始用户与委派链，也要理解数据从 Context 到工具、Trace 和评测集的完整去向。

本章用最小自主权（Least Agency）、最小权限（Least Privilege）与最小披露（Least Disclosure）缩小三个不同的风险面，并把混淆代理（Confused Deputy）的防线落到调用身份、资源服务端和跨域数据策略上。

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

## 本章小结

安全委派必须保留原始 actor、缩减权限并在资源服务端逐动作授权；隐私治理则要覆盖输入、模型、工具、状态、遥测、评测与删除传播的全生命周期。下一章将这些静态边界组织成[纵深防御与人类控制](/masterpiece-static-docs/07-安全与治理/04-纵深防御与人类控制.md)，明确每层失效时谁阻断、谁接管以及如何恢复。

## 一手资料

- [NIST SP 800-207 Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [MCP Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [RFC 8707 Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
