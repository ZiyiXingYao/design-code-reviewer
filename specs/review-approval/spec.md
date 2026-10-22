# review-approval

## Purpose

The review-approval capability documents the published behavior for users and maintainers.

## Requirements

### Requirement: Reports are delivered before human review

The system SHALL copy `REPORT.md` and `SUMMARY.md` into `specs/audit/<review-id>/` when entering `reported`, so that human review targets the finished artifacts in the delivery directory; a report that exists only in the working directory does not count as delivered.

#### Scenario: automatic delivery on entering reported

- **WHEN** `state.mjs transition <reviewDir> reported` runs and both REPORT/SUMMARY are already written
- **THEN** both artifacts appear in the delivery directory and `state.report` records dir / files / delivered_at
- **AND** no task.md is generated and the state is reported

#### Scenario: missing artifacts

- **WHEN** REPORT.md or SUMMARY.md is missing or empty
- **THEN** the transition to reported is rejected, the state is unchanged, and no empty delivery directory is created

#### Scenario: re-delivery after the report is revised

- **WHEN** human review raises questions and the report is revised, then `state.mjs deliver <reviewDir>` runs
- **THEN** both artifacts in the delivery directory are overwritten with the latest working copies and the state stays reported

#### Scenario: delivery lags behind the working copy

- **WHEN** at closed the REPORT/SUMMARY/task.md in the delivery directory differ from the working copies
- **THEN** gate G14 rejects

### Requirement: Fix tasks are generated only after human approval

The system SHALL stay in reported after the report is produced; only an explicit approve command carrying a reviewer generates task.md, re-verifies the three delivered artifacts, and sets closed.

#### Scenario: missing reviewer

- **WHEN** approve runs without a reviewer
- **THEN** the command refuses to run and the state is unchanged

#### Scenario: task generation

- **WHEN** the gate passes and a reviewer is supplied
- **THEN** task.md is generated in the delivery directory, ordered shared-first and then P0/P1, each task carrying its dependencies and a four-part AI prompt
- **AND** REPORT, SUMMARY and task.md are rewritten in place from the working copies before the state becomes closed

### Requirement: Dependency validation

The system SHALL ensure every dependency in task.md points only to an earlier task, that tasks touching the same file have an explicit order, and that generation is rejected when dependencies form a cycle.

#### Scenario: dependency cycle

- **WHEN** two tasks depend on each other
- **THEN** generation fails and prints the concrete cycle path
- **AND** no task.md is produced and the state stays reported
