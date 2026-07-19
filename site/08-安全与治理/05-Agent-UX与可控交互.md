# Agentic UI 03 · Agent UX 与可控交互

上一章已经让 Resolution Desk 通过 AG-UI Adapter 传递运行、消息、Tool 与 State Event。事件能够抵达浏览器之后，下一个问题不是怎样增加动画，而是怎样把服务端事实投影成可信界面：用户必须看清正在处理的对象、金额、依据、资源版本和外部效果，模型生成的文案不能伪造 Approval，也不能决定哪些按钮可用。

支付请求发出后若网络中断，用户再点击停止，前端最容易犯的错误是立刻显示“退款已取消”。实际上，Runtime 只确认收到了停止意图，尚不知道支付系统是否已经提交退款。

Agent UX 不只是聊天气泡、流式文字和 Loading 动画。它是持久 Runtime 状态的产品化投影：展示已经确认的事实、仍然未知的部分、当前责任人，以及在这一状态下真正合法的操作。

本章先固定公开状态、可信原生组件与用户控制的语义；下一章用 A2UI 实现低风险动态 Surface，随后安全主线把前文已经建立的 Authorization、Approval 与 Action Gateway 纳入 Threat Model、最小权限和纵深防御验证。界面可以先于完整安全门禁设计，但任何高风险动作在门禁完成前都只能停留在 Dry Run。

## 1. 从传统请求状态升级为任务状态

前端常见的 `idle / loading / success / error` 不足以表示长任务和外部副作用。一个退款 Run 可能经历：

| Public Run State                     | 用户可见含义             | 合法操作                  |
| ------------------------------------ | ------------------ | --------------------- |
| `waiting_input`                      | 政策来源冲突，需要确认适用版本    | 补充信息、选择来源、停止          |
| `waiting_approval`                   | 退款提案已经冻结，等待有资格的人批准 | 批准、拒绝、返回修改            |
| `executing_tool`                     | 正在向支付系统提交          | 请求停止后续工作、查看详情         |
| `cancel_requested`                   | 已收到停止意图，正在中止未开始的工作 | 查看状态；不承诺撤销在途动作        |
| `in_doubt` / `reconciling`           | 外部效果尚未确认，或正在查询权威状态 | 等待核对、联系人工；不开放普通 Retry |
| `completed_with_effect_after_cancel` | 退款已发生，停止请求晚于提交     | 查看回执、申请后续处理           |
| `manual_intervention`                | 自动核对到期，已有明确人工责任人   | 补充材料、查看处理期限           |

这张映射表是前后端契约。文案可以调整，状态含义不能由组件局部改写。

## 2. UI 消费的是 Public Run State

内部状态机可能包含很多运维细节，前端需要稳定的公开投影。本节直接复用[Agent Application Server 与 UI 事件协议](/masterpiece-static-docs/05-模型接口与Agent内核/09-Agent-Application-Server与UI事件协议.md)定义的 `RunSnapshot`、`UIState`、`RunEvent`、`PublicRunState`、`EffectStatus` 与 `PublicControl`，不再建立第二套状态协议。

```ts
type UXProjection = {
  run: UIState;
  goal: string;
  currentStep?: string;
  evidence: EvidenceSummary[];
  pendingGate?: HumanGateSummary;
  nextAction?: string;
};
```

`UXProjection` 只补充目标、证据和当前步骤等展示数据。权威状态仍来自 `run.state`，外部效果来自 `run.effectStatus`，合法控件来自 `run.availableControls`；模型不能决定这些字段。刷新页面、切换设备或断线重连后，客户端从 Snapshot 与后续 Event 重建同一视图，而不是从本地聊天记录猜测。

## 3. Streaming 不是 Progress

持续输出 Token 只能证明模型仍在生成，不能说明任务完成了多少。有效进度应来自可验证阶段，例如：

- 已检索 3 个获准来源，1 个来源因过期被排除；
- 退款资格判断已完成，正在生成不可变提案；
- 提案已获批准，支付 Command 已提交；
- ACK 未收到，正在按幂等键查询 Receipt；
- 自动核对将于 10 分钟后转人工。

避免展示伪精确的“完成 73%”，除非工作量确实可以确定性计算。对开放式研究任务，更诚实的表达是阶段、已完成项、未决问题和剩余预算。

## 4. Preview 与 Approval 必须引用同一份提案

审批前的 Preview 应来自持久 Proposal，而不是临时自然语言摘要：

```text
actor: user_42
order_id: order_123
amount_minor: 10000
currency: CNY
policy_version: refund-policy-2026-07
resource_version: 42
proposal_hash: sha256:...
expires_at: 2026-07-12T14:30:00+08:00
```

界面需要展示对象、精确参数、依据、数据去向、费用、可逆性、资源版本和有效期。审批后任一关键字段变化，Runtime 应生成新 Proposal 并重新审批。前端不能用旧 Modal 的“已同意”状态替新参数背书。

## 5. 每个按钮都是一个协议事件

| 控件                | 提交的事件                        | 明确不保证                |
| ----------------- | ---------------------------- | -------------------- |
| Stop / Cancel     | `cancel_requested`           | 已提交的外部效果被撤销          |
| Steer             | 为未执行目标创建版本化修改                | 改写已审批 Proposal 或历史事实 |
| Edit & Retry      | 保留旧 Attempt，创建带新输入的新 Attempt | 覆盖旧失败证据              |
| Resume            | 从持久 Snapshot 请求继续            | 绕过过期审批、权限或 Deadline  |
| Retry failed step | 请求 Runtime 计算安全重试路径          | 前端直接重复写 Command      |

事件至少携带 actor、`run_id`、目标版本与时间。前端可以乐观显示“请求已发送”，但必须等 Runtime 接受事件后才能改变业务状态。

一个纯 Reducer 先调用前章定义的 `applyEvent` 更新 canonical `UIState`，再派生展示字段：

```ts
function reduceUXProjection(
  view: UXProjection,
  event: RunEvent,
): UXProjection {
  const run = applyEvent(view.run, event);

  if (run.sync === "gap") {
    return { ...view, run };
  }

  return deriveUXProjection({ ...view, run });
}
```

`applyEvent` 使用 `event.seq` 与 `run.nextSeq` 实现重复 Event 去重和序号缺口检测；`sync: "gap"` 会触发 Snapshot 恢复。Reducer 不在断线时自行重新调用模型，也不根据 HTTP 状态猜业务终态。

## 6. 可解释性来自证据，不来自原始 Chain-of-Thought

用户通常需要看到：

- 当前目标与适用的规则版本；
- 采用、排除和冲突的来源；
- 模型提出的候选动作与确定性校验结果；
- 审批人、审批范围与有效期；
- 已执行工具、外部 Receipt 和真实 Outcome；
- 仍未知的事实、下一责任方和人工入口。

这些信息比原始 Chain-of-Thought 更稳定，也更适合审计。UI 应在视觉上区分权威事实、引用证据、模型推断和未知状态，避免用一个“置信度 92%”掩盖来源冲突。

## 7. 错误恢复是主流程，不是 Toast

复杂 Agent 应用通常需要聊天之外的任务工作台：

- **Timeline**：展示 Run、Item、Tool、Approval 与 Receipt；
- **Pending Inbox**：集中等待输入、审批和人工接管的任务；
- **Artifact View**：展示报告、Diff、表单或结构化结果；
- **Recovery View**：解释失败位置、已发生效果和安全重试路径；
- **Notification**：长任务离开页面后，在需要人时重新通知。

一次性错误提示（Toast）无法承载“结果未知、自动核对中、十分钟后转人工”这类长期状态。

## 实践：为 Resolution Desk 实现可信退款界面

### 进入本章时已有能力

Resolution Desk 已有 Canonical `RunSnapshot + RunEvent`、AG-UI Adapter 和可恢复的前端投影，能够展示 Proposal 与 `waiting_approval`；前文也已经建立 Authorization、Approval 与外部副作用门禁。当前 UI 仍可能把模型文本、HTTP 状态和本地按钮状态误当作领域事实，后续安全章节会把这些交互纳入完整攻击链和纵深防御验证。

### 本章增加的能力

基于 `RunSnapshot + RunEvent` 实现等待补充信息、等待审批、执行中、停止请求已收到、效果核对中、已转人工六个界面。每个界面必须注明：

1. 对应的 Runtime 状态和 Snapshot 字段；
2. 已确认事实与仍未知内容；
3. 当前控件提交的协议事件；
4. 每个控件明确不保证的事项；
5. 刷新和断线后如何恢复相同视图。

退款 Preview 与 Approval 必须由原生可信组件渲染服务端保存的 Proposal；组件从 `availableControls` 获取合法操作，不接受模型生成的金额、权限结论或按钮配置。本章只实现可信 UI，并用 Dry Run 验证合法 Approval 能推进到 `command_ready`；Mock `commit_refund` 仍不向常规业务 Run 开放，直到 [Agent 安全评测与 Red Team](/masterpiece-static-docs/08-安全与治理/07-Agent安全评测与Red-Team.md)及其前置安全门禁全部通过。

### 验收证据

用同一组 Snapshot/Event Fixture 验证刷新、重复 Event、序号缺口、Proposal 过期、审批后订单版本变化、模拟的未知效果和用户 Stop。界面必须恢复到服务端同一状态，旧审批不能继续使用，效果未知时不得显示失败、取消或成功。若某个界面无法映射到持久状态，或高风险 Approval 可由模型/A2UI Payload 生成，本章验收失败；全部通过后，合法原生 Approval 也只能在 Dry Run 中到达 `command_ready`，不能产生 Mock Receipt。

## 本章小结

Agent UX 是 Runtime 的诚实投影，而不是对模型输出的装饰。Resolution Desk 的退款 Preview 与 Approval 固定由原生可信 UI 承担；状态、证据和控制项都来自服务端事实。下一章进入 [Agentic UI 04：A2UI 与声明式生成界面](/masterpiece-static-docs/08-安全与治理/06-A2UI与声明式生成界面.md)，为低风险澄清与证据收集增加一个受控的动态 Surface。

## 一手资料

- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)
- [People + AI Guidebook](https://pair.withgoogle.com/guidebook/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
