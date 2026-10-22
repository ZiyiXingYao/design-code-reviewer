# Finding construction, grading and evidence

## 1 Counterexample iron rule

Every finding must be expressible as: **given X → the system produces wrong behavior Y → because Z is missing**.
If you cannot write it that way, it can only go into "Risk notes" (appendix), not into the defect list, and it does not count toward the P0/P1 numbers.

| Bad | Good |
|---|---|
| "The task module's concurrent processing needs consideration" | "When algorithm results for the same `subtaskSchId` arrive repeatedly, the design defines no idempotency key (09-任务模块 §5.5 only says 'backfill and advance'), so the same segment is advanced twice: `currentSegmentTask` is overwritten with the new object while the device still executes the old order" |
| "Suggest adding exception handling" | "After `delete` becomes batch (D37), partial-failure semantics are undefined: when the 3rd of 5 is missing, whether the returned `items` count as success or failure, and whether the 2 already deleted are rolled back, are both unwritten, so the implementation can only choose for itself" |
| "The state-machine design could be more complete" | "`kBound × kTaskCompleted` is not in the rule table of 09-任务模块 §6.1; at the design level the action 'reject' does not exist, so the implementation can only ignore the return value" |

## 2 Grading (design stage)

| Level | Criterion | Example |
|---|---|---|
| **P0** | Causes: wrong/lost data, non-convergent cross-service inconsistency, physical safety risk, cannot go live (a key capability is missing) | Partial failure undefined; device identity verified only from connection state |
| **P1** | Functionality does not hold in a specific but realistic scenario; a key non-functional item is missing (one of idempotency/recovery/backpressure/timeout) | Restart loses state written just before; no backpressure |
| **P2** | Blurred module boundaries, decisions without comparison, open items without an owner, suspicious dependency direction | Business layer talks to cache directly; decision has no rationale |
| **P3** | Template format, numbering, diagram conventions, wording | Numbering gaps; table missing a column |

**Level caps**: pattern/abstract-class findings are capped at P2; inconsistent concurrency model and scan period ≥ timeout are P1; concurrency-induced deadlock/starvation can be P0.

## 3 Evidence format (finding entry)

```
F-001
- Dimension/scenario: D8 / F3
- Location: 09-任务模块.md:365 (§5.5); 08-制品模块.md:120 (§4.2)   # full file name:line (section); list every file
- Module: task module (09)
- Feature point/flow: FP-6 segment path dispatch / partial-failure handling of batch delete
- Problem: what the document currently says, and what is missing (plain language; readable without the counterexample)
- Counterexample: given X → wrong behavior Y → because Z is missing
- Impact: …
- Fix: 1) … 2) … 3) …   # step by step, actionable; steps after a semicolon must not be swallowed
- Level: P1
- Verdict: upheld (A-007)   # decided by 08-verdict.json; leave empty when not adversarial
```

Fields in a batch artifact (the gate validates them):

```json
{
  "id": "F-001",
  "level": "P1",
  "title": "one sentence (report subsection title)",
  "location": "document:line (section); document:line (section)",
  "module": "task module",
  "feature": "FP-6",
  "flow": "partial-failure handling of batch delete",
  "problem": "plain-language problem statement: what is currently written, what is missing",
  "mechanism": "what mechanism is missing (may be more technical)",
  "counterexample": "given X → wrong Y → because Z is missing",
  "impact": "consequence",
  "fix": "1) … 2) … (complete fix, keep every step)",
  "suggestion": "one-sentence summary (compatibility field, may be empty)",
  "batch": "b07"
}
```

**Field discipline**:

- `problem` and `fix` are the body source for the report and task.md; they must not be omitted; `fix` uses one line per step, and writing only "suggest improving XX" is forbidden.
- `suggestion` is only a summary; downstream always prefers `fix`.
- `location` must not be abbreviated to `05:338` (missing file name); the report and task.md quote it verbatim, so an abbreviation equals being unable to locate.
- `module/feature/flow` are used by the report's "index by module" and by readers for orientation; a cross-module finding lists the primary module + related modules.

## 4 Deduplication and merging (must happen before adversarial)

| Situation | Handling | Ledger notation |
|---|---|---|
| Same location + same mechanism | Merge into one entry, take the highest level | `found jointly by b07/b12` |
| Same location + different mechanism | Keep both, cross-mark `related` | Possibly two faces of one root cause; leave it to a human |
| Different location + same mechanism | Merge into a "patterned problem" and list every location | ≥3 locations → mark **systemic problem**, raise one level (capped at P1) |
| Same location + level disagreement | Take the higher one, record both rationales | `b07 said P2, b12 said P1; P1 adopted: …` |
| Duplicate of a historical ledger entry | Do not report again; only update status | `still present (F-007)` / `fixed (F-012)` |

**Timing**: after scanning is complete and before the red team attacks. Otherwise the red team attacks the same problem repeatedly and the metrics are distorted.

## 5 Ordering: by fix order, not by level

All P0 findings come before P1 findings; within a level, order by dependency:

| Priority | Criterion | Reason |
|---|---|---|
| 1 | Other fixes depend on it | Add the state-machine transitions first, then fix the finalization logic built on them |
| 2 | Independent, small change surface | Quick wins that lower overall risk |
| 3 | Changes that ripple to many places | Needs a larger regression scope; do it later |

Every finding carries `depends_on: [F-003]`. **A finding without a dependency field must not enter the must-do list.**

## 6 Risk notes

Observations that cannot be written as counterexamples ("this description may be ambiguous", "suggest adding a diagram") may only go into the appendix "Risk notes"; they do not occupy a P0–P2 slot and do not enter the adversarial process.
