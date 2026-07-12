# 01 · Context Engineering

当 Coding Agent 先搜索再打开少量文件、按需加载 Skill、在历史过长时 Compaction，你已经看见 Context Engineering 的产品表面。关键不是“让模型拥有更多资料”，而是让它在当前一步只看到最有用、最新且获准使用的资料。

退款任务进行到“核对政策”时，需要当前订单、适用条款和只读工具；进行到“等待审批”时，关键内容又变成冻结提案、审批范围与有效期。机械追加整段历史既浪费窗口，也会把过期状态重新带回决策。上下文工程（Context Engineering）因此是一段每轮执行的构建过程，而不是一次 Prompt 编辑。

## 本章解锁

- **工程判断**：把 Context 当作有限、每轮重建的决策投影，区分 Compaction、Reset、Externalize 与 Subagent Isolation。
- **Workbench 工件**：一个可执行的 Context Builder 顺序和版本化 Context Manifest。
- **通过证据**：能重放“为什么选择这些规则、证据和工具，为什么排除其他内容”，并比较质量、Token、延迟与风险。

## 1. Context 是运行时投影

```text
Context_t = f(
  policy, goal, runtime_state, selected_history,
  available_tools, retrieved_evidence, recent_observations,
  output_contract, budgets
)
```

它是函数输出，不是数据库全量导出。相同 Thread 的不同步骤需要不同 Context。

## 2. 七种核心操作

- Select：只保留当前决策必要的信息。
- Structure：区分指令、可信状态、不可信数据、示例和输出协议。
- Retrieve：按需读取来源，不预加载全部资料。
- Compress：把历史或大结果压缩成有损表示。
- Externalize：把计划、工件和证据存到窗口之外。
- Isolate：子任务用独立 Context，返回有限结果。
- Refresh：基于最新权威状态重建，而不是机械追加历史。

## 3. Context Builder 的可执行顺序

不要先收集全部信息再裁剪。先从**本轮唯一决策**反推所需输入：

1. 明确本轮要做的决策，例如 `decide_refund_eligibility`，而不是笼统的“继续任务”。
2. 从权威 Runtime/Domain State 推导必需事实、未决问题和允许动作。
3. 选择适用的稳定指令；冲突、过期或作用域不匹配的规则不得进入。
4. 对候选来源执行 actor/tenant ACL、新鲜度、版本与信任过滤。
5. 只暴露本轮必要的工具、Skill 和参数说明，避免无关可供性干扰选择。
6. 加入最近的类型化 Observation；外部自然语言保留来源与 `untrusted` 标记。
7. 添加输出 Schema、预算和停止条件，计算 Token 分配。
8. 记录 Manifest 和排除理由；调用结束后从新权威状态重建，不机械追加全部历史。

不是所有内容都必须是自然语言；结构化状态通常更稳健。

一个可重放 Manifest 可以长这样：

```yaml
decision: decide_refund_eligibility
builder_version: 4
stable_instructions:
  - source: app-policy
    version: 3
runtime_state:
  run_version: 18
  order_id: order_123
  order_version: 42
selected_tools:
  - get_order
selected_skill:
  id: refund-policy
  version: 3
evidence:
  - source_id: policy-2026-04
    valid_at: 2026-07-12
observations:
  - call_id: call_17
    trust: untrusted-tool-output
compaction:
  kind: derived
  source_event_range: [81, 143]
excluded:
  - id: policy-2025-10
    reason: expired
```

## 4. Context Budget

预算不只按 Token 数，还应按信息价值分配：

```text
高优先级：目标、禁止项、状态不变量、当前证据、动作契约
中优先级：少量相关历史、示例、补充说明
低优先级：重复背景、完整日志、大对象、无关工具定义
```

工具返回大对象时，优先用摘要、游标、工件引用和按需展开，不要直接回填全部字段。

## 5. 可复现性

Trace 至少记录 Context Manifest：纳入了哪些来源、版本、片段 ID、压缩器版本、工具集版本和 Token 统计。出于隐私可以不永久保存全文，但必须能在允许的保留期内重建或定位。

## 6. Compaction、Reset、Externalize 与 Isolate 不同

这些操作经常都被口头称为“减少上下文”，实际语义不同：

| 操作                      | 发生了什么                                                  | 主要风险                       |
| ----------------------- | ------------------------------------------------------ | -------------------------- |
| Compaction              | 用有损派生表示替换部分历史，同一 Run/Session 继续；表示可能可读，也可能是不透明 Item    | 约束、未决事项或来源丢失，误以为能从压缩结果反演原文 |
| Context Reset + Handoff | 新建干净 Context，重新加载基础指令、工具和环境，并以结构化 handoff 作为任务连续性的主要载体 | handoff 不完整，连续性成本上升        |
| Externalize             | 把计划、工件、证据或进度存到窗口外，按需再读                                 | 外部状态版本漂移或访问越权              |
| Subagent Isolation      | 子任务使用独立 Context，只返回有限结果                                | 委派缺信息、结果验证与成本放大            |

Anthropic 的长任务 Harness 实验专门区分了 Compaction 与 Context Reset：前者保留连续性，后者用结构化 handoff 换取干净窗口。OpenAI 的 Compaction 接口还可能返回不面向人类解释的 opaque item。不能把这些机制都简化成“总结一下历史”。

Summary 或 Compaction Item 都是非权威派生表示。权威 Event、Domain State、Approval 与 Receipt 不得只存在其中；系统应在允许的保留范围内保存原始事件、回执和来源引用，使派生物可追溯或可重新计算，而不是假设能从压缩结果精确还原原文。

## 7. Context 也是延迟与成本工程

稳定前缀、工具定义和反复变化的任务数据如何排列，会影响提供方的 Prompt Cache 命中；具体缓存键和计费必须以当前 API 文档为准。工程上至少记录：

```text
input_tokens
cached_input_tokens / cache_hit
context_builder_version
stable_prefix_version
toolset_version
compaction_version
```

不要为了缓存把过期规则固定在前缀里，也不要为了省 Token 删除完成判断所需的证据。质量、安全、延迟与成本必须用同一 M0 切片一起比较。

## 微实验

对一个 20 文档问题分别使用：全量 Context、top-k 检索、rerank、摘要、摘要+原文引用。测量答案、证据覆盖、Token、延迟和攻击文本暴露面。

## 带回 Workbench

把 L1 中的 `buildContext(snapshot)` 从临时字符串替换为显式管线，并保存上面的 Manifest。增加四类回归：

1. 过期政策被排除，当前政策被选择。
2. 无权证据在候选生成前就不可见。
3. Compaction 前后，禁止项、未决审批与证据引用不丢失。
4. 移除无关工具后，质量不下降且 Token/延迟改善。

此时 Workbench 获得的是一个可重放、可消融的 Context Builder，而不是“更会写 Prompt”的字符串模板。

## 常见误区

- Context 就是 Prompt 字符串。
- 全部历史比选择历史更安全。
- 摘要后原始证据可以立即丢弃。
- 暴露更多工具只会提高能力。
- Context 只影响质量，不影响安全和成本。

## 章末检查

1. 为什么 Context 应每轮从权威状态重建？
2. Externalize 与 Compress 分别解决什么问题？
3. Context Manifest 对失败复现有什么价值？

## 一手资料

- [Anthropic Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [OpenAI Conversation state and compaction](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [OpenAI — Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Claude Code: How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/)

## 本章小结

Context 是 Runtime 按当前决策生成的有界投影，不是聊天历史或数据库的别名；选择、外置、压缩、重置和隔离都有不同语义，并且必须由 Manifest 解释。下一章进入[来源、权限与新鲜度](/masterpiece-static-docs/05-上下文-知识与记忆/02-来源-权限与新鲜度.md)，回答哪些知识有资格成为候选、何时必须失效，以及为什么权限过滤不能留到模型看过以后。
