# 提案：design / impl 两个评审技能

## 背景

`评审技能设计方案.md` 已定稿（v2，2000+ 行），但只是规格书，不是可加载的技能。本变更把它落成两个可在 CodeBuddy 中直接触发的技能，用于评审 brainstorming-archify 产出的设计文档与实现代码。

## 目标

1. 产出两个**完全独立、互不调用**的技能：`design`（设计方案评审）与 `impl`（实现评审）。
2. 判据可执行、可复现：15 维度、20 漏项、17 场景卡（design 侧）；20 镜头、DR-1~8、五类对照（impl 侧）。
3. 流程状态化：批级原子落盘（tmp→fsync→rename）、progress.log、重启恢复、`gate.mjs` 出报告前强制校验。
4. 对抗硬隔离：扫描层 7 组并行 + 红/蓝/裁三小轮，由子代理执行，无子代理能力则拒绝运行。
5. 所有脚本用 **.mjs**、零第三方依赖，`node --test` 自测。
6. 交付 GitHub 私有仓 `design-code-reviewer`（skill 名 `design` / `impl`）。

## 非目标

- 不做单 agent 分轮模拟对抗。
- 不改被审仓（/code/sim 只读，产物写本仓 `evals/`）。
- 不实现 archify 本身；只按其产物契约做校验。
- 不做写作润色，不自动改设计文档或代码。

## 仓库形态

```
design-code-reviewer/
├── README.md                  # 定位、安装、触发、档位、边界
├── install.mjs                # 安装/更新/卸载到 ~/.codebuddy/skills（--dry-run/--force）
├── package.json               # type=module, scripts.test
├── docs/design-spec.md        # 方案原文（唯一权威规格）
├── skills/design/             # 技能 A：name=design, 显示名「设计评审」
│   ├── SKILL.md               # ≤300 行：铁律、A0-A7、索引
│   ├── dimensions.md completeness.md scenarios.md findings.md report.md
│   ├── contract/              # archify 产物契约 + 工艺检查表
│   ├── profiles/              # 特化层只增不改（含约定说明）
│   ├── adversarial/           # orchestrator + scout/red/blue/judge/meta 任务书
│   └── scripts/               # docstat.mjs state.mjs gate.mjs
├── skills/impl/               # 技能 B：name=impl, 显示名「实现评审」
│   ├── SKILL.md               # ≤300 行：七铁律、B0-B9、L0/L1/L2
│   ├── lenses/00..20          # 21 个按需加载文件
│   ├── drift.md claims.md findings.md report.md
│   ├── contract/ profiles/ adversarial/
│   └── scripts/               # preflight.mjs claims.mjs smells.mjs state.mjs gate.mjs
├── tests/                     # node --test，含 fixture 与故障注入用例
└── evals/2026-10-21-sim/      # /code/sim 只读实跑产物（plan/state/batches/REPORT/SUMMARY）
```

## 关键设计取舍

| 点 | 选择 | 理由 |
|---|---|---|
| 技能名 | `design` / `impl` | 用户指定；显示名用中文，避免与市场 `code-review*` 冲突 |
| 脚本 | mjs + node 内置模块 | 用户要求；无安装依赖，`fsync` 用 `fs.openSync+fsyncSync` |
| 状态 | 批产物为权威，state 只是汇总缓存 | 崩溃可恢复；报告可由产物重建 |
| 判据加载 | SKILL.md 只放流程与索引，判据分文件 | 防"塞不下就删判据" |
| impl 基准 | L0/L1/L2 三级，缺设计降 L0 不拒绝 | 覆盖"只改代码"场景，但禁止冒充对照 |
| 验收 | /code/sim 只读实跑 | state=closed、14 文档 5806 行、有 task.md 与历史 audit |

## 验收标准

1. `node --test tests/` 全绿，且含四条硬约束用例：gate 拒绝残缺报告、恢复对账以产物为准、L0 不得出现"符合设计"、去重合并先于对抗。
2. `node install.mjs --dry-run` 能列出将安装的两个技能目录。
3. 在 /code/sim 上以标准档跑一遍 `design`：产出 `evals/2026-10-21-sim/` 下 plan.json、state.yaml、batches/*、REPORT.md、SUMMARY.md，`gate-result.md` 为通过；不写 /code/sim。
4. 报告可追溯：随机抽 5 条发现能定位到具体 batches 批号。
5. GitHub 私有仓创建成功，含安装说明与首版提交。

## 风险与应对

| 风险 | 应对 |
|---|---|
| 判据文件多，易写成空壳 | tasks.md 按"每维/每镜头必须有判据+级别上限"验收，抽查 5 条 |
| 对抗子代理不可用 | 技能显式拒绝运行（T10 语义），不降级模拟 |
| archify 结构漂移 | contract/ 校验失败即停并列出实际文件名，禁止猜测映射 |
| 实跑耗时长 | 标准档 7 组扫描 + 仅 P0/P1 对抗；批次计划预落盘 |
| 跨仓写入 | /code/sim 全程只读，产出写本仓 evals/ |
