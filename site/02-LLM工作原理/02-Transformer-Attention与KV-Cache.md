# 02 · Transformer、注意力（Attention）与 KV 缓存（KV Cache）

当 Agent 的上下文逐渐加入指令、证据、历史和工具结果时，工程问题不再只是“能否塞进窗口”，而是这些 Token 怎样被利用，以及输入和输出长度怎样转化为延迟与缓存压力。理解这一点，才能避免把长上下文、提示词缓存（Prompt Cache）或 KV 缓存误当作可靠记忆。

本章用仅解码器 Transformer 的教学模型建立性能直觉，不要求推导完整网络，也不假定所有闭源模型内部完全相同。重点是把注意力机制与 Context 选择、首 Token 延迟和并发资源联系起来。

## 学习目标

- 建立足以解释生成行为和性能的 Transformer 直觉。
- 理解因果遮罩（causal mask）、Q/K/V、多头注意力和位置表示。
- 区分 KV 缓存、Prompt Cache、上下文和应用记忆。

## 1. 仅解码器教学模型

不能假定所有闭源模型内部完全相同，但现代生成模型可用以下抽象理解：

```text
Token IDs
  → token + position representation
  → [掩码自注意力 → 多层感知机（MLP）→ 残差/归一化] × N
  → vocabulary logits
  → next-token distribution
```

## 2. 注意力做什么

标准缩放点积注意力（scaled dot-product attention）：

```text
Attention(Q,K,V) = softmax((QKᵀ / √d_k) + mask)V
```

- 查询（Query）表示当前位置要寻找什么。
- 键（Key）表示每个位置可怎样被匹配。
- 值（Value）是匹配后被组合的信息。
- Q、K、V 都来自隐藏状态的可学习线性投影。
- 多头在不同投影子空间中并行组合信息。

因果遮罩（causal mask）在训练和前向计算中实现“当前位置不可读取未来 Token”的自回归可见性约束；严格的条件依赖使已确认输出按顺序产生。推测式/分块解码（speculative/blockwise decoding）可以并行提出候选，但仍须验证其符合这一分解。注意力权重不是天然可靠的因果解释；“关注了哪里”不能直接等同于“为什么作出决定”。

## 3. 位置与上下文使用

纯注意力不自带顺序，需要位置表示。旋转位置嵌入（Rotary Position Embedding，RoPE）是常见方法之一，但具体模型可能使用不同变体。位置编码、训练长度和注意力结构共同影响长上下文表现。

## 4. 预填充、解码与 KV Cache

- 预填充（prefill）：处理已有输入，通常可以对多个位置并行计算。
- 解码（decode）：每次生成一个新 Token，自回归重复。
- KV 缓存（KV Cache）：保存各层历史 Token 的 Key/Value，使下一步无需重算全部历史 K/V。

KV Cache 随序列长度、层数、KV heads、head dimension 和并发增长。它减少重复计算，但不会扩大上下文上限，也不是跨会话长期记忆。

必须保持以下区分：

| 概念                  | 生命周期              | 用途          |
| ------------------- | ----------------- | ----------- |
| KV Cache            | 一次推理/会话执行中的模型状态   | 加速 decode   |
| Prefix/Prompt Cache | 服务端可复用的相同前缀计算     | 降低重复输入成本/延迟 |
| Conversation State  | API 或应用保存的消息/item | 下一次重新构造上下文  |
| Application Memory  | 数据库中的持久信息         | 按策略跨运行读取    |

## 5. 性能直觉

- 首 Token 延迟（Time to First Token，TTFT）：从请求到首 Token，常受预填充和排队影响。
- 单 Token 生成时间（Time per Output Token，TPOT）：生成阶段每个 Token 的时间。
- 长输入增加 prefill 工作和缓存占用。
- 长输出是串行 decode，会明显拉长总延迟。
- 具体曲线还受分组查询注意力（Grouped-Query Attention，GQA）、滑动窗口、批处理和服务实现影响，必须实测。

## 微实验

用电子表格或最小程序实现单头注意力：

1. 验证每行权重和为 1。
2. 加 causal mask，让未来位置即使得分极高也不可见。
3. 修改一个 Key，观察受影响的位置。
4. 对比“每步重算所有 K/V”与“缓存历史 K/V”的等价输出和运行成本。

## 常见误区

- Attention 等于数据库检索。
- Attention map 是模型决策的完整解释。
- 开 KV Cache 后长上下文近似免费。
- Prompt Cache 会让模型永久学会内容。
- Rust 客户端能显著降低主要由远端模型推理决定的延迟。

## 章末检查

1. Causal mask 与自回归条件依赖各自起什么作用？
2. KV Cache 为什么既加速又消耗显存/内存？
3. KV Cache 与 Agent Memory 的语义为何完全不同？

## 一手资料

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [RoFormer: Rotary Position Embedding](https://arxiv.org/abs/2104.09864)
- [Attention is not Explanation](https://aclanthology.org/N19-1357/)
- [PagedAttention / vLLM](https://arxiv.org/abs/2309.06180)

## 本章小结

注意力让模型在当前序列内组合信息，KV Cache 则用内存换取解码阶段的重复计算；二者都不提供跨运行的权威状态。下一章将这些运行机制放回模型生命周期，解释预训练、后训练、上下文、检索与工具分别能赋予什么能力，又不能保证什么。

[下一章：预训练、后训练与推理](/masterpiece-static-docs/02-LLM工作原理/03-预训练-后训练与推理.md)
