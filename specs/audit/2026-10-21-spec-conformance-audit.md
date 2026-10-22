# 实现与设计方案一致性终审报告

- 审计日期：2026-10-21
- 审计对象：`design-code-reviewer` 仓库（skills/design-review、skills/impl-review、scripts、tests、docs）
- 对照基准：`评审技能设计方案.md`（2141 行，v2）
- 审计方式：5 路并行只读审计 + 4 路独立复核 + 逐条证据核验（grep/read）
- 约束：本报告只读结论，不修改任何代码；本轮未执行修复

## 1 结论

| 项 | 数量 |
|---|---|
| 原终审提出 | 37 |
| 复核后成立 | 31 |
| ├ P0 | 1 |
| ├ P1 | 2 |
| ├ P2 | 18 |
| └ P3 | 10 |
| 成立但需降级 | 6 |
| 不成立 | 3 |
| 已被后续需求覆盖 | 3 |

**总体判断**：评审内容与流程主干已按方案落地（15 维度 / 20 漏项 / 17 场景卡 / 21 个镜头 / DR-1~8 / 原子落盘 / 闸门）。真正的阻断项只有 1 条：`impl-review` 的闸门缺少 0.4.0 已实现的 G15–G17，导致覆盖下限、账本与批量上限在实现侧不生效。其余为判据完整度、流程细节与可追溯性缺口。

## 2 判定口径

| 结论 | 含义 |
|---|---|
| 成立 | 方案有明确要求，实现确实缺失/部分/偏离 |
| 成立但降级 | 问题真实，但原定级过高，按实际影响下调 |
| 不成立 | 方案没有该要求、平台不支持，或实现已满足 |
| 已被后续需求覆盖 | 用户后续明确改了口径，旧要求不再作为本轮缺陷 |

严重度口径：P0 核心判据/门禁失效；P1 关键能力缺失；P2 流程或产物显著偏离；P3 细节/增强。

## 3 完整清单（37 条）

| # | 原判 | 复核结论 | 修正级别 | 问题 | 证据 |
|---|---|---|---|---|---|
| 1 | P0 | 成立 | **P0** | impl 闸门缺 G15/G16/G17（账本、覆盖下限、上限），`expected.lens` 可自报放水 | `impl-review/scripts/gate.mjs:250`；design gate 有 G15–G17：`design-review/scripts/gate.mjs:143-183` |
| 2 | P1 | 成立（改归属：实现自述不一致） | **P1** | impl 无 `approve` 子命令，但 SKILL 写了该命令 | `impl-review/SKILL.md:97`；`impl-review/scripts/state.mjs` 无 `case "approve"` |
| 3 | P1 | 成立但降级 | **P2** | Gate D 四项只写在报告模板，无“结论与缺口登记一致性”校验 | `design-review/report.md:96`；`gate.mjs:68-79` 只计数 |
| 4 | P1 | 成立但降级 | **P2** | G9 不校验重复条目；`depends_on` 已在任务生成阶段使用 | `gate.mjs:212-221`；`task-plan.mjs:134` |
| 5 | P1 | 成立但降级 | **P2** | D14 未落地 CONC-1~7 共享库与“不适用须写理由” | `dimensions.md:89-126`；仅 `profiles/README.md:35-37` 举例 |
| 6 | P1 | 成立 | **P1** | 对抗指标缺 `defended`/`valid_defense_rate`；升级率分母用总指控数 | `state.mjs:150-159`；方案 §6.7 |
| 7 | P1 | 已被后续需求覆盖 | — | T1–T17 只落 T3/T9/T14；0.4.0 已明确只做这三条 | `changes/v040-ledger-and-gates/proposal.md`（本地） |
| 8 | P1 | 不成立 | — | `docstat` 只做统计，结构停步属 SKILL 流程约束，不是脚本退出码要求 | 方案 §3.11 对 docstat 的定义 |
| 9 | P2 | 成立 | **P2** | 五类对照未绑定 B0–B10 步骤，报告 §1 无五类覆盖声明 | `impl-review/SKILL.md:54-62`；`report.md` §1 |
| 10 | P2 | 成立 | **P2** | Gate I 条件未校验 | `impl-review/report.md` Gate I 段；impl gate 无对应检查 |
| 11 | P2 | 成立 | **P2** | 镜头 20 缺定时扫描五项（散落/可重入/周期≥超时/sleep 累加/模型混用） | `lenses/20-并发模型落地.md` |
| 12 | P3 | 成立 | **P3** | 镜头 19 缺“资源获取/释放散落 ≥3 处” | `lenses/19-抽象与模式适用性.md:6-9` |
| 13 | P2 | 成立 | **P2** | 断言只抽 `.md`，不支持 `diagrams/*.sequence.json`；状态机仅按表格近似 | `impl-review/scripts/claims.mjs:43-50` |
| 14 | P2 | 成立 | **P2** | 交接块只判标题存在，`C-n` 未进断言集，欠账未解析 | `preflight.mjs:97`；`claims.mjs:52` |
| 15 | P2 | 成立 | **P2** | 子代理能力前置：design 仅一句声明，impl 无；无运行时检测 | `design-review/SKILL.md:41`；impl grep 为 0 |
| 16 | P2 | 成立 | **P2** | G10 的 `coverage_note` 与 `cross_hints` 是 OR，不是方案要求的 AND | `gate.mjs:230-233` |
| 17 | P2 | 成立但降级 | **P3** | 未生成 `08-verdict.md` 可读裁断表 | 全仓 grep 0；json 已是权威 |
| 18 | P2 | 成立 | **P2** | `state.yaml` 的 `files/reopens` 缺失被兜底为空数组，不告警 | `docstat.mjs:47,87` |
| 19 | P2 | 成立 | **P2** | change-list 的「关键决策」段与 `D-nnn` 未校验 | `docstat.mjs:88-91` |
| 20 | P2 | 成立 | **P2** | `recover`/`resume` 对账后不回写 state 与 progress.log | `state.mjs:77-79`；`resume.mjs` 无 `saveState` |
| 21 | P2 | 成立 | **P2** | `resume` 不校验 `baseline.commit` 与当前 HEAD | `resume.mjs` 只比 plan sha；方案 §7.5 |
| 22 | P2 | 成立 | **P2** | 心跳超时、单批 10 分钟超时未实现 | `state.mjs:101-104`；reconcile 无超时判定 |
| 23 | P2 | 成立 | **P2** | `progress.log` 中 sha256 未用于恢复校验 | `review-state.mjs:161` 记录；reconcile 不比对 |
| 24 | P2 | 成立但降级 | **P3** | ledger 无评审级摘要（结论、P0/P1、未决、报告路径） | `ledger.mjs:33-35` 仅 entries |
| 25 | P2 | 已被后续需求覆盖 | — | 快速档 4/6/8 与方案 §8.7 的 3 维冲突；方案 §11 又写 4 维 | 方案 1942 行 vs 2079 行；0.4 提案定 4/6/8 |
| 26 | P2 | 成立但降级 | **P3** | §13 结构性局限与 5 类不适用场景未写入用户文档 | `README.md:161-165` |
| 27 | P2 | 成立 | **P2** | preflight 子模块失败只记录，gate 不读、不拒绝 | `preflight.mjs:59-68`；impl gate 无子模块检查 |
| 28 | P2 | 成立 | **P2** | GoF 23 模式参照表未落地，镜头 19 只有 4 种信号形态 | 全仓无 patterns 文件；`lenses/19` 25 行 |
| 29 | P3 | 成立 | **P3** | `.partial.json` 缺 `partial_findings`；残留 partial 不判失败 | `state.mjs:95`；`gate.mjs:56-72` |
| 30 | P3 | 已被后续需求覆盖 | — | ledger 指纹不含 commit/reopen；0.4 已明定指纹口径 | `changes/v040-ledger-and-gates/proposal.md` |
| 31 | P3 | 成立 | **P3** | `accepted` 状态无接受人、理由、补偿措施 | `ledger.mjs:98-106` |
| 32 | P3 | 成立 | **P3** | impl 红队指控缺 `source_batches`（design 版有） | `impl-review/adversarial/red.md:32-44` |
| 33 | P3 | 成立（可延后） | **P3** | impl scout 无跨文档共享池 | `impl-review/adversarial/scout.md:14-20` |
| 34 | P3 | 成立 | **P3** | 缺 task.md 定 P2，方案要求 P1 | `design-review/contract/artifacts.md:96` |
| 35 | P3 | 不成立 | — | 平台 frontmatter 不支持 `display_name`；市场查重属发布流程 | 平台 `skills.md` 字段表 |
| 36 | P3 | 成立 | **P3** | 子代理记录缺 `started/ended/tokens` | `state.mjs:129-137` |
| 37 | P3 | 不成立 | — | 方案两处标注元审“可选”，`meta.md` 已存在 | 方案 §6.8.3 / §6.8.8 |

## 4 P0 / P1 详情

### #1 [P0] impl 闸门缺 G15–G17

- **方案要求**：覆盖下限、账本、批量与子代理上限必须由 gate 强制；0.4.0 也明确要求两个技能都具备。
- **现状**：`skills/impl-review/scripts/gate.mjs` 在 G13 之后直接汇总（第 250 行），没有 G15（账本）、G16（覆盖下限）、G17（批量/子代理上限）。`lib/plan-floor.mjs` 只有 design gate 引用。
- **后果**：impl 侧把 `plan.expected.lens` 写成 5 也能通过，账本缺失与单批超限不会被拦；`impl-review/SKILL.md:108` 的承诺与实现不符。
- **修复方向**：把 design gate 的 G15–G17 同步到 impl gate，并补一条“两份 gate 检查项一致”的回归测试。

### #2 [P1] impl 缺 `approve`

- **属性**：这不是方案差异（approve 是后续新增需求），是**实现自述与代码不一致**。
- **现状**：`impl-review/SKILL.md:97` 给出 `state.mjs approve`；`impl-review/scripts/state.mjs` 的子命令表没有 `approve`，执行会落到“未知子命令”。
- **后果**：impl 评审无法完成“人工批准 → 生成 task.md → closed → 交付三文件”的闭环。
- **修复方向**：将 design 的 approve 分支与 task-plan 一并同步到 impl，并补 CLI 用例。

### #6 [P1] 对抗指标口径错误

- **方案要求**：分别记录 `defended` 与 `valid_defense`，两者分母不同；升级率 = 升级轮指控数 / 首轮指控数（§6.7）。
- **现状**：`state.mjs` 只记录 accusations/upheld/dismissed/unresolved/valid_defense/escalated；rates 只有 uphold/unresolved/escalation，且 escalation 用 `escalated / accusations`。
- **后果**：有效辩护率无法计算，升级率被总指控数稀释，对抗质量指标失真。
- **修复方向**：增加 `defended` 字段与 `valid_defense_rate`；升级轮单独计数并以其为分母；gate G12 校验口径而非仅检查文字。

## 5 成立但需调整（6 条）

| # | 原判 → 修正 | 理由 |
|---|---|---|
| 3 | P1 → P2 | 方案 §7.6 的 gate 清单未要求机检 Gate D；四项是报告结论。真实缺口是“结论与缺口登记缺一致性校验” |
| 4 | P1 → P2 | G9 确实不查重复条目，但 `depends_on` 已在任务生成阶段被使用，影响面小于原判 |
| 5 | P1 → P2 | 七条并发规则在镜头 20 已覆盖，缺的是 CONC 共享库与 D14 的“承诺/不适用理由” |
| 17 | P2 → P3 | `08-verdict.json` 已是权威，md 只是可读渲染 |
| 24 | P2 → P3 | 账本摘要属可追溯性增强，不影响门禁 |
| 26 | P2 → P3 | 边界说明缺失不会导致评审结论错误 |

## 6 不成立（3 条）

| # | 原因 |
|---|---|
| 8 | 方案明确 `docstat` 只做统计；“结构不匹配就停”是 SKILL 流程约束，要求脚本非零退出属过度解释 |
| 35 | CodeBuddy 的 SKILL frontmatter 不支持 `display_name`；安装前市场查重仍是 P3 流程建议 |
| 37 | 元审在方案中两处标注“可选”；文件已存在，未接入不算缺陷 |

## 7 已被后续需求覆盖（3 条）

| # | 原因 |
|---|---|
| 7 | 0.4.0 提案明确只做 T3/T9/T14；T1–T17 全量属 backlog |
| 25 | 方案自身矛盾（§8.7 写 3 维、§11 写 4 维）；0.4 已定 4 维/6 卡/8 格，实现取后者 |
| 30 | 0.4 已明定账本指纹 = 类型 + 归一化标题 + 位置；加 commit/reopen 会破坏跨次归并 |

## 8 用户驱动的偏离（不计缺陷）

1. 技能名改为 `design-review` / `impl-review`
2. 产物分层：`.design-code-reviewer/<date>-<type>/` + `specs/audit/<date>-<type>/`
3. 新增人工批准 `approve` 与 `task.md`
4. 新增 `/review-resume` 与 `resume.mjs`
5. 脚本全部使用 `.mjs`（方案写 `.py`）

## 9 已确认对齐的部分

- design：15 维度、20 漏项、17 场景卡、A0–A7、Gate D 报告结构、11 节模板
- impl：镜头 0–20 共 21 个、DR-1~8、五类对照定义、L0/L1/L2 与 `--require-design`
- 状态：批级 `tmp → fsync → rename`、`progress.log`、`state.yaml`、恢复对账、closed 冻结
- 闸门：design 侧 G1–G17；impl 侧 G1–G13（缺 G15–G17，见 #1）
- 0.4.0 能力：账本、覆盖下限、partial、批量上限（design 侧已生效）
- 测试：51 条单测通过（静态复核时点）

## 10 修复顺序（基于修正后级别）

| 序 | 项 | 级别 | 依赖 |
|---|---|---|---|
| 1 | #1 impl gate 补 G15–G17 | P0 | 无 |
| 2 | #2 impl 补 approve | P1 | #1（closed 路径依赖 gate） |
| 3 | #6 指标补 defended / valid_defense_rate / 升级率分母 | P1 | 无 |
| 4 | #3/#4 报告结论与收口一致性校验 | P2 | #1 |
| 5 | #5 CONC-1~7 共享库 + D14 承诺要求 | P2 | 无 |
| 6 | #9 五类对照绑定步骤与报告声明 | P2 | 无 |
| 7 | #11 镜头 20 定时扫描专项 | P2 | 无 |
| 8 | #13 claims 支持 diagrams/状态机 | P2 | 无 |
| 9 | #14 C-n 进断言集 | P2 | #13 |
| 10 | #16 G10 改为 AND 语义 | P2 | 无 |
| 11 | #20/#21/#22/#23 恢复回写、HEAD 校验、超时、sha256 | P2 | 无 |
| 12 | #27 子模块体检进 gate | P2 | 无 |
| 13 | 其余 P2/P3 | — | 按模块排期 |

## 11 审计局限

- 静态核对为主：未重跑 T1/T2 漏检率、未做 3 次复现性实验、未跑真实工程的对抗全流程。
- 方案自身存在矛盾（快速档 3 维 vs 4 维），本报告按 0.4 提案取 4 维。
- 本节结论基于 2026-10-21 的仓库快照；后续提交可能已改变部分证据位置。
- 本报告只出结论，未修改任何代码，也未提交到 Git（按用户要求仅本地留档）。

## 12 复现命令（关键证据）

```bash
# #1 impl gate 缺 G15–G17
grep -n 'G1[567]' skills/impl-review/scripts/gate.mjs
grep -n 'G1[567]' skills/design-review/scripts/gate.mjs

# #2 impl 无 approve
grep -n 'case "approve"' skills/impl-review/scripts/state.mjs

# #6 指标口径
grep -n 'defended\|valid_defense_rate' skills/design-review/scripts/state.mjs

# #17 08-verdict.md
grep -rn '08-verdict.md' skills | wc -l

# #18/#19 docstat 契约校验
sed -n '40,95p' skills/design-review/scripts/docstat.mjs

# #20/#21/#22 恢复
grep -n 'saveState\|HEAD\|timeout' skills/design-review/scripts/resume.mjs skills/design-review/scripts/state.mjs

# #28 GoF 表
grep -rn 'GoF\|创建型\|Strategy' skills/impl-review | wc -l
```
