# archify Artifacts Contract (impl perspective)

The subject of implementation review is **code**; the design is only the baseline. Missing artifacts **do not block the review**; they only lower the baseline level.

## 1 Artifact List and Purpose

| Artifact | Required | Purpose | Consequence if missing |
|---|---|---|---|
| `specs/design/00-接口契约.md` | No | assertion source (entities/fields/keys/topics/interfaces) | skip contract assertions; baseline drops to L0 |
| `specs/design/01-架构设计.md` | No | module split, interface matrix, file tree | skip structure cross-check |
| `specs/design/02-实体与数据设计.md` | No | state machine, data model | skip state machine cross-check |
| `specs/design/03+NN-*.md` | No | class list, detailed class design | skip class-level cross-check |
| `specs/design/task.md` | No | requirement/constraint/acceptance cross-checks | skip commitment verification; lens 0 cannot run |
| `specs/design/diagrams/` | No | call sequence | skip that section and note it |
| `.brainstorming-archify/state.yaml` | No | baseline level decision | conservatively judge L0 |
| `specs/audit/*-design/` | **Do not read** | design review results play no part in implementation review | no downgrade; baseline comes only from design docs and archify state |

## 2 Baseline Levels L0 / L1 / L2

| Level | Decision | Report label |
|---|---|---|
| L2 | Design complete + `state=closed` | `基准: L2（设计已冻结）` |
| L1 | Design complete but not frozen (state≠closed) | `基准: L1（设计未冻结）` |
| L0 | No design / `draft`·`explore` / only partial docs / code-only changes | `基准: L0（未做设计对照）` |

Rules:

1. L0 is a full review: all 19 lenses run (lens 0 excepted and marked).
2. **L0 must not masquerade as L1/L2**; mark it prominently on the line below the report title, and put the level in the first sentence of the SUMMARY conclusion.
3. When the user passes `--require-design`, refuse to run if artifacts are incomplete (output `preflight-failed.md`).

## 3 state.yaml and State Gating

The schema is identical to the design side (`schema_version/state/files/reopens/change_list/task_md`).

| state | impl handling |
|---|---|
| `closed` | L1/L2 allowed |
| `confirm` | may be cross-checked, mark "baseline not frozen" |
| `draft` / `explore` | **downgrade to L0**, mark "design not frozen, no cross-check performed" |

Rationale: judging "implementation does not match" against a baseline that is still moving produces a large number of false defects.

## 4 The Four Sections of task.md

Each task consists of four sections, corresponding to four groups of assertions:

| Section | Assertion nature | Verification method | Level if failed |
|---|---|---|---|
| `[实现的功能]` | positive: the code should have the corresponding change | locate whether the file and method exist | P1 |
| `[任务实现的要求]` | positive: align with the specified sections | compare against the design section constraints item by item | P1 |
| `[实现的约束]` | **negative: what must not appear must not appear** | `git diff` for forbidden changes, `grep` for forbidden dependencies | **P0** |
| `[验收标准]` | positive: the described tests should exist | find the cases in `test/` and check the assertions | **P0 (false checkmark)** |

**Detecting false checkmarks**: `[x]` + a test named in the acceptance criteria that cannot be found in `test/` → P0.
This is the most dangerous class in the whole pipeline, because it makes everyone believe the work is done.

## 5 Structural Feature Validation

| Feature | Validation method | If mismatched |
|---|---|---|
| File numbering system | 00/01/02 fixed, modules 03+ consecutive | warn + require human confirmation, stop assertion extraction |
| Contract sections | are all 10 sections of 00 present | warn |
| Module sections | are all 8 module sections present | warn |
| state schema | the four required fields | missing → conservatively L0 |

## 6 Design Baseline Sources (independent of any review result)

Implementation review reads only two kinds of input:

| Input | Purpose |
|---|---|
| `specs/design/*.md` + `diagrams/` | assertions; structure/behavior/requirement/constraint/acceptance cross-checks |
| `.brainstorming-archify/state.yaml` | baseline level (whether frozen) |

Rules:

| Case | Handling |
|---|---|
| `full` | cross-check all design docs |
| `delta` | cross-check only the docs and sections matched by `design-scope.json`; anything unmatched is recorded as a "design gap" note |
| Design review report (`specs/audit/*-design/`) | **do not read, do not inherit**: its conclusions, debts and C-n items do not constitute a baseline for implementation review |
| Design missing / not closed | handle as L0 / L1 |

Design docs cannot cover everything: an implementation that exists in code but is not written in the docs is a **design gap**, recorded as a note only, not counted as an implementation defect.
