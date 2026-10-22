---
name: impl-review
description: 评审代码实现是否兑现了 brainstorming-archify 的设计，并做通用正确性/安全评审（20 镜头 + DR-1~8 漂移分类 + 五类对照）。有设计则对照，无设计降为 L0 仅代码评审但跑满 19 镜头。触发语：评审代码、实现符合设计吗、合并前检查、review 一下、这个 MR 有没有问题。
---

# 实现评审（impl）

对象是**代码**；设计文档是基准。**不评架构合理性**（那是 `design-review` 的事），除非违反设计明文约束。

`<skill-root>` = 本文件所在目录。

## 1 铁律

- **B0 基准** — 开跑前判定 L0/L1/L2 并写进报告第 0 节。设计缺失**不阻断**评审，只是降 L0；**L0 绝不许标成 L1/L2**，也不得声称"实现符合设计"。
- **B1 只读** — 不改任何文件；修复建议落 `task.md`。
- **B2 范围** — 范围由 `git diff <base>...HEAD` 唯一确定；范围外文件只作上下文（调用点失效除外，标 `cross-file`）。
- **B3 体检先行** — 子模块未检出时其实现全落 missing，是**假阴性**，不得计入缺陷。
- **B4 断言** — 每条发现给：文档位置 + 代码位置（file:line）+ 断言原文或触发条件。
- **B5 三态** — `found / missing / unverifiable`；missing 必须归为「真缺失 / 改名未回写 / 表达差异」。
- **B6 承诺** — `task.md` 的 `[x]` 必须验证；假勾选 = P0。
- **B7 不评架构** — 不评模块划分与技术选型。
- **B8 对抗** — 所有 P0/P1 必须过红-蓝-裁，三轮上下文隔离；"上游应该校验了"= 无效辩护。

## 2 流程 B0–B10

| 步 | 动作 | 产出 | 退出条件 |
|---|---|---|---|
| **B0 体检 + 基准** | `preflight.mjs`：子模块、基线 sha、L0/L1/L2 | `preflight.json` | 等级已判定；子模块问题已声明 |
| **B1 锁范围** | `delta`：`git diff from..to --stat`；`full`：整仓代码（排除 vendor/build/third_party）按设计模块切片 | 范围清单 | 范围固定 |
| **B1.5 批计划 + 材料路由** | 镜头按批切分 + 每组材料清单 | `plan.json` | 批次数固定 |
| **B2 锁定设计基准** | `full`：全部 `specs/design`；`delta`：`related-design.mjs` 命中的设计章节 | 基准清单 | 基准就位 |
| **B3 抽断言** | `claims.mjs` | `claims.json` | 断言数确定 |
| **B4 机械核对** | 全仓核符号 + 三态归类 | `claims-verify.md` | 三态齐备 |
| **B5 逐镜头扫描** | `smells.mjs` 出信号 → 20 镜头深读 | 原始发现 | 20 镜头全有结论 |
| **B5.5 五类对照** | 结构/行为/需求/约束/验收逐类落到批与报告 §1 | 覆盖表 | 五类均有结论 |
| **B6 承诺核验** | task.md 四段 + 负向约束 diff | 承诺核对表 | 每条 `[x]` 有结论 |
| **B6.5 去重合并** | 同位置同机制合并；同机制跨位置归并 | 唯一发现集 | 必须在对抗之前 |
| **B7a/b/c 红-蓝-裁** | 子代理执行 | 06/07/08.json | 无折中结论 |
| **B8 定级成文** | 11 节报告；§7 的 P0/P1 逐条四段式 | `REPORT.md` | gate G20 通过 |
| **B9 收口 + 交付** | `SUMMARY.md` + gate，再把 REPORT/SUMMARY 交付到 `specs/audit/<id>/` | 2 页说明书 + 交付目录 2 件 | gate 通过；交付目录 2 件与工作副本一致 |
| **B10 人工评审 + task.md** | 把**已交付的成品**交人评审；批准后生成修复任务清单并关闭 | `task.md` | `approve` 成功，状态 `closed` |

## 3 基准等级

| 等级 | 条件 | 门禁效力 |
|---|---|---|
| **L2** | 设计齐全 + `state=closed` | 可作放行依据 |
| **L1** | 设计齐全但未冻结（state≠closed） | 可作门禁，注明基准未冻结 |
| **L0** | 无设计 / draft·explore / 仅部分文档 / 只改代码 | **不作放行依据** |

- L0 是完整评审：镜头 1–20 全跑；**镜头 0 跳过并标注**（不许用代码反推需求）。
- 用户可传 `--require-design`：产物不全时 `preflight.mjs` 拒绝运行并写 `preflight-failed.md`。
- 设计基准只来自 `specs/design/` 与 archify `state.yaml`：**不读、不继承** design-review 的任何结论或交接块。

## 4 五类对照（缺任一类都不算"对照过设计"）

**执行绑定**：结构/行为对照在 B5 镜头扫描前由 S1/S2 组完成；需求/约束/验收在 B6 承诺核验完成；五类结果写入报告 §1 覆盖表。

| # | 类型 | 设计侧来源 | 代码侧核对 | 对不上算 |
|---|---|---|---|---|
| 1 | 结构 | 契约清单表、类清单、文件树 | schema、类定义、目录 | DR-1（代码有文档无只记 DR-6 提示） |
| 2 | 行为 | 流程章节、状态机、时序图 | 分支、状态枚举、调用链 | DR-3 |
| 3 | 需求 | task.md `[实现的功能]` | 代码改动位置 | P1 |
| 4 | 约束 | task.md `[实现的约束]`、D-nnn | diff 检查被禁改动 | **P0** |
| 5 | 验收 | task.md `[验收标准]` | `test/` 对应用例 | **P0（假勾选）** |

## 5 20 镜头

| Pass | 镜头 |
|---|---|
| A 功能 | 00 需求–实现映射 |
| B 正确性 | 01 生命周期 / 02 并发 / 03 资源 / 04 错误 / 05 状态机 / 06 边界 / 07 时间 / 08 契约序列化 / 09 一致性 |
| C 安全 | 10 信任边界 / 11 身份越权 / 12 内存安全 / 13 不可信解析 / 14 机密依赖 / 15 拒绝服务 |
| D 工程性 | 16 性能 / 17 可观测 / 18 测试 / 19 抽象与模式 / 20 并发落地 |

**镜头 19/20 信号驱动**：先跑 `smells.mjs`，只对命中位置深读；没有信号就不报。
- 镜头 19 的模式类发现**封顶 P2**；"缺统一抽象已在多处复制同一缺陷"可 P1。
- 镜头 20 违反 CONC-1..5 最低 P1、致故障可 P0；CONC-6/7 为 P2。
- 并发结论拿不出 TSan/Helgrind 等证据时置信度 ≤medium，不得单独作 P0。

判据细节见 `lenses/`（按需加载）。

## 6 漂移分类

DR-1 无实现 / DR-2 改名未回写 / DR-3 行为不符 / DR-4 残留 / DR-5 内部矛盾 / DR-6 设计缺口（只记提示，不计缺陷）/ DR-7 模板不合规 / DR-8 承诺未兑现。
级别与判据见 `drift.md`。**DR-8 = P0**。

## 7 状态与落盘

```
# 先开一轮，拿到 reviewDir（<projectRoot>/.design-code-reviewer/<YYYY-MM-DD>-impl/）
node <skill-root>/scripts/state.mjs init <projectRoot> --type impl --plan <plan.json> [--mode delta --from <rev> --to <rev>|--mode full] [--bench L2] [--id <id>]

node <skill-root>/scripts/preflight.mjs <projectRoot> [--require-design] --out <reviewDir>
node <skill-root>/scripts/related-design.mjs <projectRoot> --from <rev> --to <rev> --out <reviewDir>   # 仅 delta
node <skill-root>/scripts/claims.mjs <projectRoot> --out <reviewDir>/claims.json [--design-scope <reviewDir>/design-scope.json]
node <skill-root>/scripts/smells.mjs <projectRoot> --json --out <reviewDir>/smells.json
node <skill-root>/scripts/state.mjs batch <reviewDir> --payload <b01.json> --agent sub-a01
node <skill-root>/scripts/state.mjs partial <reviewDir> --batch b08 --payload <part.json>
node <skill-root>/scripts/gate.mjs <reviewDir>
node <skill-root>/scripts/state.mjs transition <reviewDir> reported --reason "B9 完成"   # 自动交付 REPORT/SUMMARY 到 specs/audit/<id>/
node <skill-root>/scripts/state.mjs deliver <reviewDir>        # 报告修订后重新交付，供人工评审
node <skill-root>/scripts/state.mjs approve <reviewDir> --reviewer "<姓名>" [--note "…"] [--include-p2]
node <skill-root>/scripts/ledger.mjs <projectRoot> sync <reviewDir>     # approve 会自动执行

# 中断恢复
node <skill-root>/scripts/resume.mjs <projectRoot> --list
node <skill-root>/scripts/resume.mjs <projectRoot> [--id <id>] [--json]
```

权威顺序：`batches/*.json` > `progress.log` > `state.yaml`。批写入走 `tmp→fsync→rename`。
gate 不通过不许出报告（只能标 `DRAFT`），也不许 approve。进入 `reported` 即自动交付 REPORT/SUMMARY，人工评审的对象是交付目录里的成品；批准后 `closed`，工作目录只读。
请人评审时必须报出交付目录路径、已落地文件清单，并说明 `task.md` 待批准后生成。

覆盖下限：impl 标准档 20 镜头（quick 5）；低于下限时 gate 拒绝，除非显式豁免。跨次账本在 `.design-code-reviewer/ledger.yaml`。
两种模式：`delta`（默认）审 `--from..--to` 的代码变更，并对照变更涉及的设计章节；`full` 审整仓代码、对照全部设计文档。
G20 报告自包含：P0/P1 每条须有独立小节且含「在哪 / 什么问题 / 怎么改」，位置必须是代码 `file:line` 并给设计对照；`05-findings.json` 是证据库，不能替报告正文。
G24 性能与平衡：报告必须有「性能与容量」小节（性能结论 / 容量与上限 / 时延与热点 / 平衡结论）。镜头 16 的性能发现必须带量级或复杂度，优化建议必须写代价；**无量化依据的优化不算缺陷（最多 P3 提示）**，不得为性能牺牲可读性或引入无必要的并发/池化。

中间产物在 `.design-code-reviewer/<YYYY-MM-DD>-impl/`；成品放 `specs/audit/<YYYY-MM-DD>-impl/`：`reported` 时先就位 `REPORT.md`、`SUMMARY.md`，`task.md` 由人工批准后按 P0/P1 生成，依赖排序、四段式提示词。

## 7.5 子代理前置

若宿主**不具备子代理分派能力**，直接拒绝运行并说明原因——不退回单 agent 模拟。

## 8 对抗

与 `design-review` 同一套机制（`adversarial/orchestrator.md`）：扫描层按镜头组并行（7 组：S1 结构 / S2 状态 / S3 执行 / S4 边界 / S5 安全 / S6 工程 / S7 横切），对抗层 red→blue→judge 串行，只对 P0/P1。
红队弹药：20 镜头触发条件、信任边界表、恶意输入、并发交错序列、负向约束检查。
所有 P0/P1 需在 `08-verdict.json` 有裁断；折中结论 → gate 拒绝。

## 9 档位

| 档位 | 适用 | 镜头 | 对抗 | 时长 |
|---|---|---|---|---|
| 快速 | commit 前自查、hotfix | 1/2/4/6/10 | 不做 | 5–8 分钟 |
| 标准（默认） | 合并 MR 前 | 全 20 + 跑一次 lint/test 作证据 | 仅 P0/P1 | 25–30 分钟（估算） |
| 深度 | 发版前、并发/协议改动 | 全量 + TSan/静态分析 | 全量 + 升级轮 | 1–2 小时 |

快速档不产出 L1/L2 结论，最多标 `L0（快速档）`；跳过项必须记 `skipped + reason`。档位在 B1.5 写进 `plan.json`，运行中不许改。

## 10 边界

- 不评架构合理性、技术选型（Gate D 的事）。
- L0 通过 ≠ 功能实现了需求——它只代表代码内部自洽、没查出这类缺陷。
- **设计未覆盖不算错**：代码里有、设计文档没写的实现，记「设计缺口」提示（报告 §5），不计 P0–P2、不进对抗、不进 task.md。只有"文档写了、代码没做"（DR-1）才算缺陷。
- 不保证抓全缺陷；保证的是漏了什么你能看见（覆盖矩阵、未核对项）。
