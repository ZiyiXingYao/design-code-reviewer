# Lens 20: Concurrency Model Landing

## Checkpoints

- Single writer: number of writing threads per mutable state
- Sharding by key: is the owner fixed for the same key
- Bounded queue + explicit behavior when full
- Four don'ts inside a lock (I/O/callback/allocation/taking a second lock)
- Fixed lock ordering
- Snapshot for read-mostly state
- Concurrency observability (thread name/queue depth/latency)
- Three Reactor traps: blocking in a callback, writing to an fd from another thread, destroying self inside a callback

## Signals (scan first, then read)

- lock calls
- mutex|queue|select|epoll|async|detach

## Severity ceiling

Violating CONC-1..5 is at least P1, P0 if it causes an outage; CONC-6/7 P2

## Evidence requirements

List of write points / lock intervals / interleaving; without evidence such as TSan, confidence is ≤medium and it must not stand alone as P0

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.

## Group 4: Periodic-Scan Focus

| Checkpoint | Signal | Severity |
|---|---|---|
| Scattered scanning | Multiple "sleep inside a loop" polls, each module spawning its own timer thread | P1 |
| Scan re-entrancy | The next round starts before the previous one finished (no in-flight flag) | P1 |
| Period ≥ timeout threshold | Compare period and timeout values pair by pair | P1 |
| sleep accumulation instead of a deadline | Drift accumulates after long-running operation | P2 |
| Mixed models | Callbacks + blocking sleeps + independently spawned threads coexisting in one module | P1 |

