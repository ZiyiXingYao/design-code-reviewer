# Lens 15: Denial of Service and Resource Exhaustion

## Checkpoints

- Unbounded queue/unlimited retry/unbounded recursion
- Per-request amplification (N×N)
- Connection/concurrency limits
- Missing timeouts causing backlog
- Disk exhaustion

## Signals (scan first, then read)

- while \(true\)|push_back|queue|retry|resize\(

## Severity ceiling

Can be P0 (avalanche)

## Evidence requirements

Amplification factor or backlog rate

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
