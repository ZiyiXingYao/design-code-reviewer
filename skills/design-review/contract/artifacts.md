# archify artifact contract (required layer)

This skill reviews only brainstorming-archify artifacts. When the contract does not match, **stop and raise an error**; do not "do your best" and guess — a wrong guess misaligns assertion extraction and invalidates the whole report without anyone noticing.

## 1 Fixed paths and numbering

```
specs/design/00-接口契约.md          required; `00-` is a fixed literal prefix and does not participate in module numbering
specs/design/01-架构设计.md          required; fixed 01
specs/design/02-实体与数据设计.md     required; fixed 02
specs/design/03..NN-<module>.md     required, ≥1; numbering increments contiguously from 03
specs/design/task.md                required; implementation task list
specs/design/diagrams/              recommended; missing = P3
.brainstorming-archify/state.yaml    required
.brainstorming-archify/change-lists/*.md  required
```

**Naming discipline**: `0-接口契约.md`, `接口契约.md`, `contract.md` are all defects (P2).
Module documents are "append only, never renumber": a new module is appended after the highest number; the hole left by a deleted module must be explained in that document or in the change list.

## 2 state.yaml schema (schema_version = 1)

```yaml
# This file may only be edited by scripts/task-state/change-state.mjs
schema_version: 1
state: "closed"            # explore | draft | confirm | closed
files:
  - path: "specs/design/00-接口契约.md"
    status: "confirmed"    # confirmation status of each document
reopens:
  - at: "2026-10-13T01:26:12.184Z"
    reason: "…"
    files: ["specs/design/00-接口契约.md", "…"]
change_list:
  path: ".brainstorming-archify/change-lists/20261019T095928Z-<slug>.md"
  set_at: "…"
task_md: "specs/design/task.md"
log: []                    # optional
```

**Validation rules**:
- If any of `schema_version` / `state` / `files` / `reopens` is missing → the level cannot be determined; **treat conservatively as draft** and warn.
- The file pointed to by `change_list.path` must exist and must be the latest change.
- `reopens[].files` is used for risk weighting: the same document reopened ≥3 times → examine that document section by section.

**State gate**:

| state | design skill disposition |
|---|---|
| `closed` | Baseline usable; conclusions may serve as Gate D evidence |
| `confirm` | May be compared; the report is marked "baseline not frozen", and comparison-type conclusions are for reference only |
| `draft` / `explore` | Do not refuse, but mark conclusions `reference only`; **must not be used for Gate D sign-off** (the design is still changing, so a "mismatch" found may be something the design itself is about to change) |

## 3 change-list structure

The path looks like `.brainstorming-archify/change-lists/<UTC timestamp>-<slug>.md`. It must contain four sections:

| Section | Content | Purpose |
|---|---|---|
| `## 讨论记录` | Origin and scope convergence of each discussion round | Judge the decision background |
| `## 关键决策` | Decision entries (D-nnn or bolded entries) + rationale | The **intent source** for A1 decision tracing |
| `## 文件修改台账` | File / nature of change / sections touched / status | Judge which documents are affected |
| `## 落盘授权` | Scope authorized by the user and corrections | Judge whether changes exceeded authority |

**Decision numbering**: if an entry carries a `D\d+` number, reference it directly; if it has none (common), number them in order of appearance as `D-01..` and note in the report "no explicit numbering this round; numbered by order".

## 4 Template section table

A fixed section that is missing, without "N/A + reason" written for it → P2 (craft item).

| Document | Required sections (title keywords) |
|---|---|
| `00-接口契约.md` | 总则；1 MySQL 数据表；2 Redis key 与结构；3 MQ 消息通道；4 HTTP 接口；5 gRPC 接口；6 动态库 API；7 TCP 接口；8 其他对外接口；9 跨类别共同约定；10 待定问题与风险 |
| `01-架构设计.md` | 1 背景与问题；2 目标与非目标；3 方案对比与选型；4 整体功能说明；5 功能点需求说明；6 功能模块划分；7 跨模块接口矩阵；8 核心类设计；9 代码文件树组织；10 全局功能流程；11 业务编排流程；12 运行视图；13 部署视图；14 关键决策记录；15 待定问题与风险 |
| `02-实体与数据设计.md` | 1 数据模式总览；2 领域类图；3 实体关系图；4 数据流图；5 核心实体状态机；6 数据生命周期与保留；7 关键决策记录；8 待定问题与风险 |
| `NN-模块.md` | 1 模块职责与边界；2 本模块类清单与关系；3 类详细设计；4 对外依赖契约；5 端到端业务流程；6 本模块实体状态机；7 关键决策记录；8 待定问题与风险 |

## 5 Structural feature validation (guards against silent misalignment caused by archify upgrades)

| Feature | How to validate | When it does not match |
|---|---|---|
| File numbering scheme | Regex `^0\d-` / `^(1\d|\d\d)-`; 00/01/02 fixed | Warn + list the actual file names, require a human-confirmed mapping, **stop assertion extraction** |
| Contract sections | Are the 10 sections of 00 in the table above all present | Warn (the template may have changed) |
| Module sections | Are the 8 sections of a module in the table above all present | Same as above |
| state schema | Are `schema_version/state/files/reopens` complete | Any missing → conservatively treat as draft, warn |
| change-list | Does it have a "关键决策" section | Missing → mark A1 as `skipped` and explain |

**Principle: any structural mismatch means stop and explain.** Only `docstat.mjs` output counts as evidence; judging "close enough" from impression is forbidden.

## 6 Gap disposition

| Gap | Disposition |
|---|---|
| Any of 00/01/02 | Record **P1 (incomplete artifact)**; review the remaining items as usual |
| All module documents missing | Record P1; D1/D2/D3 can only be judged from the architecture document; declare the limitation in the report |
| task.md | Record **P1 (listed as required by the plan)**; drop conclusions about "implementation-ready granularity" |
| diagrams/ | Record P3 |
| state.yaml | State gate and risk weighting are impossible; mark the whole report "baseline not frozen" and it must not be used for Gate D sign-off |
| change-lists/ | Decision tracing marked `skipped`; D12 can only be judged from the "关键决策记录" chapter inside the documents |
