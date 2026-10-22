# review-ledger

## Purpose

The review-ledger capability documents the published behavior for users and maintainers.

## Requirements

### Requirement: Cross-run ledger

The system SHALL merge the findings of a review into `.design-code-reviewer/ledger.yaml` at human approval time, dedupe by "type + normalized title + normalized location", and report the counts of new and still-present entries.

#### Scenario: same defect with a changed line number

- **WHEN** the same defect in two reviews differs only by line number
- **THEN** the ledger keeps a single entry and updates last_seen to the most recent run
- **AND** entries absent from the current run are not automatically marked as fixed

### Requirement: Coverage floor and batch caps

The system SHALL validate the coverage floor per review type and profile, and cap a single batch at ≤15 findings, ≤25 cells and ≤14 subagents.

#### Scenario: plan waters down coverage

- **WHEN** the plan sets a dimension to 1 without an explicit exemption
- **THEN** the gate rejects the report for falling below the coverage floor

### Requirement: Resuming an incremental batch

The system SHALL let an incremental batch record the cells already filled and resume from the next cell.

#### Scenario: resuming after a crash

- **WHEN** a batch with gaps is interrupted after 3 cells are filled
- **THEN** resume reports that the batch continues from cell 4
- **AND** the partial file is deleted once the batch is finally persisted
