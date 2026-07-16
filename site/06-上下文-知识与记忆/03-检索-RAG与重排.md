# 03 · Retrieval、RAG 与 Reranking

模型回答错了一个政策问题，最直觉的反应往往是修改 Prompt。但错误可能更早发生：正确文档没有被召回，过期版本排在前面，关键限定条件在切块时被截断，或者组装 Context 时因 Token 预算删去了证据末尾。

Retrieval-Augmented Generation（RAG）是一条数据管线，不是一个“开启后即可避免幻觉”的功能。本章会分别检查数据入库（Ingestion）、检索（Retrieval）、重排（Reranking）、Context 组装（Packing）、生成（Generation）和引用校验（Citation Validation），让每一层都可以独立测量。

## 本章目标

- 理解 RAG 的端到端数据流与各层失败方式。
- 组合稀疏检索（Sparse Retrieval）、稠密检索（Dense Retrieval）、混合检索（Hybrid Retrieval）与重排器（Reranker）。
- 在生成候选前落实 ACL 与 Freshness 约束。
- 分别评测检索、Context 组装和生成质量。
- 判断何时需要 Agentic Retrieval。

## 1. RAG 的完整管线

```mermaid
flowchart TD
    A["Source ingest"] --> B["Parse / normalize"]
    B --> C["Chunk + metadata"]
    C --> D["Sparse / dense indexes"]
    Q["User query"] --> R["Normalize / rewrite"]
    I["Actor · tenant · purpose"] --> P["Authorized partitions / predicates"]
    D --> G["Candidate generation"]
    R --> G
    P --> G
    G --> V["ACL · freshness · provenance recheck"]
    V --> F["Fusion"]
    F --> K["Rerank"]
    K --> U["Deduplicate / context pack"]
    U --> M["Model generation"]
    M --> CITE["Claim / citation verification"]
```

向量数据库只负责其中一部分。最终质量取决于每一个箭头是否保留了语义、权限和版本。

## 2. Ingest 决定了后续能否检索

Ingestion 不是把文件按固定长度切分后生成 Embedding。至少要处理：

- 文档格式解析与 OCR 质量；
- 标题、章节、表格、列表和记录边界；
- tenant、ACL、版本、生效时间与来源；
- 内容哈希、父级文档和位置；
- 删除、撤回与增量更新。

### Chunk 太小

限定条件、主语和例外条款被拆开。例如“购买后 7 天可退款”与下一段“数字商品除外”分别进入不同 chunk，单独召回第一段会生成错误结论。

### Chunk 太大

相关信号被大量无关文本稀释，重排成本和 Context Token 占用也随之上升。

结构化文档应优先按语义边界切分，再设置最大长度和重叠范围。每个 Chunk 都必须继承父级文档的权限和版本元数据。

## 3. Sparse、Dense 与 Hybrid Retrieval

### Sparse retrieval

基于词项匹配，擅长：

- 错误码、订单号和 API 名称；
- 法规编号和精确短语；
- 罕见专有名词。

### Dense retrieval

基于 embedding 相似度，擅长：

- 同义改写和自然语言表达差异；
- 用户问题与文档措辞不一致的场景；
- 主题层面的语义匹配。

Dense retrieval 也可能把“允许退款”和“不允许退款”拉得很近，因为它们共享大量主题词。相似度不是事实蕴含关系。

### Hybrid retrieval

先分别生成 Sparse 与 Dense 候选，再使用倒数排序融合（Reciprocal Rank Fusion，RRF）或其他方法合并。Hybrid Retrieval 通常能兼顾精确词项与语义改写，但仍需根据任务数据选择权重和候选数量。

## 4. Query Rewrite 可能提高召回，也可能改变意图

用户输入“上周买的课程能退吗”可能需要扩展为产品类型、购买时间和退款政策查询。Query rewrite 可以：

- 消除指代；
- 补充领域同义词；
- 拆成多个子查询；
- 生成 sparse 与 dense 的不同 query。

风险在于模型可能加入用户未提供的假设。改写后的 Query 应与原始 Query 一起记录，必要时还要用确定性规则检查关键实体和否定词。资源 ID、Tenant 和权限 Predicate 不应由模型改写。

## 5. 把 ACL 约束落实到检索实现

上一章已经说明了[为什么权限过滤必须发生在检索前](/masterpiece-static-docs/06-上下文-知识与记忆/02-来源-权限与新鲜度.md#4-权限过滤必须发生在检索前)。这里不再重复原理，只关注实现与验证：先根据 Actor、Tenant 和用途推导授权分区或 Predicate，再在该范围内生成 Top-K 候选，最后依据候选的元数据做防御性复验。

跨租户隔离可以由物理分区、行级安全（Row-level Security）或搜索引擎原生过滤器实现。无论采用哪种方式，都要在检索评测中加入高相似度的跨租户干扰文档，并分别记录“越权内容是否进入候选”和“有权内容是否因干扰而失去召回名额”。这两项断言比在生成结果上检查泄漏更早，也更容易定位故障。

## 6. Reranker 解决相关性排序，不解决权威性

Reranker 使用更强的模型或交叉编码器（Cross-encoder）重新比较 Query 与候选文档，通常比单一的 Embedding 分数更能识别细粒度相关性。但它仍不应决定：

- Actor 是否有权查看；
- 哪个版本当前生效；
- 来源是否具有法律或业务权威；
- 证据是否允许发送给目标模型。

这些条件应先由元数据和策略过滤。Reranker 只负责在合法候选中优化顺序。

## 7. Context Packing 是独立算法

重排后的 Top-K 结果不能直接拼接。Context Packing 还需要：

- 去除同一文档中重复或高度重叠的 Chunk；
- 合并相邻片段，恢复被切断的限定条件；
- 保留标题、来源、版本和位置；
- 对冲突证据显式分组；
- 在 Token 预算内为输出预留空间；
- 防止单一长文档占满 Context。

一种简化的 Evidence Block 如下：

```ts
type EvidenceBlock = {
  evidenceId: string;
  sourceId: string;
  version: string;
  location: string;
  validAt: string;
  trust: "verified_source_untrusted_content";
  text: string;
};
```

模型可以引用 `evidenceId`，应用再映射为用户可见引用。

## 8. 分层评测

### 8.1 Retrieval

- Recall\@k：相关证据是否进入候选。
- Precision\@k：候选中有多少真正相关。
- MRR / nDCG：正确证据的排序位置。
- ACL Violation Rate：无权证据进入候选的比例，目标应为 0。
- Stale Evidence Rate：过期或撤回内容进入候选的比例。

### 8.2 Context packing

- 关键条件是否被截断；
- 重复内容占用了多少 token；
- 冲突证据是否同时保留；
- 来源、版本和位置是否完整。

### 8.3 Generation

- 结论是否由证据支持；
- 引用是否真正支持相邻结论；
- 无证据时是否拒绝作答；
- 回答是否使用了无权或过期内容；
- 最终任务是否成功，而不只是语言流畅。

答案有据可依（Groundedness）与引用正确（Citation Correctness）并非同一件事：回答可能整体基于检索内容，却把某项结论连接到错误引用；也可能引用本身正确，却同时添加了证据中没有的结论。

## 9. 如何定位一次错误

| 现象                  | 优先检查                     |
| ------------------- | ------------------------ |
| 正确文档完全不在候选中         | Ingestion、Query、检索召回率    |
| 正确文档存在但排在很后         | Fusion、Reranking         |
| 正确 Chunk 被选中但例外条件丢失 | Chunking、Context Packing |
| Context 有完整证据，回答仍错误 | Prompt、模型语义理解、Grader     |
| 引用了旧版本              | Freshness Filter、索引失效机制  |
| 回答包含另一租户内容          | 授权分区，并按安全事件处理            |

这种分层能避免用 Prompt 修改掩盖数据管线问题。

## 10. Agentic Retrieval 的边界

Agentic Retrieval 允许模型根据中间结果继续改写 query、选择来源、展开引用或停止检索。它适合开放研究、信息缺口难以预先枚举的任务，但会增加：

- 模型与检索调用次数；
- Prompt Injection 暴露面；
- 终止和预算控制难度；
- 轨迹评测与缓存复杂度。

应先建立固定检索管线的 Baseline。只有当多轮检索能在复杂问题上稳定提高召回率或最终任务成功率，且成本与攻击面可接受时，才引入 Agent Loop。

## 实践：构建 Resolution Desk 的政策 RAG

### 进入本章时已有能力

政策记录已有 Provenance、ACL 与有效期，但 Resolution Desk 还不能稳定地从多版本政策中召回、排序并打包支持当前工单的证据。

### 本章增加的能力

准备 30～50 份售后政策与条款片段，刻意加入：

- 同义表达；
- 相同主题、相反结论；
- 旧版与新版政策；
- 另一 Tenant 的私有条款；
- 包含恶意指令的内容；
- 一条跨两个 Chunk 的例外条件。

### 验收证据

依次比较 Sparse、Dense、Hybrid 和 Reranking，分别报告检索召回率、ACL 违规率、过期证据率、引用支持率和最终任务成功率。复现一次“全局 Top-K 后过滤”造成的召回饥饿；在正确实现中，另一 Tenant 的高相似政策既不进入候选，也不会挤掉当前 Tenant 的有效证据。

## 常见误区

- RAG 可以消除幻觉（Hallucination）。
- Embedding 分数最高的内容就是权威事实。
- 检索召回率不足时只需修改 Prompt。
- 回答附带 URL 就说明每项结论都有依据。
- Agentic RAG 天然优于固定检索管线。

## 本章小结

RAG 是一条从内容入库到结论验证都可测量的数据管线。在授权范围内生成候选、执行混合检索、重排和 Context Packing，分别解决不同问题；任何一层都不能被“模型更聪明”替代。下一章将区分[状态、记忆与压缩](/masterpiece-static-docs/06-上下文-知识与记忆/04-状态-记忆与压缩.md)，决定哪些任务信息可以跨步骤或跨 Thread 保留。

## 延伸阅读

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
- [Dense Passage Retrieval](https://arxiv.org/abs/2004.04906)
- [Introduction to Information Retrieval](https://nlp.stanford.edu/IR-book/)
