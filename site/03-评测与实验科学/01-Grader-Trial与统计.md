# 01 · Grader、Trial 与统计

一个 Agent 应用如果在动手实现前没有证据标准，后续每一次“优化”都只能靠印象。以贯穿后文的订单退款工作台（Workbench）为例，二十次试跑中十八次成功，并不足以回答它能否发布：失败是否集中在越权请求、同一任务的多次结果是否相关、大语言模型裁判（LLM-as-a-Judge）是否偏爱更长回答，都需要被明确建模。

因此，本部分先从评测器（Grader）、试次（Trial）与统计开始。这里建立的分析单位、证据类型和不确定性表达，会成为后续比较模型接口、工具契约、Runtime 与检索方案时共同使用的尺子。

## 学习目标

- 按质量维度选择确定性、模型或人工证据。
- 对成功率、差异和稀有违规给出不确定性范围。
- 处理 task 内多 trial 相关、成对比较和重复“看结果再停止”的偏差。
- 理解 LLM-as-a-Judge 的偏差和校准要求。

## 1. Grader 不是一条固定优先级

按维度选择参考证据：

- 客观业务效果：权威环境状态、程序断言和规则 grader。
- 权限/安全：策略不变量与资源服务端结果。
- 开放质量：人类/领域专家先定义 gold rubric，校准后的 LLM Judge 扩展规模。
- 用户价值：离线 Eval 之外还需用户研究或受控 A/B。

人工专家不是永远排在 LLM Judge 之后；在主观维度上，人类标签通常是 Judge 校准基准。

一个 Task 可以有多个 grader。任务完成、安全、证据、效率和表达质量不应压成模糊总分。

## 2. 分析单位与多 Trial

数据具有嵌套结构：

```text
task 1 ─ trial 1, 2, 3...
task 2 ─ trial 1, 2, 3...
```

同一 Task 的 trials 共享输入和难度，不能当作完全独立任务。报告：

- Task 数、每 Task trial 数和分层 slice。
- 每 Task 成功率与 suite 聚合方法。
- 模型、Prompt、工具、数据和环境版本。
- p50/p95 延迟、Token、成本及失败类型。

比较两个版本时，让它们运行相同 Tasks、相同初始环境，使用配对分析。

## 3. 成功率区间

观察到 `x/n` 成功只是估计值。二项比例可用 Wilson interval；极小样本或边界概率可用 exact/贝叶斯区间。不要在小样本或 `x=0/n`、`x=n/n` 时直接使用朴素 Wald 区间 `p̂ ± z√(p̂(1-p̂)/n)`：它会给出过度乐观、甚至退化的边界结果。工程中调用统计库，不手写近似实现。

若 `n` 次独立试验观察到 0 次违规，95% 上界近似是 `3/n`（rule of three）。因此“100 次零违规”只支持真实违规率大约低于 3%，不是风险为零；相关 trial 时这个近似还会过于乐观。

**零容忍**是发布政策：一次关键违规就阻断发布。它不是“本批次零观测，所以真实概率为零”的统计证明。

## 4. 差异、样本量与停止规则

- 先确定 primary metric、最小有意义差异（MDE）和期望 power，再估算样本量。
- 二元成对结果可考虑 McNemar test；连续/复杂分数可使用 task-level paired bootstrap。
- 同一 Task 多 trial 时，以 Task 为 cluster 重采样，避免把相关 trial 当独立样本。
- 同时检查很多指标/模型会提高偶然“显著”概率：预注册主指标、控制多重比较或把其余标为探索性。
- 不要每天偷看结果、见好就停。预先定义样本量或使用有效的 sequential testing/停止规则。
- p95/p99 需要足够独立样本和区间；几十次调用无法稳定证明极端尾延迟。

这些方法用于避免虚假确定性，不要求首次学习者推导统计证明。

## 5. pass\@k 与 pass^k

- pass\@k：k 次中至少一次成功，适合允许多候选探索。
- pass^k：k 次全部成功，反映一致性要求。

生产动作只能执行一次时，高 pass\@k 不能弥补低 pass\@1。安全不变量应直接报告 violation rate 与上界。

## 6. LLM-as-a-Judge

适合连贯性、覆盖度、语气和开放综合质量；不能未经校准地充当权限、事实或真实环境状态的唯一判定器。

- 使用单一维度和明确 rubric，给分档例子。
- 优先 pass/fail 或 pairwise，允许 `Unknown`。
- 随机交换候选顺序，检查 position bias。
- 检查 verbosity、self-preference 和风格偏差。
- 在独立人工标签上报告一致性、假阳性和假阴性。
- Judge 模型、Prompt 和 rubric 均要版本化回归。

## 7. 环境独立性

每个 trial 从清洁环境开始。共享缓存、残留文件、资源枯竭或同一随机种子会制造相关失败或虚假提升。Agent 的真实环境噪声与模型质量要分开记录。

## 前置微实验（60 分钟）

同一 Task 运行 20 次：计算成功率并用统计库给 Wilson interval；解释为什么区间仍很宽。再用 Judge 比较 A/B，交换顺序并加入更冗长但事实相同的版本，测 position/verbosity bias。

通过证据：报告 task/trial 数、区间、Judge 混淆矩阵或一致率，并明确哪些结论样本不足。

## 常见误区

- 平均 90 分代表每类任务都可靠。
- 本次零违规证明真实风险为零。
- 强模型 Judge 可以直接当真值。
- 多数投票会消除系统性错误。
- 把同一 Task 的 100 次 trial 当成 100 个独立 Tasks。
- 反复查看结果并随时停止不会影响结论。

## 本章小结

评测的核心不是得到一个漂亮总分，而是为每个质量维度选择合适证据，并诚实表达样本、相关性与不确定性。下一章将沿着同一证据标准进入[结果、轨迹与 Trace](/masterpiece-static-docs/03-评测与实验科学/02-结果-轨迹与Trace.md)，解释为什么真实结果正确仍不足以证明执行过程可靠。

## 章末检查

1. 为什么同一 Task 的多次 trial 需要 cluster-aware 分析？
2. 100 次零违规时，rule of three 给出什么数量级的上界？
3. 什么场景适合确定性 grader，什么场景需要先有人类 gold label？
4. 怎样验证 LLM Judge 没有明显顺序偏差？

## 一手资料

- [Anthropic Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [G-Eval](https://arxiv.org/abs/2303.16634)
- [NIST/SEMATECH e-Handbook of Statistical Methods](https://www.itl.nist.gov/div898/handbook/)
