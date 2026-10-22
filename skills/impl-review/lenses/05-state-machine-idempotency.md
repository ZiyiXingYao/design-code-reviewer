# Lens 05: State Machine and Idempotency

## Checkpoints

- Is the state enum closed?
- Are illegal transitions rejected?
- Are duplicate messages/requests idempotent?
- Can a terminal state be entered again?
- Is state self-consistent after a crash?

## Signals (scan first, then read)

- state|status|enum|switch
- update.*state|set.*status

## Severity ceiling

Illegal transition causing a wrong state P0/P1

## Evidence requirements

Trigger condition + the erroneous state sequence

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
