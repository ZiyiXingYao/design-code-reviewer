# design-code-reviewer Skill Specification

## Purpose

Provide two independent, reproducible and auditable review skills for projects that produce design documents before implementation, so that coverage gaps and missed items become visible.

## Requirements

### Requirement: Design review criteria

The system SHALL review design documents against 15 design dimensions, 20 completeness items and 17 scenario cards, giving a conclusion or "not applicable + reason" for each, with every finding containing location, mechanism and counterexample.

#### Scenario: coverage is verifiable

- **WHEN** a design review finishes
- **THEN** the gate verifies full coverage of 15/20×N/17, and every P0/P1 has a red/blue/adjudication verdict
- **AND** when it does not pass, the report may only be marked DRAFT

#### Scenario: missing counterexample

- **WHEN** a finding cannot be written as "given X → wrong behavior Y → because Z is missing"
- **THEN** that finding may only go into the appendix as a risk note and does not count as P0/P1

### Requirement: Implementation review baseline

The system SHALL determine the baseline level L0/L1/L2 before an implementation review starts and write it into section 0 of the report; L0 must not claim "符合设计" (conforms to the design).

#### Scenario: degrade when there is no design

- **WHEN** the reviewed repository has no specs/design and --require-design is not passed
- **THEN** run all 19 lenses at L0 and mark "未做设计对照" (no design comparison performed) in the report and SUMMARY

#### Scenario: forced comparison

- **WHEN** the user passes --require-design and the artifacts are incomplete
- **THEN** refuse to run and output preflight-failed.md

### Requirement: The process is recoverable

The system SHALL persist atomically batch by batch (tmp → fsync → rename) and reconcile by "artifacts > logs > state" after a crash.

#### Scenario: resuming after an interruption

- **WHEN** the review is killed during a batch
- **THEN** recover cleans up tmp, discards batches with "logs but no artifacts", and continues from the next batch
- **AND** completed batches are not rerun and the final conclusion matches the uninterrupted run
