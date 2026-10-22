# Lens 09: Data Consistency and Cross-Service

## Checkpoints

- Who is the authority for state?
- Can local and remote double writes diverge?
- Transaction boundary and compensation
- Convergence under duplicate/out-of-order messages
- Reconciliation mechanism

## Signals (scan first, then read)

- begin|commit|rollback|publish|insert|update

## Severity ceiling

Non-converging inconsistency P0

## Evidence requirements

List of write points + the inconsistency window

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
