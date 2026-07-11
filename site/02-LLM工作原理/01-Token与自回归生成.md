# 01 · Token 与自回归生成

## 学习目标

- 区分字符、字节、Token 和 Token ID。
- 理解语言模型逐 Token 生成，而不是一次写完整答案。
- 能解释 Token 预算为何影响成本、延迟和截断。

## 1. 文本进入模型前发生什么

```text
Unicode 文本 → 字节/字符序列 → tokenizer → Token IDs → embedding vectors
```

Token 可能是整词、子词、空格、标点、字节片段或特殊控制符。CJK、emoji、代码、JSON、长 ID 的 Token 密度差异很大，不存在可靠的固定“一个 Token 等于几个字符”。

同一段文本在不同 tokenizer 或版本中可能产生不同 ID。Token ID 只在相应词表中有意义。

## 2. Chat 对象最终仍会序列化

应用看到的 role、message、tool definition 和 attachment metadata 是 API 结构；提供方会把它们编码为模型可处理的序列。系统消息、工具 Schema、历史和工具结果都会消耗上下文预算，不能只统计用户正文。

## 3. 自回归分解

Decoder-only 模型的教学抽象是：给定前缀，预测下一个 Token，然后把选中的 Token 加回前缀继续预测。

```text
P(x_1...x_T) = Π P(x_t | x_<t)
```

复杂行为可以从这一简单目标中出现，但模型仍然只产生序列或结构化 item。发送邮件、修改数据库等效果必须由应用执行。

## 4. 特殊 Token 与停止

序列中还可能包含：

- 起止、角色和分隔标记。
- 工具调用或结构化输出控制标记。
- 模态、附件或 reasoning 相关标记。
- stop sequence 或服务端停止事件。

应用应依据 API 的类型化完成/拒绝/截断事件判断状态，而不是仅搜索一段文本。

## 微实验

使用目标模型的 tokenizer 比较：

```text
Hello world
你好，世界
👨‍👩‍👧‍👦
customer_id=usr_01JABC...
function_call({"amount":100})
大量空格、换行和 Markdown 表格
```

再分别加入一个 2 KB JSON Schema 和十条历史消息，确认“业务正文之外”的 Token 成本。

## 常见误区

- 模型直接读取 JavaScript 对象。
- Token 是稳定的语言学单词。
- Token 数只影响价格，不影响行为。
- 生成停止一定代表任务完成；也可能是长度、拒绝、超时或协议错误。

## 章末检查

1. 为什么不能用字符数作为生产 Token 门禁？
2. 工具定义为什么也会争夺上下文预算？
3. 自回归生成与外部动作执行的边界在哪里？

## 一手资料

- [Neural Machine Translation of Rare Words with Subword Units](https://aclanthology.org/P16-1162/)
- [SentencePiece](https://aclanthology.org/D18-2012/)
- [OpenAI tiktoken](https://github.com/openai/tiktoken)
