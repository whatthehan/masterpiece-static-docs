# 01 · Context Engineering

上一部分已经让 Runtime 持有权威状态，但模型每次调用只能看到其中一个有限投影。退款任务进行到“核对政策”时，需要当前订单、适用条款和只读工具；进行到“等待审批”时，关键内容又变成冻结的提案、审批范围与有效期。机械追加整段历史既浪费窗口，也会把过期状态重新带回决策。

这正是上下文工程（Context Engineering）要解决的问题：从权威状态、知识来源和工具集合中，为当前一步重建最小而充分的决策输入。本章先建立选择与压缩方法，后续三章再分别补上来源治理、检索管线和长期记忆边界。

## 学习目标

- 把 Context 当作有限、每轮重建的决策输入。
- 掌握 select、structure、retrieve、compress、externalize、isolate、refresh。
- 能审计某个失败发生时模型到底看到了什么。

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

## 3. 组装顺序

一种可审计的顺序：

1. 稳定策略、任务身份与禁止项。
2. 当前目标、成功标准和用户约束。
3. 经过验证的权威状态投影。
4. 当前步骤可用的最小工具集。
5. 经过 ACL 和新鲜度过滤的证据。
6. 带来源/信任标签的最近观察。
7. 输出 Schema、预算和停止条件。

不是所有内容都必须是自然语言；结构化状态通常更稳健。

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

## 微实验

对一个 20 文档问题分别使用：全量 Context、top-k 检索、rerank、摘要、摘要+原文引用。测量答案、证据覆盖、Token、延迟和攻击文本暴露面。

## 常见误区

- Context 就是 Prompt 字符串。
- 全部历史比选择历史更安全。
- 摘要后原始证据可以立即丢弃。
- 暴露更多工具只会提高能力。
- Context 只影响质量，不影响安全和成本。

## 本章小结

Context 是 Runtime 按当前目标生成的有界投影，不是聊天历史或数据库的别名；选择、外置、压缩和刷新都必须可审计。下一章将进入[来源、权限与新鲜度](/masterpiece-static-docs/05-上下文-知识与记忆/02-来源-权限与新鲜度.md)，说明哪些知识有资格进入这份投影，以及它们何时应被拒绝或失效。

## 章末检查

1. 为什么 Context 应每轮从权威状态重建？
2. Externalize 与 Compress 分别解决什么问题？
3. Context Manifest 对失败复现有什么价值？

## 一手资料

- [Anthropic Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenAI Conversation state and compaction](https://developers.openai.com/api/docs/guides/conversation-state)
- [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/)
