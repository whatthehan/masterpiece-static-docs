# 04 · JSON Schema 基础

流式协议告诉 Runtime “收到了一个完整工具提案”，却不能说明提案里的字段是否可处理。订单号缺失、金额被写成字符串、提交模式出现未知值，都应该在进入领域逻辑前被稳定拒绝；这正是 JSON Schema 在模型接口中的位置。

但 Schema 只是一道结构门。一个字段齐全的退款提案仍可能越权、超额或引用陈旧订单，因此本章既讲清最小语法，也刻意保留结构合法与业务合法之间的距离，为后续工具调用的多层校验打基础。

## 学习目标

- 能读写模型输出与工具参数所需的最小 JSON Schema。
- 区分缺失、`null`、默认值和业务无效。
- 理解提供方 Schema 子集、运行时验证和版本演进。

## 1. 最小完整示例

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/schemas/refund-proposal-v1.json",
  "type": "object",
  "properties": {
    "order_id": { "type": "string", "minLength": 1 },
    "amount_minor": { "type": "integer", "minimum": 1 },
    "currency": { "type": "string", "enum": ["CNY", "USD"] },
    "reason": { "type": "string", "maxLength": 500 },
    "mode": { "type": "string", "enum": ["draft", "commit"] }
  },
  "required": ["order_id", "amount_minor", "currency", "reason", "mode"],
  "additionalProperties": false
}
```

核心关键词：

- `type`：JSON 数据类型，不是 TypeScript 类型。
- `properties`：允许的对象字段及各自约束。
- `required`：字段必须存在；不等于值不能为 `null`。
- `enum`：只允许列举值。
- `additionalProperties: false`：拒绝未声明字段。
- `minimum/maxLength/pattern`：局部语法约束。
- `$id/$schema`：Schema 身份和 dialect；模型提供方可能不接受这些元字段。

## 2. Missing、Null 与 Default

```json
{ "type": ["string", "null"] }
```

表示值可为字符串或 `null`，但字段是否必须出现仍由 `required` 决定。JSON Schema 的 `default` 通常是 annotation，不代表验证器会自动填值。应用必须明确：

- missing 是“调用者没给”。
- null 是“调用者明确给空”。
- default 由哪一层、在哪个版本填充。

## 3. 组合 Schema

- `oneOf`：必须恰好满足一个分支。
- `anyOf`：至少满足一个分支。
- `allOf`：同时满足全部分支。

它们能表达更复杂结构，但并非所有模型 Structured Outputs 都支持完整 Draft 2020-12。对目标提供方，必须查其受支持子集并使用 contract tests；不要因为标准允许就假定 API 允许。

## 4. 合法与非法实例

对上述 Schema：

```json
{"order_id":"o_1","amount_minor":1000,"currency":"CNY","reason":"重复扣款","mode":"draft"}
```

结构合法。但以下情况仍可能业务非法：订单属于另一租户、余额仅 500、已退款、`mode=commit` 未审批。

```json
{"order_id":"o_1","amount_minor":"1000","currency":"RMB","reason":"x","mode":"draft","actor":"admin"}
```

结构非法：金额类型错、枚举错、含额外字段。

## 5. 运行时验证

TypeScript interface 会被擦除，Rust struct 反序列化也不能证明业务语义。所有外部边界都执行：

```text
bytes/JSON parse
→ Schema validation
→ domain conversion
→ semantic validation
→ authorization/policy
```

验证失败返回稳定错误码和字段路径，不把巨大验证器错误原样塞回模型。

## 6. 版本演进

- Schema 有稳定 ID/version，并随 Trace 记录。
- 新增 optional 字段通常较兼容；新增 required、改变 enum/语义是 breaking change。
- Consumer 先兼容，再让 Producer 发送新字段。
- 审批和幂等 payload hash 必须绑定同一规范化 Schema 版本。
- 不依赖运行时悄悄填默认值改变旧请求意图。

## 前置微实验（30 分钟）

为一个 `draft_send_email` 写 Schema，至少含收件人、主题、正文引用和数据分类。准备 5 个结构非法实例与 5 个结构合法但业务/权限非法实例，逐个标出失败层。

通过证据：能解释 `strict` 只影响结构层；能准确区分 missing、null 和业务默认。

## 常见误区

- `required` 表示字段不能是 `null`。
- `default` 一定会自动填入。
- TypeScript 类型通过编译就无需运行时验证。
- 标准 Draft 2020-12 的全部关键词都被模型提供方支持。
- Schema version 相同就代表业务语义永远相同。

## 本章小结

JSON Schema 能约束字段形状、缺失与组合关系，并为版本化协议提供共同语言，但它不能验证领域事实、权限或副作用。下一章将把 Schema 放回完整的[结构化输出与工具调用](/masterpiece-static-docs/04-模型接口与Agent内核/05-结构化输出与工具调用.md)协议，逐层说明一个候选动作如何获得执行资格。

## 章末检查

1. `required` 与 `type: ["string", "null"]` 分别控制什么？
2. 为什么 `additionalProperties: false` 仍不能阻止越权退款？
3. Schema breaking change 会怎样影响旧审批与重放？

## 一手资料

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [JSON Schema: Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
