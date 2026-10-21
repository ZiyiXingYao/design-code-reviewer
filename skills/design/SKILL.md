---
name: design
description: 评审 brainstorming-archify 产出的设计方案（00 接口契约 / 01 架构 / 02 数据 / 03+ 模块 / task.md / 时序图），判断方案是否合理、功能是否完整、产物是否合规，并在报告末尾生成交接块供 impl 技能使用。触发语：评审设计方案、这个架构合理吗、模块划分有没有问题、功能全不全、这份设计能不能开工、设计文档评审。
---

# 设计评审（design）

评审对象是 **archify 产物本身**：内容合理性 + 产物工艺合规。**完全不读代码**（唯一例外：task.md 里引用的目录名）。

本技能与 `impl` 互不调用。唯一交接物是报告末尾的**交接块**。

`<skill-root>` = 本文件所在目录。所有脚本零依赖，用 `node <skill-root>/scripts/<name>.mjs` 调用。

## 1 五条铁律

- **A1 不读代码** — 全程不打开 `src/`。一旦看代码，视角会滑向"实现是否可能"，而不是"方案是否合理"。
- **A2 反例铁律** — 每条发现必须能写成"给定 X → 错误行为 Y → 因为缺 Z"。写不出只能进附录「风险提示」，不计入 P0/P1。
- **A3 场景全覆盖** — 17 张场景卡全跑；不适用写 `不适用 + 理由`，不许跳过。
- **A4 漏项逐条** — 20 项漏项逐条回答"有/无/不适用"，不许用"整体考虑较全面"代替。
- **A5 不评写作** — 只评维度合格性、断言真实性、决策质量。写作偏好归 P3，不占 P0–P2 名额。
- **A6 对抗铁律** — 所有 P0/P1 必须过红-蓝-裁三小轮，由**独立子代理**执行（硬隔离），禁止单 agent 分轮模拟，禁止折中裁定。

## 2 前置校验（A0 内执行，不做完不许开跑）

```
node <skill-root>/scripts/docstat.mjs <projectRoot> [--json]
```

它输出：文档清单/行数/reopen 分布与风险等级、固定章节缺失、编号跳号、state 校验、D14/D15 信号。

判定规则见 `contract/artifacts.md`：

| 情况 | 处置 |
|---|---|
| 缺 00/01/02 任一 | 记 P1（产物不完整），其余照审 |
| `state.yaml` 缺失或 schema 不全 | 全报告标「基准未冻结」，**不得用于 Gate D 放行** |
| `state=confirm` | 可对照，结论标「基准未冻结」 |
| `state=draft/explore` | 不拒绝，结论标 `参考`，不得放行 |
| 结构特征不匹配（编号体系/章节/change-list） | **停下来报错并列出实际结构**，不许猜映射 |

若宿主**不具备子代理分派能力**，直接拒绝运行并说明原因——不退回单 agent 模拟。

## 3 流程 A0–A7

| 步 | 动作 | 产物 | 退出条件 |
|---|---|---|---|
| **A0 基线 + 契约校验** | docstat + state 门禁 + 风险分级 | 基线表 | 契约校验有结论；缺失已登记 |
| **A0.5 批计划 + 材料路由** | 定档；把检查项切成批；给每组材料清单 | `plan.json` | 批次数与单元固定，落盘后不许改 |
| **A1 提取决策** | 读 `change-lists/*.md` 的「关键决策」，逐条标是否落到文档 | 决策追溯表 | 每条 D-nnn 有归属 |
| **A2 维度评审** | 15 维度逐个过（`dimensions.md`） | 维度评分表 | 15 行全有结论 |
| **A3 功能完善度** | 3–8 个核心功能点 × 20 漏项，两级筛（`completeness.md`） | 漏项覆盖矩阵 | 每格填满 |
| **A4 场景推演** | 17 张卡逐个推演（`scenarios.md`） | 场景结论表 | 17 行全有结论 |
| **A4.5 去重合并** | 同位置同机制合并、同机制跨位置归并 | 唯一发现集 | 无重复条目（**必须在对抗之前**） |
| **A5a 红队** | 按弹药库对全部 P0/P1 候选发指控 | `06-accusations.json` | 每条含位置+机制+后果；有 coverage_note |
| **A5b 蓝队** | 逐条辩护或承认 | `07-defense.json` | 每条有结论；无效辩护视为承认 |
| **A5c 裁判** | 三态裁断，禁止折中 | `08-verdict.json` | 只有 upheld/dismissed/unresolved |
| **A6 定级成文** | 按裁断定级 → `REPORT.md`（11 节 + 交接块） | 报告 | gate 通过 |
| **A7 收口** | `SUMMARY.md` + gate + 冻结 | 2 页说明书 | 收口六项全过 |

**风险加权**：reopen ≥3 的文档逐节细查；1–2 次抽查；0 次只看维度。

## 4 批计划与并行（写死，不许中途改）

**两层分工**：扫描层按检查方面分 7 组**并行**（为了深）；对抗层按角色 3 个**串行**（为了准）。

| 组 | 注意力模式 | 读什么 | 负责维度 |
|---|---|---|---|
| S1 | 清单与签名 | 接口契约、模块清单、类清单、文件树 | D1/D2/D3/D15 |
| S2 | 状态转移与一致性 | 状态机、数据模型、事务章节 | D5/D6/D7 |
| S3 | 时序、交错、失败路径 | 并发模型、错误处理、资源生命周期 | D8/D14 |
| S4 | 极值与量级 | 阈值、单位、容量假设 | D4/D9 |
| S5 | 攻击者视角 | 信任边界、解析入口、鉴权点 | D11 |
| S6 | 横向质量属性 | 指标、日志、测试、决策记录 | D10/D12/D13 |
| S7 | 组间组合缺陷 | **只读前六组发现**，不读原始文档 | 跨维度矛盾 |

- 每组一个子代理；组内按"检查单元"再分批：维度一批一个、漏项按功能点（一批 20 格）、场景卡 6 张/批。
- **批量上限**：单批发现 ≤15 条；单批格数 ≤25。超过必须再切。
- S7 必须存在，否则组合型缺陷必然漏。
- 材料路由：每组只读自己清单内的章节；跨文档场景（F4 网络分区、O1 滚动升级）从**共享池**取用（全局流程、部署运维、跨服务调用、错误码总表），并在 `coverage_note` 声明读了池中哪份。
- 波次并发上限 4；批次计划开跑前写进 `plan.json`，之后只读。

## 5 状态与落盘（唯一入口）

```
node <skill-root>/scripts/state.mjs init <reviewDir> --type design --plan <plan.json>
node <skill-root>/scripts/state.mjs recover <reviewDir>
node <skill-root>/scripts/state.mjs batch <reviewDir> --payload <b01.json> --agent sub-a01 --ms 142000
node <skill-root>/scripts/state.mjs heartbeat <reviewDir> --id b07 --beat 3
node <skill-root>/scripts/state.mjs step <reviewDir> --id A2 --status running --done 7 --total 15
node <skill-root>/scripts/state.mjs agent <reviewDir> --role scout-s1 --agent-id sub-a01 --findings 4 --coverage-note "…"
node <skill-root>/scripts/state.mjs stats <reviewDir> --accusations 27 --upheld 12 --dismissed 9 --unresolved 6 --valid-defense 8
node <skill-root>/scripts/state.mjs transition <reviewDir> reported --reason "A6 完成"
node <skill-root>/scripts/gate.mjs <reviewDir>
```

- **权威顺序**：`batches/*.json` > `progress.log` > `state.yaml`。state 只是汇总缓存，损坏可重建。
- 批写入是 `tmp → fsync → rename`；不要手写 `batches/`，一律走 `state.mjs batch`。
- 中断后：`recover` 会清理 `*.tmp`、丢弃"有日志无产物"的批、列出待跑批。
- **gate 不通过不许出报告**；此时报告只能标 `DRAFT`。

## 6 目录

```
specs/audit/<YYYY-MM-DD>-design/
├── plan.json            # 批次计划（开跑前写死）
├── state.yaml           # 只由 state.mjs 写
├── progress.log         # JSONL，每批一行
├── batches/b01.json …   # 内容权威
├── 00-baseline.md … 05-findings.md
├── 06-accusations.json / 07-defense.json / 08-verdict.json
├── gate-result.md
├── REPORT.md            # 11 节 + 交接块
└── SUMMARY.md           # ≤2 页
```

报告是聚合物：每节都能追溯到批产物；不要自由发挥。

## 7 判据索引

| 文件 | 内容 | 何时读 |
|---|---|---|
| `contract/artifacts.md` | 产物契约、state schema、模板章节、结构校验 | A0 |
| `contract/craft-checklist.md` | 工艺合规 8 项 | A0/A4 |
| `dimensions.md` | 15 维度（含 D14 三层判定、D15 信号、级别上限） | A2 |
| `completeness.md` | 20 漏项 + 两级筛 | A3 |
| `scenarios.md` | 17 张场景卡 | A4 |
| `findings.md` | 反例构造、P0–P3、取证格式、去重、排序 | A4.5/A6 |
| `report.md` | 11 节模板 + 交接块 + Gate D 条件 | A6 |
| `adversarial/*.md` | 子代理任务书（orchestrator/scout/red/blue/judge/meta） | A5 |
| `profiles/` | 语言/行业特化（只增不改，见 profiles/README.md） | 按需 |

## 8 对抗（硬要求）

- 红队只读设计文档 + 弹药库；蓝队只读结构化指控条目 + 文档；裁判只读指控与辩护 JSON（**禁读原始文档**）。
- 举证责任：红队给位置+机制+后果；蓝队必须引位置，"上游应该校验了"= 无效辩护 = 默认承认。
- 裁断只有三态；`部分成立`/`有一定意思` 之类一律非法。
- 四指标落盘并写进报告：成立率 30–60%、有效辩护率 ≥50%、升级率 ≤30%、未决率 ≤10%。
- 子代理连续 2 次格式不合格 → 记 `failed` → gate 拦截 → 不出报告（**主 agent 不许顶上**）。

## 9 档位

| 档位 | 扫描组 | 检查项 | 对抗 | 时长 |
|---|---|---|---|---|
| 快速 | S3+S5 | D6/D8/D14 | 不做 | 5–8 分钟 |
| 标准（默认） | 全 7 组 | 15 维 + 20 漏项 + 17 卡 | 仅 P0/P1 候选 | 25–30 分钟（估算） |
| 深度 | 全 7 组 + 按模块切片 | 全量 + 工具证据 | 全量 + 升级轮 | 1–2 小时 |

档位在 A0.5 定档写入 `plan.json`，运行中不许升降档。快速档跳过的项必须记 `skipped + reason`。

## 10 边界

- 不评代码、不判实现难度、不改文档。
- "实现起来很麻烦" → 记可行性风险进附录，不记缺陷。
- 明确不做：业务价值判断、需求合理性判断、合规签字。
- 设计评审不保证抓全缺陷，保证的是**漏了什么你能看见**（覆盖矩阵、N/A 理由、本次没看什么）。
