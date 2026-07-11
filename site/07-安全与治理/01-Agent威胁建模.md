# 01 · Agent 威胁建模

## 学习目标

- 从资产、参与者、数据流和信任边界识别风险。
- 理解 Agent 扩大的是行动与组合风险，而不只是文本风险。
- 用 OWASP Agentic Top 10 2026 做覆盖检查而非合规打勾。

## 1. 先画系统，再列攻击

至少画出：

```text
User / Attacker
  → UI/API
  → Agent Runtime / Policy
  → Model Provider
  → Retrieval / Memory
  → Tools / MCP Servers / Other Agents
  → External Systems
  → Logs / Traces / Eval datasets
```

标记每条边的数据、身份、凭证、授权、保留期和是否跨组织边界。

## 2. 资产

- 用户和组织数据、商业秘密、个人信息。
- 凭证、delegation token、session 和审批。
- 资金、消息、订单、生产配置等可变资源。
- Agent 目标、Prompt、工具描述、策略和记忆。
- Trace、Eval 数据集和系统版本信息。
- 可用性、预算和用户对系统的信任。

## 3. 威胁参与者

- 恶意用户、外部内容作者、被攻陷的数据源。
- 恶意或被劫持的 MCP/工具供应商。
- 低权限内部用户与被混淆的高权限代理。
- 被污染记忆影响的后续正常用户。
- 失控但未必有攻击者的 Agent Loop。

## 4. OWASP Agentic Top 10 2026

1. ASI01 Agent Goal Hijack
2. ASI02 Tool Misuse and Exploitation
3. ASI03 Identity and Privilege Abuse
4. ASI04 Agentic Supply Chain Vulnerabilities
5. ASI05 Unexpected Code Execution
6. ASI06 Memory & Context Poisoning
7. ASI07 Insecure Inter-Agent Communication
8. ASI08 Cascading Failures
9. ASI09 Human-Agent Trust Exploitation
10. ASI10 Rogue Agents

这份列表是起点，不替代针对具体业务的数据流和滥用案例。

## 5. 安全不变量

与其列“不要被攻击”，不如定义可测试不变量：

- 未授权数据永不进入模型或第三方工具。
- 模型输出永不直接执行。
- 高风险动作只能使用绑定 actor、参数和版本的有效审批。
- 凭证不进入模型 Context、工具输出和普通日志。
- 任一 Run 都受 step、时间、成本和并发上限约束。
- 外部不可信文本不能修改策略、权限或长期记忆。

## 6. 风险 = 可能性 × 影响 × 暴露

模型鲁棒性只能降低某些攻击成功概率。即使无法阻止所有 injection，也可通过最小权限、网络限制和隔离降低 blast radius。优先保护高影响资产和不可逆效果。

## 微实验

为贯穿案例画数据流图，列出十个资产和五类攻击者；逐项映射 OWASP Top 10，并写六条可自动测试的不变量。任何没有明确 enforcement point 的“不变量”都不算完成。

## 常见误区

- 安全只需要测试恶意用户 Prompt。
- 内部数据库和工具描述天然可信。
- OWASP Top 10 全部打勾就完成威胁建模。
- 没有代码执行工具就没有高风险。
- 更强模型会自动缩小 blast radius。

## 章末检查

1. Agent 相比普通聊天应用新增了哪些资产和信任边界？
2. 安全目标为什么应写成可测试不变量？
3. Injection 无法完全消除时，怎样控制影响范围？

## 一手资料

- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [NIST AI RMF Generative AI Profile](https://doi.org/10.6028/NIST.AI.600-1)
- [AgentDojo](https://arxiv.org/abs/2406.13352)
