# review-modes

## Purpose

Defines the two review modes (full / delta) of design-review and impl-review, and the independence boundary between them.

## Requirements

### Requirement: The mode must be declared before the run starts

The system SHALL write `mode` into `state.yaml` and `plan.json` at `init`; design defaults to `full` and impl to `delta`. `delta` must supply both `from` and `to`.

#### Scenario: delta without a range

- **WHEN** `init --mode delta` is run without `--from`
- **THEN** the command refuses to run and no working directory is created

#### Scenario: declaration in the report

- **WHEN** the report lacks the "评审模式：全量 / 增量 `from..to`" declaration
- **THEN** gate G21 rejects

#### Scenario: state and plan disagree

- **WHEN** `state.mode`/`state.range` disagree with `plan.json`
- **THEN** gate G22 rejects

### Requirement: Full design review reads only the current documents

The system SHALL review all current content of `specs/design/` in the working tree in full mode, **never read git commit history**, and the report must not use a commit as its baseline.

#### Scenario: full scope

- **WHEN** `mode=full`
- **THEN** scope = `specs/design/*.md` + `diagrams/`; the report states "评审模式：全量（工作区当前版本）"
- **AND** all 15 dimensions / 17 scenarios / 20 completeness items run (the coverage floor is unchanged)

### Requirement: Delta design review pins a version range

The system SHALL use `git diff from..to -- specs/design` as the only scope in delta mode, reviewing the changed sections plus the sections that directly reference them or are referenced by them.

#### Scenario: scope generation

- **WHEN** `scope.mjs <root> --from A --to B --out <reviewDir>` runs
- **THEN** it produces `scope.json`: changed files, the section each change belongs to, and sections of other documents that reference these files/sections
- **AND** it exits with 3 when the range contains no design changes

#### Scenario: coverage floor

- **WHEN** `mode=delta`
- **THEN** `plan.expected` must declare the affected dimension/scenario/completeness counts (all ≥1) and `plan.scope_file` must exist
- **AND** the report must list every changed file in `scope.json` and include the "未覆盖声明" (uncovered declaration) section (gate G23)

### Requirement: Implementation review does not depend on design review results

The system SHALL determine the baseline only from `specs/design/` and the archify `state.yaml`, and **never read** reports, outstanding debts or constraints under `specs/audit/*-design/`.

#### Scenario: baseline level

- **WHEN** the design is complete and `state=closed`
- **THEN** L2
- **WHEN** the design is complete but not frozen
- **THEN** L1
- **WHEN** there is no design or the artifacts are incomplete
- **THEN** L0

#### Scenario: review conclusions are not inherited

- **WHEN** any historical design review report exists (including old handoff blocks)
- **THEN** it does not affect the level in `preflight.json` and does not enter the assertion set of `claims.json`

### Requirement: Implementation review has two modes

The system SHALL support `full` (whole-repo code vs all design documents) and `delta` (`from..to` code changes vs the matched design sections).

#### Scenario: delta mapping

- **WHEN** `related-design.mjs <root> --from A --to B --out <reviewDir>` runs
- **THEN** it produces `design-scope.json`: the matched design documents and sections, plus the code files not covered by any design document
- **AND** gate G23 requires the report to cover every matched design document and to register a "设计缺口" (design gap) whenever uncovered code exists

### Requirement: A design gap is not a defect

The system SHALL record a "code exists, design document does not" implementation as a design-gap advisory, excluded from P0–P2, from the adversarial pass, and from `task.md`; only "document exists, code does not" (DR-1) is a defect.

#### Scenario: uncovered code

- **WHEN** a changed file/symbol appears in no design document
- **THEN** report §5 bidirectional gaps registers "设计缺口（提示）" (design gap — advisory)
- **AND** no fix task is generated and the review conclusion level is unaffected
