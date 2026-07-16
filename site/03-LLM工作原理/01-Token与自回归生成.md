# 01 · Token 与自回归生成

前端应用向模型 API 发送的是 JSON：messages、tools、attachments 和配置项。模型内部处理的却不是 JavaScript 对象，而是一段经过编码的 Token 序列。理解这层转换，可以解释三个常见问题：为什么工具定义也会消耗 Context，为什么响应必须逐步生成，以及为什么模型输出永远不等于外部动作已经发生。

## 贯穿项目：Resolution Desk

Resolution Desk 在这一章仍不接入真实 Provider。项目只新增两类可复用工件：一份包含指令、订单摘要、政策片段和 Tool Schema 的 Token Budget Sheet，以及一段能够重建完整候选 Item 的 Recorded Stream Fixture。第 05 模块实现 Provider Adapter 时，将使用同样的输入和期望 Item 做 Contract Test。

## 1. 从文本到 Token ID

模型接收输入前，大致经历以下过程：

```text
Unicode 文本
→ 字节或字符表示
→ Tokenizer
→ Token 序列
→ Token IDs
→ Embedding Vectors
```

Token 不是稳定的“单词”。它可能是完整词、子词、标点、空格、字节片段或特殊控制标记。中文、emoji、代码、UUID、Base64 和 JSON 的 Token 密度差异很大，因此不能使用固定字符比例作为生产预算。

例如，下列字符串都需要实际使用目标模型的 Tokenizer 测量：

```text
Hello, world!
订单不符合退款条件。
👨‍👩‍👧‍👦
order_id=ord_01J9R8M4Y7Q3...
{"tool":"refund","amount":100}
```

同一段文本在不同 Tokenizer 或版本中也可能得到不同 Token ID。ID 只在对应 vocabulary 中有意义。

## 2. API 对象最终仍要序列化

应用通常看到结构化对象：

```ts
const input = [
  { role: "system", content: "Use the current refund policy." },
  { role: "user", content: "Check order 123." },
];

const tools = [
  {
    name: "get_order",
    description: "Read an order visible to the current actor.",
    parameters: { /* JSON Schema */ },
  },
];
```

Model Provider 会将 role、content、Tool Schema 和其他控制信息编码成模型可处理的序列。Context Budget 因而不只包含用户正文，还包括：

- 系统和开发者指令。
- 历史消息与此前的 Response Items。
- Tool 名称、Description 和 JSON Schema。
- 检索证据、文件内容和图片相关表示。
- Tool Result、错误信息和运行状态摘要。
- 为输出和 reasoning 预留的 Token。

Tool 数量不断增加时，即使用户输入很短，Schema 也可能占据大量输入预算。这正是动态 Tool Discovery 和按需加载有价值的原因。

## 3. 自回归生成

Decoder-only Language Model 的核心抽象是：给定当前前缀，预测下一个 Token 的条件分布；选中 Token 后，将它加入前缀，再预测下一步。

```text
P(x_1, x_2, ..., x_T) = Π P(x_t | x_<t)
```

一个看似完整的回答，实际上由许多局部选择连续构成。模型不会先在隐藏位置写好整段答案再一次返回。

```mermaid
flowchart LR
    P0["输入前缀"] --> D1["下一个 Token 分布"]
    D1 --> S1["选择 Token"]
    S1 --> P1["扩展后的前缀"]
    P1 --> D2["新的条件分布"]
    D2 --> S2["继续选择"]
    S2 --> E["直到停止条件"]
```

这也解释了 Streaming：服务端可以在生成过程中持续发送增量，而不必等待完整响应。

## 4. 从 Token 流到结构化 Item

现代模型 API 往往不只返回文本，还可能返回：

- Text Item。
- Tool Call。
- Tool Result 的输入引用。
- Reasoning 相关 Item 或 Summary。
- Refusal。
- Usage 与完成状态。

应用不应把所有增量都拼成一段字符串再解析。更稳妥的做法是根据类型化事件维护状态：

```ts
type ResponseState = {
  text: string;
  toolCalls: Map<string, { name: string; argumentsJson: string }>;
  status: "streaming" | "completed" | "refused" | "incomplete" | "failed";
};
```

Tool Call 的参数可能分多个 delta 到达，只有收到对应完成事件后才适合解析和校验。TCP（Transmission Control Protocol）网络分片、Server-Sent Events（SSE）事件、Provider Event 和应用内部 Event 分属四个层次，不能按网络分片直接触发业务动作。

## 5. 模型输出与外部效果的边界

模型可以生成：

```json
{
  "name": "create_refund",
  "arguments": {
    "orderId": "123",
    "amount": 100
  }
}
```

这只是候选动作。真实执行仍需 Runtime 完成：

```text
解析完整 Tool Call
→ Schema 校验
→ 业务语义校验
→ Authorization
→ Approval / Resource Version 复核
→ 执行 Tool
→ 保存 Receipt 与 Outcome
```

模型说“退款已完成”更不能证明支付系统已经改变。语言模型只生成序列或结构化 Item；外部副作用由应用代码产生。

## 6. 停止生成不等于任务完成

一次响应停止可能有多种原因：

- 正常完成。
- 达到输出长度或 Context 限制。
- 模型拒绝。
- Provider Timeout 或 Rate Limit。
- Tool Call 已生成，等待应用执行。
- 客户端取消。
- 协议或网络错误。

应用应依据 API 的类型化状态与错误字段判断，而不是搜索“完成”“抱歉”等文本。Agent Runtime 还需要在模型响应结束后判断整个 Run 是否完成，二者不是同一个生命周期。

## 7. Token Budget 的工程影响

Token Budget 同时影响：

### 成本

输入、输出和缓存命中通常采用不同计费方式，具体以 Provider 文档为准。应用应记录实际 usage，而不是只按字符数估算。

### 延迟

长输入增加 prefill 工作，长输出增加串行 decode 时间。一个响应只有几行，不代表前面数万 Token 的 Context 没有延迟成本。

### 截断

历史、Tool Result 或输出可能因预算不足而不完整。自动丢弃最旧消息未必安全，因为旧消息中可能包含仍有效的约束。

### 质量

更多 Token 并不总是更好。冲突、过期和无关内容会降低有效信号。

### 安全

进入 Context 的外部文档越多，Prompt Injection 与敏感数据暴露面越大。

## 8. 最小实验

完成三组不依赖 Agent Runtime 的测量：

1. 使用目标模型的 Tokenizer 或官方 Tokenizer 页面，比较中文、英文、代码、JSON、emoji 和长 ID 的 Token 数。
2. 对 Resolution Desk 的同一份静态请求逐步加入 `get_order`、`get_policy` 和 `draft_refund` Schema，记录 Token 数；若没有可用 API，首 Token 延迟留作第 05 模块实测，不用估算值填充。
3. 使用下面的教学用 Recorded Fixture，按顺序拼接参数并只在 `item.completed` 后解析。它表达完整性边界，不冒充任何 Provider 的正式 Event 名称：

```jsonl
{"type":"item.started","itemId":"call_1","kind":"tool_call","name":"draft_refund"}
{"type":"arguments.delta","itemId":"call_1","delta":"{\"orderId\":\"ord_1001\","}
{"type":"arguments.delta","itemId":"call_1","delta":"\"amountMinor\":5000}"}
{"type":"item.completed","itemId":"call_1"}
```

验收标准：

- 预算计算包含指令、历史、Tool Schema 和输出预留。
- Tool 参数只在 Item 完成后解析。
- 截断、拒绝、取消与正常完成具有不同状态。
- 没有任何网络 delta 直接触发外部写操作。

保存 Token Budget Sheet、原始 JSONL 和期望的完整 Item。真实 Provider Event 的类型、闭合边界与 usage 将在模型接口章节中替换并验证这份教学 Fixture。

## 常见误区

- 模型直接读取 JavaScript 对象或数据库记录。
- Token 是稳定的语言学单词。
- Token 数只影响价格，不影响延迟、截断和质量。
- 流式网络分片可以直接当作完整 Tool Call。
- 模型结束生成就表示整个业务任务完成。
- Tool Call 符合 JSON Schema 就可以立即执行。

## 章末检查

1. 为什么 Tool Schema 也会占用 Context Budget？
2. 字符数为何不能作为可靠的 Token 上限？
3. Provider Response 完成与 Agent Run 完成有什么差异？
4. 自回归生成与真实外部动作之间的执行边界在哪里？

## 一手资料

- [Neural Machine Translation of Rare Words with Subword Units](https://aclanthology.org/P16-1162/)
- [SentencePiece](https://aclanthology.org/D18-2012/)
- [OpenAI tiktoken](https://github.com/openai/tiktoken)

## 本章小结

模型接收和生成的都是受预算约束的 Token 序列；API 中的 message、Tool 和 Item 最终都会映射到这条序列上。自回归生成解释了 Streaming 和路径依赖，也划清了模型输出与外部效果的边界。下一章继续进入 Transformer，解释 Token 如何相互影响，以及 KV Cache 为什么能加速生成，却不能充当 Agent 的长期记忆。

[下一章：Transformer、Attention 与 KV Cache](/masterpiece-static-docs/03-LLM工作原理/02-Transformer-Attention与KV-Cache.md)
