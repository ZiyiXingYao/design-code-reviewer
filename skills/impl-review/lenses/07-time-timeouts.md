# Lens 07: Time and Timeouts

## Checkpoints

- Wall clock vs monotonic clock
- Timeout unit and comparison direction
- Timer drift/accumulation
- Cross-machine time comparison
- State convergence after a timeout

## Signals (scan first, then read)

- time\(|gettimeofday|system_clock|steady_clock|sleep|timeout

## Severity ceiling

Timeout that never fires P1; a hang P0

## Evidence requirements

Two time values + the comparison expression

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
