# Lens 02: Concurrency and Shared State

## Checkpoints

- Is there only one writing thread for the same mutable state?
- Are reads and writes synchronized (lock/atomic/message)?
- Lock granularity and hold time
- Are callbacks invoked while holding a lock?
- Is there a check-then-act race?

## Signals (scan first, then read)

- lock_guard|mutex|atomic|volatile|thread
- Counter increments, cache updates

## Severity ceiling

Data race can be P0; unsynchronized write = P1

## Evidence requirements

The concrete interleaving of the two threads

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
