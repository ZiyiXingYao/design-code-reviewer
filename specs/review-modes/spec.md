# review-modes

## Purpose

定义 design-review 与 impl-review 的两种评审模式（全量 / 增量），以及两者之间的独立性边界。

## Requirements

### Requirement: 模式必须在开跑前声明

系统 SHALL 在 `init` 时把 `mode` 写入 `state.yaml` 与 `plan.json`；design 默认 `full`，impl 默认 `delta`。`delta` 必须同时提供 `from` 与 `to`。

#### Scenario: 增量缺区间

- **WHEN** `init --mode delta` 未给 `--from`
- **THEN** 命令拒绝执行，不创建工作目录

#### Scenario: 报告声明

- **WHEN** 报告缺少「评审模式：全量 / 增量 `from..to`」
- **THEN** gate G21 拒绝

#### Scenario: 状态与计划不一致

- **WHEN** `state.mode`/`state.range` 与 `plan.json` 不一致
- **THEN** gate G22 拒绝

### Requirement: 设计全量评审只读当前文档

系统 SHALL 在全量模式下评审 `specs/design/` 当前工作区的全部内容，**不读取 git 提交历史**，报告不得以 commit 作为基线。

#### Scenario: 全量范围

- **WHEN** `mode=full`
- **THEN** 评审范围 = `specs/design/*.md` + `diagrams/`；报告写「评审模式：全量（工作区当前版本）」
- **AND** 15 维度 / 17 场景 / 20 漏项 全跑（覆盖下限不变）

### Requirement: 设计增量评审锁定版本区间

系统 SHALL 在增量模式下以 `git diff from..to -- specs/design` 为唯一范围，审改动章节及其直接引用/被引用章节。

#### Scenario: 生成范围

- **WHEN** 执行 `scope.mjs <root> --from A --to B --out <reviewDir>`
- **THEN** 产出 `scope.json`：变更文件、每处改动所属章节、引用这些文件/章节的其它文档章节
- **AND** 区间内无设计变更时以 3 退出

#### Scenario: 覆盖下限

- **WHEN** `mode=delta`
- **THEN** `plan.expected` 必须声明受影响的 dimension/scenario/completeness（均 ≥1）且 `plan.scope_file` 存在
- **AND** 报告必须列出 `scope.json` 的全部变更文件，并写「未覆盖声明」（gate G23）

### Requirement: 实现评审不依赖设计评审结果

系统 SHALL 只以 `specs/design/` 与 archify `state.yaml` 判定基准，**不读取** `specs/audit/*-design/` 的报告、欠账或约束。

#### Scenario: 基准等级

- **WHEN** 设计齐全且 `state=closed`
- **THEN** L2
- **WHEN** 设计齐全但未冻结
- **THEN** L1
- **WHEN** 无设计或产物不全
- **THEN** L0

#### Scenario: 不继承评审结论

- **WHEN** 存在任何历史设计评审报告（含旧交接块）
- **THEN** 不影响 `preflight.json` 的等级，也不进入 `claims.json` 的断言集

### Requirement: 实现评审双模式

系统 SHALL 支持 `full`（整仓代码 vs 全部设计文档）与 `delta`（`from..to` 代码变更 vs 命中的设计章节）。

#### Scenario: 增量映射

- **WHEN** 执行 `related-design.mjs <root> --from A --to B --out <reviewDir>`
- **THEN** 产出 `design-scope.json`：命中的设计文档与章节、未被任何设计文档覆盖的代码文件
- **AND** gate G23 要求报告涉及每份命中的设计文档，并在存在未覆盖代码时登记「设计缺口」

### Requirement: 设计缺口不构成缺陷

系统 SHALL 把「代码有、设计文档无」的实现记为设计缺口提示，不计入 P0–P2、不进入对抗、不进入 `task.md`；只有「文档有、代码无」（DR-1）才是缺陷。

#### Scenario: 未覆盖代码

- **WHEN** 代码变更的文件/符号未在任何设计文档出现
- **THEN** 报告 §5 双向缺口登记「设计缺口（提示）」
- **AND** 不生成修复任务，不影响评审结论级别
