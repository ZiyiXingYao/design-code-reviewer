# The 20 functional gap items (criterion two)

**Usage**: pick 3–8 core feature points (not all of them — that explodes), and ask each feature point × 20 items one by one.

## Two-level screening (compress 100 cells into 30 deep-dive cells)

| Level | Action | Requirement | Coverage |
|---|---|---|---|
| **Level one: quick judgement** | Mark each cell only `有 / 无 / 不确定 / 不适用` (present / absent / unknown / N/A) | No location required; judging from section titles is allowed | All N×20 cells |
| **Level two: deep dive** | Only cells marked `absent` and `unknown` | Must give: document location, gap description, judgement (must fix / acceptable) | Usually 25–35 cells |

Level-one triage is itself an output: it gives the hard conclusion of "which of the 20 items are not covered"; the deep dive only adds evidence for the gaps.

**Pass standard**: `有` → point to the section; `无` → record the gap; `不适用` → write the reason. **Leaving a cell empty is not allowed.**

## The 20 items

| # | Gap item | How to ask | Pass standard |
|---|---|---|---|
| 1 | Idempotency / deduplication | What happens if the same request/message arrives again? | An idempotency key or a dedup mechanism is defined |
| 2 | Timeout and cancellation | If it must be cancelled mid-execution, how is it interrupted? | A cancel path + intermediate states that can exit |
| 3 | Partial failure and rollback | Item 3 of a batch operation fails — what happens to the first 2? | Partial-success semantics defined + rollback or compensation |
| 4 | Restart recovery | After a process restart, which state still exists? | A list of externalized fields + recovery order |
| 5 | Config hot reload | Does changing config require a restart? | A path for changes to take effect + activation granularity |
| 6 | Authorization | Who can trigger this operation? | Auth points + deny semantics for unauthorized access |
| 7 | Audit trail | When something goes wrong, can we find out who did it? | Operation log with subject/time/object |
| 8 | Rate limiting / backpressure | What happens when the flood arrives? | Rate-limit thresholds or a backpressure propagation mechanism |
| 9 | Data cleanup / archival | What happens when data grows for 10 years? | Expiry/archival/cleanup policy |
| 10 | Version compatibility | What happens when old and new versions coexist? | Compatibility policy for field additions and removals |
| 11 | Multi-instance deployment | Do two instances conflict? | Whether the singleton assumption is stated + distributed coordination |
| 12 | Clock dependency | Is comparing times across machines safe? | Clock-source choice + monotonicity guarantee |
| 13 | Queue backlog | What happens when consumption lags by 10 minutes? | Backlog handling policy (drop/degrade/alert) |
| 14 | Resource limits | Are queues/thread pools bounded? | Explicit limits + over-limit behavior |
| 15 | State convergence | After divergence, does it converge by itself? | Convergence mechanism (reconciliation / periodic correction) |
| 16 | Manual intervention | How do you rescue an automated flow that is stuck? | Manual exits (retry/skip/reset) |
| 17 | Observability | When something goes wrong, what do you look at? | Key metrics + key logs + trace |
| 18 | Data migration | When adding a field or changing structure, what about existing data? | Backfill plan + dual-write or canary |
| 19 | Degradation switch | Can a capability be turned off during an incident? | Switch definition + behavior after degradation |
| 20 | Error recoverability | Should this error be retried or abandoned? | Error classification + matching disposition |

## Output shape (must be a hard conclusion)

```
Feature point: task terminal-state finalization
Covered 14/20: present 1,2,4,7,11,12,13,14,15,16,17,19,20; missing 3 (partial failure), 5 (config hot reload), 8 (rate limiting), 9 (archival), 10 (version compatibility), 18 (data migration)
→ Among the gaps, 3/8/18 are judged "must fix" (finalization involves cross-service writes; undefined partial failure leads to inconsistent state)
```

Counterexample: writing "overall reasonably considered" = this item was not executed.
