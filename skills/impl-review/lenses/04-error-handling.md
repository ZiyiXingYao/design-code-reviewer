# Lens 04: Error Handling and Failure Paths

## Checkpoints

- Is every return value checked?
- Error classification: retryable vs should-abandon
- Are failures swallowed silently?
- Is there rollback/compensation?
- Exception safety of partially completed work

## Signals (scan first, then read)

- if.*!=.*0|goto|catch|log.*error|return false

## Severity ceiling

Silent failure P1; money/security related P0

## Evidence requirements

Failure scenario + consequence + missing branch

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
