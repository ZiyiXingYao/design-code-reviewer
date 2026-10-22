# Lens 16: Performance and Hot Paths

## Checkpoints

- Does the hot path traverse everything?
- Lock contention and false sharing
- Repeated allocation/copy
- N+1 queries
- Synchronous I/O on the critical path

## Signals (scan first, then read)

- for.*:|find\(|map\[|new |malloc

## Severity ceiling

P2, unless it causes a timeout (P1)

## Balance clause (hard constraint)

- Every performance finding must carry an **order of magnitude or complexity**; if you cannot provide one → at most a P3 hint, and it must not enter P0/P1.
- Optimization proposals must state their cost: readability, implementation complexity, maintenance cost. **For equal benefit, prefer the simple implementation**.
- Do not demand caching/lock-free/pooling/batching on the grounds that it "might be faster"; complexity without quantified justification is recorded as **over-design P2**.
- Do not sacrifice readability for performance: naming, layering and error handling must not be compressed into hard-to-follow code for the sake of optimization; if that is genuinely required, the data from the four capacity questions must be provided.

## Evidence requirements

Hot path location + order-of-magnitude estimate or complexity + **optimization cost** (readability/complexity)

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
