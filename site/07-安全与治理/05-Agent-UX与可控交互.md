# 05 · Agent UX 与可控交互

## 学习目标

- 把用户控制设计成 Runtime 协议，不是表面上的一个“停止”按钮。
- 让用户看到目标、进度、证据、待决策项和副作用边界。
- 在不暴露原始 Chain-of-Thought 的前提下支持理解、纠错和追责。

## 1. 稳定的用户心智模型

产品不应只显示一个转圈。一个 Run 至少对外暴露：

```text
goal          当前要完成什么
status        正在运行、等待输入/审批、取消中、核对中或已终止
current       正在执行的可理解步骤
evidence      已找到的来源、工件和尚未确认之处
next          下一步及其预计效果
waiting_for   需要用户/外部系统提供的具体信息
budget        时间、费用或步数的明显限制
```

状态文案必须对应真实状态机；不能在后台仍可能提交动作时显示“已取消”。

## 2. 用户可用的控制原语

| 控制                | 语义                                |
| ----------------- | --------------------------------- |
| Stop/Cancel       | 停止创建新工作，传播取消；不承诺回滚已提交效果           |
| Steer             | 修改未执行的目标/约束；不静默改写已审批提案            |
| Edit & Retry      | 保留原 attempt 证据，用新输入创建新 attempt    |
| Fork              | 从已知 snapshot 创建可追溯分支，不共享未审批副作用    |
| Resume            | 从持久状态恢复；重新校验过期审批、权限、新鲜度和 deadline |
| Retry failed step | 仅对明确可重试且副作用安全的步骤提供                |

用户控制要进入 event log，有 actor、时间、目标版本和对应状态转移。

## 3. Preview 先于 Commit

高风险行动应以渐进展示：

```text
draft → preview/diff → policy result → specific approval → commit → receipt
```

Preview 需显示对象、精确参数、对外披露、费用、可逆性、前置版本和过期时间。审批后任一关键字段改变都必须重新确认。

## 4. 信任必须被校准

- 把引用、权威来源和模型推断分开。
- 展示缺失证据、冲突来源、过期数据和被权限截断的检索范围。
- 不用一个伪精确“信心分”取代任务定义、实验和证据。
- 对不可恢复或高影响决策，明确告知用户“Agent 不能确认什么”。

不展示原始 Chain-of-Thought。展示可验证的目标、计划摘要、工具动作、来源、状态转移、决策理由摘要和真实 outcome。

## 5. 失败、后台任务与恢复

- 失败要区分“没有执行”“已部分执行”“结果不明”。
- `IN_DOUBT/RECONCILING` 时不得把“重试”作为默认主按钮，先查询 receipt 和权威业务状态。
- 后台 Run 需有持久的任务 ID、可恢复入口、最后心跳/事件和明确所有者。
- 终态必须说明用户下一步：继续、编辑后重试、补偿、联系人工或无需动作。

## 纸面微实验（45 分钟）

画一个研究 Agent 的五个界面：运行中、等待补充、等待审批、取消后核对中、部分完成。每个界面标注真实 Runtime 状态、允许控制、不可误导的文案和必须保留的证据。任一 UI 状态无法映射到状态机，即不通过。

## 常见误区

- 流式文字一直输出就等于进度可见。
- 点击 Cancel 后可以立即宣布所有副作用已停止。
- 显示 Chain-of-Thought 是最好的可解释性。
- 用户批准了目标就等于批准后续任意工具参数。
- 每个工具调用都弹窗最安全。

## 章末检查

1. 为什么 `Cancel requested` 不能立即显示为 `Cancelled`？
2. Preview 和 Approval 应绑定哪些真实执行字段？
3. 不暴露原始 Chain-of-Thought 时，哪些证据仍足以支持调试和责任判定？

## 一手资料

- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)
- [People + AI Guidebook](https://pair.withgoogle.com/guidebook/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
