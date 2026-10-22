# Lens 03: Resources and Handles

## Checkpoints

- Does every fd/socket/connection/thread/timer have a release path?
- Are resources released on error paths?
- Are upper bounds explicit?
- Is there any cache that only grows?

## Signals (scan first, then read)

- open|socket|pthread_create|timer|CreateFile
- Paths lacking the matching close/join

## Severity ceiling

Leak can be P1; under long-running operation P0

## Evidence requirements

Resource type + acquisition point + missing release point

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
