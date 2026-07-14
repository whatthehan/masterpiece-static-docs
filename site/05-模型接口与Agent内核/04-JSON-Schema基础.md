# 04 · JSON Schema：把模型输出变成可检查的输入

模型生成了一次退款提案：订单号、金额、币种和原因都在 JSON 中。TypeScript 编译器没有参与这次生成，因此应用首先要回答的不是“这笔退款是否合理”，而是“这段数据是否符合系统能够处理的结构”。JSON Schema 正是这个边界上的协议语言。

Schema 可以稳定地拒绝缺失字段、错误类型和未知枚举，却不能确认订单归属、剩余可退金额或当前用户权限。本章既介绍 Agent 应用中最常用的 JSON Schema 能力，也明确它不能解决的问题。

## 本章目标

- 编写工具参数和结构化输出所需的 JSON Schema。
- 区分 missing、`null`、default 与业务无效。
- 在 TypeScript 运行时执行校验并返回稳定错误。
- 理解 provider schema subset 与协议版本演进。

## 1. 从一份严格对象 Schema 开始

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/schemas/refund-proposal-v1.json",
  "type": "object",
  "properties": {
    "order_id": {
      "type": "string",
      "minLength": 1
    },
    "amount_minor": {
      "type": "integer",
      "minimum": 1
    },
    "currency": {
      "type": "string",
      "enum": ["CNY", "USD"]
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "mode": {
      "type": "string",
      "enum": ["draft", "commit"]
    }
  },
  "required": ["order_id", "amount_minor", "currency", "reason", "mode"],
  "additionalProperties": false
}
```

其中最重要的关键词是：

- `type`：JSON 数据类型，与 TypeScript 类型不是同一个系统。
- `properties`：对象允许出现的字段及局部约束。
- `required`：字段必须存在。
- `enum`：值必须属于有限集合。
- `additionalProperties: false`：拒绝未声明字段。
- `minimum`、`minLength`、`maxLength`、`pattern`：局部语法约束。
- `$schema`、`$id`：声明 dialect 与 Schema 身份；模型提供方的接口未必接受这些元字段。

严格对象适合工具参数，因为模型多生成一个看似无害的 `actor_role: "admin"` 也应被拒绝，而不是被应用静默忽略。

## 2. Missing、Null 与 Default 是三种语义

```json
{
  "type": "object",
  "properties": {
    "note": { "type": ["string", "null"] }
  },
  "required": ["note"]
}
```

这份 Schema 要求 `note` 字段必须出现，但值可以是字符串或 `null`。

```text
{}                 → missing，不合法
{"note": null}    → 明确为空，合法
{"note": "..."} → 有值，合法
```

`default` 在 JSON Schema 中通常是 annotation，不保证 validator 自动填值。默认值必须由明确的应用层负责，并记录使用的是哪个版本的默认策略。对写操作而言，静默填充参数尤其危险：旧客户端省略字段的含义可能在新版本中改变。

## 3. 数字、日期与标识符要选择稳定表示

Agent 工具经常因为表示方式而产生歧义：

- 金额使用整数最小货币单位，例如 `amount_minor: 1099`，避免二进制浮点误差。
- 时间使用带时区的 ISO 8601 字符串，并在领域层解析与比较。
- 资源 ID 作为 opaque string，不让模型推断内部格式。
- 比例、数量和文本长度设置合理上限，避免资源滥用。

Schema 能检查字符串格式或数字范围，但“2026-02-30”是否被某个 format validator 拒绝、是否启用 format assertion，取决于实现配置。关键领域值仍应转换成专用类型后再校验。

## 4. 用组合类型表达互斥状态

比起两个可能冲突的布尔字段：

```json
{"send_now": true, "save_draft": true}
```

更稳定的表示是单个枚举：

```json
{"mode": "draft"}
```

当不同模式需要不同字段时，可以使用 `oneOf`：

```json
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "by_order" },
        "order_id": { "type": "string" }
      },
      "required": ["kind", "order_id"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "by_receipt" },
        "receipt_id": { "type": "string" }
      },
      "required": ["kind", "receipt_id"],
      "additionalProperties": false
    }
  ]
}
```

`oneOf` 要求恰好匹配一个分支，`anyOf` 要求至少匹配一个，`allOf` 要求同时满足所有分支。组合越复杂，模型越难稳定生成，provider 支持也越可能受限；可以用更简单的 tagged union 时，不必追求 Schema 技巧。

## 5. 标准 JSON Schema 与 Provider 子集

Structured Outputs 通常只支持 JSON Schema 的一个子集，且各提供方、API 与严格模式可能不同。工程上需要维护两层契约：

```text
Canonical application schema
        ↓ provider adapter / compatibility check
Provider-supported schema
```

不能因为 Draft 2020-12 允许某个关键词，就假定模型 API 也接受。接入时用正反 fixtures 做 contract test，至少覆盖：

- 所有必填字段；
- 枚举和数值边界；
- nested object 与 array；
- `additionalProperties`；
- nullable 字段；
- 预期使用的组合关键词。

## 6. 在 TypeScript 运行时校验

以 Ajv 为例：

```ts
import Ajv from "ajv";
import refundProposalSchema from "./refund-proposal-v1.json" with { type: "json" };

const ajv = new Ajv({ allErrors: true, strict: true });
const validateRefundProposal = ajv.compile(refundProposalSchema);

export function parseRefundProposal(value: unknown) {
  if (!validateRefundProposal(value)) {
    return {
      ok: false,
      code: "INVALID_REFUND_PROPOSAL",
      fields: validateRefundProposal.errors?.map(error => ({
        path: error.instancePath,
        keyword: error.keyword,
      })),
    } as const;
  }

  return { ok: true, value } as const;
}
```

不要把 validator 产生的巨大错误对象原样送回模型，其中可能包含不必要的输入片段和实现细节。应用应映射成稳定错误码、字段路径和有限提示。

边界处理顺序应保持清晰：

```text
bytes → JSON parse → Schema validation → domain conversion
→ semantic validation → authorization → execution
```

## 7. 结构合法仍可能完全错误

下面的对象符合本章 Schema：

```json
{
  "order_id": "order_123",
  "amount_minor": 10000,
  "currency": "CNY",
  "reason": "重复扣款",
  "mode": "commit"
}
```

它仍可能在其他层失败：

- 订单不存在或属于另一租户；
- 可退余额只有 5000 分；
- 订单已经完成退款；
- 当前 actor 只有只读权限；
- `commit` 尚未获得绑定当前参数的审批；
- 读取订单后资源版本已经变化。

Schema 的价值在于缩小后续系统需要处理的输入空间，不在于证明动作正确。

## 8. Schema 版本演进

Schema 应有稳定 ID 和版本，并随 Trace、Tool Call、审批与幂等记录一起保存。

- 新增 optional 字段通常较容易兼容。
- 新增 required 字段、删除字段或改变 enum 通常是 breaking change。
- 字段名不变但语义改变，同样属于 breaking change。
- Consumer 应先兼容新版本，再让 Producer 发出新字段。
- 审批的 proposal hash 必须绑定规范化 payload 和 Schema version。
- 旧 Run 的恢复必须使用当时的契约，不能静默套用新默认值。

## 实践：区分结构错误与业务错误

为 `draft_send_email` 定义 Schema，字段包括收件人、主题、正文工件引用和数据分类。准备两组 fixture：

- 5 个结构非法输入：字段缺失、类型错误、未知枚举、额外字段、超长主题。
- 5 个结构合法但业务非法输入：越权收件人、敏感数据外发、过期工件、未经审批的发送模式、超出发送配额。

每个 fixture 都应明确失败层和稳定错误码。若所有失败都归类为“Schema 不通过”，说明结构校验和业务策略仍然混在一起。

## 常见误区

- `required` 表示字段不能为 `null`。
- `default` 一定会由 validator 自动填充。
- TypeScript 编译通过后无需 runtime validation。
- JSON Schema 标准中的全部关键词都会被模型提供方支持。
- Schema 相同意味着业务语义永远兼容。

## 本章小结

JSON Schema 让外部 JSON 进入领域逻辑前具备可执行的结构约束，并为模型、TypeScript、存储和跨语言服务提供共同契约。它不判断事实、权限和副作用。下一章将把 Schema 放回[结构化输出与工具调用](/masterpiece-static-docs/05-模型接口与Agent内核/05-结构化输出与工具调用.md)的完整链路，说明一项模型提案如何逐步获得执行资格。

## 延伸阅读

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)
- [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
