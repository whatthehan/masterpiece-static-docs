# 06 · Agent Loop 与状态机

## 学习目标

- 把 Agent 理解为受约束反馈控制系统。
- 能区分等待、运行、取消中、未知效果收敛和真正终态。
- 能用 `state × event → effect + next state` 表达合法转移。
- 区分事件历史、状态快照和模型 Context 投影。

## 1. 最小决策模型

不需要先学习完整强化学习数学，只需建立部分可观测直觉：

```text
真实环境状态 s_t
  → 有限观察 o_t
  → Runtime 构造 context_t
  → Model 提议 action a_t
  → Runtime 验证、执行或拒绝
  → 环境进入 s_(t+1)
```

模型看到的是投影，不是真实环境全量状态；观察也可能陈旧、冲突或恶意。

## 2. 最小 Loop

```text
读取权威状态
→ 组装本轮 Context
→ 调用模型并等待完整语义 item
→ 校验候选回答或动作
→ 执行 / 等待澄清 / 等待审批 / 拒绝
→ 持久化事件、回执与预算
→ 继续、收敛未知效果或进入终态
```

无限 `while` 不是 Runtime。每次迭代必须有合法转移和资源上限。

## 3. 状态分类

### 活跃与等待状态

```text
CREATED
RUNNING_MODEL
VALIDATING_ACTION
WAITING_INPUT
WAITING_APPROVAL
EXECUTING_TOOL
OBSERVING
```

### 取消与未知效果收敛状态

```text
CANCEL_REQUESTED
CANCELLING
IN_DOUBT
RECONCILING
```

`IN_DOUBT` 表示外部 command 可能已经发生但缺少确定回执。它不是 `FAILED`，更不能提前标为 `CANCELLED`。

### 终态

```text
COMPLETED
COMPLETED_WITH_EFFECT_AFTER_CANCEL
REFUSED              模型/提供方拒绝生成
DENIED               应用策略禁止动作
INCOMPLETE           模型输出截断且无法安全继续
FAILED
CANCELLED            已确认无未收敛外部效果
BUDGET_EXHAUSTED
PARTIAL
MANUAL_INTERVENTION
```

这些状态的用户语义、恢复和 SLO 不同，不能压成一个 `error`。

## 4. 取消不是瞬时终态

```text
RUNNING/EXECUTING
  ─ cancel_requested → CANCEL_REQUESTED
  → CANCELLING
  ├─ 确认未提交效果 → CANCELLED
  ├─ 确认效果已提交 → COMPLETED_WITH_EFFECT_AFTER_CANCEL
  └─ 无法确认 → IN_DOUBT → RECONCILING
                         ├─ CANCELLED
                         ├─ COMPLETED_WITH_EFFECT_AFTER_CANCEL
                         └─ MANUAL_INTERVENTION / PARTIAL
```

取消后禁止新的模型规划动作，但 Runtime 可以执行预先定义的 reconciliation：按幂等键查询、接收迟到回执、补偿或转人工。它不是 Agent 自主产生的新业务动作。

## 5. 代表性转移表

| 当前状态                                                                                                 | Event                         | Guard                                                    | Effect                                            | 下一状态                                   |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| CREATED                                                                                              | run\_started                  | 任务/M0 可用                                                 | 初始化预算                                             | RUNNING\_MODEL                         |
| RUNNING\_MODEL                                                                                       | model\_tool\_call\_complete   | item 完整                                                  | 持久化 proposal                                      | VALIDATING\_ACTION                     |
| RUNNING\_MODEL                                                                                       | model\_incomplete             | 可安全重试且有预算                                                | 记录 attempt                                        | RUNNING\_MODEL                         |
| RUNNING\_MODEL                                                                                       | model\_incomplete             | 不可继续                                                     | 写失败原因                                             | INCOMPLETE                             |
| VALIDATING\_ACTION                                                                                   | missing\_user\_input          | 无安全默认                                                    | 写 clarification                                   | WAITING\_INPUT                         |
| VALIDATING\_ACTION                                                                                   | policy\_denied                | 确定拒绝                                                     | 写 policy decision                                 | DENIED                                 |
| VALIDATING\_ACTION                                                                                   | approval\_required            | proposal 已冻结                                             | 持久化 hash/expiry                                   | WAITING\_APPROVAL                      |
| WAITING\_APPROVAL                                                                                    | approved                      | hash、版本、身份有效                                             | 发出执行 command                                      | EXECUTING\_TOOL                        |
| EXECUTING\_TOOL                                                                                      | receipt\_success              | 回执可验证                                                    | 写 outcome                                         | OBSERVING                              |
| EXECUTING\_TOOL                                                                                      | timeout\_unknown              | command 可能提交                                             | 禁止新 key 重试                                        | IN\_DOUBT                              |
| CREATED/RUNNING\_MODEL/VALIDATING\_ACTION/WAITING\_INPUT/WAITING\_APPROVAL/EXECUTING\_TOOL/OBSERVING | cancel\_requested             | 未进入取消/收敛链                                                | 持久化 cancel intent，传播 Abort，停止新工作                  | CANCEL\_REQUESTED                      |
| CANCEL\_REQUESTED/CANCELLING                                                                         | cancel\_requested             | 取消意图已存在                                                  | 幂等 no-op，不重复发出业务动作                                | 保持当前状态                                 |
| IN\_DOUBT/RECONCILING                                                                                | cancel\_requested             | 已在收敛未知效果                                                 | 记录 cancel intent，不中断 receipt/权威状态核对               | 保持当前状态                                 |
| 任一活跃/等待状态                                                                                            | budget\_exhausted             | 无 in-flight command、无 unknown effect                     | 停止新工作，记录预算类型                                      | BUDGET\_EXHAUSTED                      |
| EXECUTING\_TOOL/OBSERVING                                                                            | budget\_exhausted             | 存在 in-flight command                                     | 停止新工作，保留 budget-exhausted fact，开始查询效果             | IN\_DOUBT                              |
| IN\_DOUBT/RECONCILING                                                                                | budget\_exhausted             | unknown effect 尚未收敛                                      | 保留 budget-exhausted fact，继续原收敛协议                  | 保持当前状态                                 |
| CANCEL\_REQUESTED/CANCELLING                                                                         | budget\_exhausted             | 取消链已禁止新工作                                                | 保留 budget-exhausted fact，不覆盖 cancel/effect status | 保持当前状态                                 |
| RECONCILING                                                                                          | effect\_absent                | 存在 cancel intent，权威系统确认无效果                               | 关闭 Run，保留其他 control facts                         | CANCELLED                              |
| RECONCILING                                                                                          | effect\_absent                | 无 cancel intent，存在 budget-exhausted fact                 | 记录无副作用                                            | BUDGET\_EXHAUSTED                      |
| RECONCILING                                                                                          | effect\_absent                | 无 cancel/budget-exhausted，deadline 仍有效，且仍可安全重试           | 使用原 idempotency key 发出新 attempt                   | EXECUTING\_TOOL                        |
| RECONCILING                                                                                          | effect\_absent                | 无 cancel/budget-exhausted，且不可安全重试                        | 记录可证明的未执行失败                                       | FAILED                                 |
| RECONCILING                                                                                          | effect\_present               | 存在 cancel intent，回执与 intent 匹配                           | 记录真实效果，保留预算 fact                                  | COMPLETED\_WITH\_EFFECT\_AFTER\_CANCEL |
| RECONCILING                                                                                          | effect\_present               | 无 cancel intent，存在 budget-exhausted fact，且任务 outcome 已完成 | 记录成功与预算耗尽 fact                                    | COMPLETED                              |
| RECONCILING                                                                                          | effect\_present               | 无 cancel intent，存在 budget-exhausted fact，且任务尚未完成         | 记录已发生效果和未完成项                                      | PARTIAL                                |
| RECONCILING                                                                                          | effect\_present               | 无 cancel/budget-exhausted，deadline 仍有效                   | 写 receipt/outcome，交给 Runtime 继续决定                 | OBSERVING                              |
| RECONCILING                                                                                          | reconcile\_deadline\_exceeded | 权威效果仍无法确认                                                | 保留 incident 和人工处置所有权                              | MANUAL\_INTERVENTION                   |

同一个 `RECONCILING` 必须持久化初始 `reconcile_reason` 与后续 control facts（cancel intent、budget-exhausted、deadline）。终态选择的优先级是：**cancel intent → budget-exhausted → 原 timeout/recovery 路径**。Deadline 过期必须先原子地记为 budget-exhausted fact；任一 retry 或 `OBSERVING` 继续路径都必须同时满足“无 cancel、无 budget-exhausted、deadline 仍有效”。“查到 effect”只是观察，不能脱离这些 control facts 直接选终态或继续工作。

非法示例：`COMPLETED + tool_started`、`WAITING_APPROVAL + 参数变化仍执行`、`IN_DOUBT + 新幂等键重试`、`RECONCILING + cancel_requested → CANCEL_REQUESTED`、`in-flight command + budget_exhausted → BUDGET_EXHAUSTED`、`普通 timeout 收敛到 effect_present → COMPLETED_WITH_EFFECT_AFTER_CANCEL`。Reducer 应明确拒绝，而不是忽略。

## 6. 三种数据表示

- Event Log：不可变地记录发生过什么。
- Snapshot：从事件派生的当前权威运行状态。
- Context Projection：本轮选择给模型看的有限信息。

```text
events ──reduce──> snapshot ──select/compact──> model context
```

消息数组不能同时可靠承担三者：删除消息破坏审计，追加全部消息又污染 Context。

## 7. 运行时不变量

- 模型只能提出动作，不能直接改权威状态。
- 只有通过校验的事件能触发状态转移。
- 每次模型/工具调用有稳定 `call_id` 和独立 `attempt_id`；业务 intent 有稳定幂等键。
- 审批绑定精确参数、actor、目标、resource version 和有效期。
- 真正终态不再产生模型规划或新业务 command。
- `RECONCILING` 只能执行预定义查询、去重、补偿或转人工路径。
- 并行调用只用于依赖独立且副作用安全的动作。
- 用户 steer/cancel 会改变后续允许转移。
- 状态写入使用 expected version/CAS，防止并发 reducer 覆盖。

## 8. 五类预算

```text
step budget
wall-clock deadline
token budget
money budget
tool/concurrency budget
```

预算耗尽先是一个持久化 control fact：立即禁止创建新工作。只有在 **无 in-flight command 且无 unknown effect** 时才可直接进入 `BUDGET_EXHAUSTED`。否则先进入或保持 `IN_DOUBT/RECONCILING`；收敛后再根据真实效果进入 `BUDGET_EXHAUSTED`、`PARTIAL`、`COMPLETED` 或 `MANUAL_INTERVENTION`，不能用预算终态掩盖未知副作用。

## 前置桌面推演（45 分钟）

推演“查询订单并申请取消”，依次注入：模型截断、缺订单号、策略拒绝、等待审批、用户拒绝、审批后重启、command 提交后丢 ACK、取消与迟到回执。

通过证据：为每步写当前状态、Event、Guard、Effect 和下一状态；任何未知副作用都不能直接落到 `FAILED/CANCELLED`。

## 常见误区

- Agent Loop 就是不断问模型“下一步是什么”。
- 聊天历史代表真实环境状态。
- Streaming 文本结束就能标记 `COMPLETED`。
- 请求取消后可以立即写 `CANCELLED`。
- Checkpoint 只需保存最后一条消息。

## 章末检查

1. `CANCEL_REQUESTED`、`IN_DOUBT` 与 `CANCELLED` 有什么差异？
2. Event、Snapshot、Context Projection 分别解决什么问题？
3. 为什么 reconciliation 不违反“终态后不得行动”？
4. 模型 `incomplete` 应在什么条件下重试或终止？

## 一手资料

- [OpenAI Function calling flow](https://developers.openai.com/api/docs/guides/function-calling)
- [ReAct](https://arxiv.org/abs/2210.03629)
- [Anthropic Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [AWS Idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
