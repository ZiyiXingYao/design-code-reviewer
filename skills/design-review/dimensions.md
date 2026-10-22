# The 15 design dimensions (criterion one)

Order: first judge "is it right" (D1–D13), then judge concurrency and abstraction (D14–D15).
This table is independent of language and industry; language/industry-specific checkpoints may only be appended in `profiles/`, and must not modify the level caps of this table.

**Usage**: walk dimension by dimension; each dimension must yield "pass / fail (issue list) / N/A (reason)". Leaving a row empty is not allowed.
A pass must point to a section; a fail must be expressible as a counterexample (see findings.md).

---

## D1 Requirement coverage

- **Checkpoints**: does every feature point in the list have an owning module; can every module point back to a feature point; are there orphan feature points / orphan modules.
- **Fail criteria**: a feature point has no owning module; two modules both claim the same feature with no boundary drawn; a module exists with no requirement source.
- **Typical counterexample shape**: a feature point is in the requirement list, has no place in the module breakdown, and in practice lands in some other module without being written down.

## D2 Module decomposition

- **Checkpoints**: can the responsibility be stated in one sentence; is granularity balanced; does the name equal the responsibility; is there overlap.
- **Fail criteria**: two modules' responsibilities overlap with no boundary; one module carries both cross-cutting and domain responsibilities; one module is far larger than its peers.
- **Typical counterexample shape**: two modules can both modify the same data, and the boundary is kept only in people's heads.

## D3 Dependency direction

- **Checkpoints**: does layering hold; are there cycles; does the core layer depend on infrastructure details.
- **Fail criteria**: a cycle exists; a depended-upon party depends back on upstream; a core module bypasses the unified access layer and talks to storage directly.
- **Typical counterexample shape**: a business module assembles SQL / connects to cache directly, bypassing the unified access layer.

## D4 Interface contract

- **Checkpoints**: idempotency, timeout, error semantics, batch semantics, version compatibility, field ownership.
- **Fail criteria**: a batch interface does not define partial failure; errors are only success/failure; a field is declared as owned on both sides.
- **Typical counterexample shape**: when item 3 of a batch delete fails, whether the first 2 are rolled back is undefined.

## D5 Data model

- **Checkpoints**: complete entities, primary/unique keys, state-field enumerations, soft delete, multi-tenancy, lifecycle.
- **Fail criteria**: a state field has no enumeration constraint; audit columns are missing; no expiry/archival policy.
- **Typical counterexample shape**: state is a free-form string whose values are upheld by convention; no last-modified-by or last-modified-at.

## D6 State machine

- **Checkpoints**: complete states, legal transitions, unique terminal state, timeout/cancel paths, idempotent re-entry.
- **Fail criteria**: only the main path is drawn; cancel/timeout transitions are missing; a terminal state can be entered again.
- **Typical counterexample shape**: only the three states of the happy path are designed; "cancel received while running" has no transition.

## D7 Concurrency and consistency

- **Checkpoints**: who is the authority for state; lock granularity and ordering; cross-service transactions; message duplication/reordering; eventual-consistency guarantees.
- **Fail criteria**: two services both write the same state; assumes "messages will not be duplicated"; no convergence mechanism.
- **Typical counterexample shape**: state is written both locally and to cache, and who is authoritative is undefined.

## D8 Reliability and fault tolerance

- **Checkpoints**: failure paths, retry limits and backoff, dead letters, degradation, restart recovery, single points.
- **Fail criteria**: only says retry, with no limit / no dead letter / no idempotency precondition; no degradation switch; no restart-recovery checklist.
- **Typical counterexample shape**: promises "3 retries + dead letter", but the ordering between retry and deduplication is undefined.

## D9 Capacity and performance

**The four capacity questions (each must yield a number or a derivation; missing one means fail)**

| # | Required answer | Passing shape | Fail criteria |
|---|---|---|---|
| 1 | Peak derivation | `entity count × per-entity frequency + management-plane traffic = peak msg/s`, consistent with the declared peak | Only says "supports N devices" with no derivation; or the derived value disagrees with the declared value (e.g. 500×1Hz + 500×3.33Hz = 2166 vs declared 1000) |
| 2 | Memory budget | `object count×object size + in-flight frames×frame length + Kafka/buffer ≤ target memory` | Only a "≤1GB" conclusion with no itemized breakdown; queues limit entries only, not bytes |
| 3 | Queue limits and full behavior | Entry limit + **byte limit** + policy when full (reject/drop-oldest/backpressure) + whether isolated per entity | Unbounded queue; entry-only limit; dropped frames not distinguished by device or category |
| 4 | Latency targets and hotspots | P99/P999 targets + basis for the figures (load test/estimate) + hotspot path complexity | Targets with no basis; hotspot path does a full traversal with no bound check |

- **Checkpoints**: the four questions above; additionally the scaling path (when to shard / go multi-instance, and whether the trigger thresholds are observable).
- **Level**: any of the four missing or self-contradictory = P1; if it invalidates the capacity conclusion as a whole (e.g. shard/thread counts sized against an underestimated peak) = P0.
- **Typical counterexample shape**: declares 1000 msg/s, but its own device count and frequency yield 2166; a 16×1024 queue is sized by entries, so a single 1MB frame eats 16GB.
- **Evidence**: cite the numbers and derivations in the documents; uncited means missing.

## D10 Operability

- **Checkpoints**: deployment topology, rolling upgrade (old and new coexisting), config changes, canary, rollback, metrics, alerting.
- **Fail criteria**: upgrade requires downtime; config changes require restart; no key metrics defined.
- **Typical counterexample shape**: contract compatibility during old/new coexistence is not designed.

## D11 Security and trust boundaries

- **Checkpoints**: identity (per message vs connection state), authorization, injection surface, keys, audit, fail-safe.
- **Fail criteria**: identity relies on connection state; validation failure "skips and continues"; no audit.
- **Typical counterexample shape**: only the identity at connection establishment is validated; subsequent requests are not verified.

## D12 Decision quality

- **Checkpoints**: does each key decision have alternatives, a reason for rejection, and is the risk acknowledged.
- **Fail criteria**: conclusion only, no comparison; risks unstated; decisions conflict with implementation.
- **Typical counterexample shape**: records "chose X" but not "why not Y", so problems cannot be traced back later.

## D13 Convergence of open items

- **Checkpoints**: number of open items, whether each has an owner, whether it blocks implementation, whether there is a deadline.
- **Fail criteria**: N open items with no owner; blocking and non-blocking items mixed together.
- **Typical counterexample shape**: debts are registered but nothing marks which one blocks the start, so implementation goes first.

## D14 Concurrency model and scheduling design

**Three layers declared one by one and mutually consistent**: ① I/O waiting strategy ② what threads are bound to ③ cross-thread state sharing; timer-task model; backpressure layers; scaling approach.

- **Fail criteria**: any of the three layers undeclared; the combination self-contradictory; no bounded queue; scan period ≥ business timeout.
- **Typical counterexample shape**: three waiting/scheduling mechanisms coexist with no declared boundary.

### D14.1 Three-layer test (ask layer by layer; do not ask vaguely about "the concurrency model")

The three concurrency layers are **orthogonal** and must be judged separately:

| Layer | Question | Possible answers | Fail signal |
|---|---|---|---|
| Layer 1: I/O waiting strategy | What does the thread do while waiting for data? | Blocking read / epoll readiness notification / IOCP·io_uring completion notification | Cannot say; or claims Reactor but the fd is not set non-blocking |
| Layer 2: thread binding target | What is the thread bound to? | Bound to connection (TPC) / bound to task (pool) / bound to event loop / bound to message queue | Two bindings mixed with no boundary; still TPC with thousands of connections |
| Layer 3: cross-thread state sharing | How does state cross threads? | Shared memory + locks / message passing / immutable snapshot | **High-incident zone**: if this layer fails, nothing done in the first two layers can save it |

**Key criterion**: performance problems mostly live in layers 1 and 2; correctness problems are almost all in layer 3. Discussing only "Reactor or Proactor" means no review happened.

### D14.2 Document-side signals (mechanically scannable, see docstat.mjs)

| Signal | How to find | Points to | Condition for holding |
|---|---|---|---|
| Concurrency-model vocabulary missing | Search Reactor / event loop / thread pool / actor / thread-per-connection / single-threaded | D14 | None present → undeclared (P1); explicitly says "single-threaded, no concurrency" → record N/A |
| Multiple models coexisting | Search the distribution of main loop / callback pool / thread pool / dedicated thread across sections | D14 | ≥2 kinds with no boundary explanation (P1) |
| Timer scans scattered | Search period / poll / timer / every N seconds | D14 | Present in ≥3 modules with no unified scheduling |
| Scan period ≥ timeout threshold | Extract and compare each scan period against the timeout values pairwise | D14 | Holds → **P1 (the timeout can never fire)** |

### D14.3 Over-selection (reverse check, also reportable)

Compute capacity first: `message rate × per-message processing time = fraction of a core needed`. If that fraction is far below 1 core, a complex thread topology is over-engineering (P2).
Fewer than 1000 connections does not need Reactor; when the bottleneck is the algorithm rather than the concurrency framework, a complex topology is paid for nothing.

### D14.4 Three hard constraints (anti-preachiness)

1. Report only "signal holds + location is explicit"; do not report "suggest adopting pattern XX".
2. Must give the cost, and state the condition under which "not introducing it is also acceptable".
3. Symmetrically check over-engineering: an interface with one implementation, a base class with one subclass = YAGNI violation, also reportable (P2).

### D14.5 Concurrency invariant library (CONC-1~7)

| ID | Invariant | Violation symptom |
|---|---|---|
| CONC-1 | Single writer: any mutable state is written by exactly one fixed thread | Sporadic corruption that never reproduces under load |
| CONC-2 | Shard by key: operations on the same key land on the same owner | Out-of-order processing |
| CONC-3 | Queues are bounded and full behavior is explicit | Memory avalanche |
| CONC-4 | No I/O, no external callbacks, no allocation, and no second lock inside a lock | Unbounded lock hold time |
| CONC-5 | Multiple locks have a globally fixed order and are acquired in one direction | Deadlock |
| CONC-6 | Read-mostly data uses immutable snapshots (COW + atomic swap) | A writer blocks all readers |
| CONC-7 | Concurrency observability: thread names, queue depth, lock waits, event-loop latency | Cannot tell business load from lock contention |

**D14 judgement requirement**: the documents must explicitly commit to which invariants apply; inapplicable ones must state a reason (e.g. "single-threaded service, CONC-2 does not apply"). The blue team may defend only by citing this table, never by "that is how the design is".

## D15 Abstraction consistency

**Is the same concept expressed once; is duplicated cross-module logic pushed down; are terms unified; are extension points reserved; are there single-implementation interfaces / single-subclass base classes.**

- **Fail criteria**: the same concept has 2+ expressions requiring conversion; adding a new kind requires changes in 3+ places; no glossary.
- **Typical counterexample shape**: one concept has two type definitions with conversion code in between.

### D15.1 Document-side signals

| Signal | How to find | Condition for holding |
|---|---|---|
| Same concept, multiple types | Search naming families (XxxState/Xxx2D/XxxPose, singular/plural pairs) | ≥2 sets and conversion code required (P1/P2) |
| Extension point undescribed | Does the flow for adding a new entity/interface/data format say "which places must change" | Not written, or ≥3 places listed → P2 |
| Single-implementation interface | An interface/abstract base class appears but only one implementation is described | No reason reserved → over-engineering P2 |
| Glossary missing | No terminology section anywhere | P3 |

## Level caps for D12/D14/D15 (the anti-noise core)

| Finding | Cap | Reason |
|---|---|---|
| Missing design pattern (strategy/factory/observer…) | **P2** | Taste and cost trade-off; not blocking |
| Missing unified abstraction, and the same defect is already duplicated in several places | P1 | Fixing one place leaves the others = real risk |
| Missing unified abstraction, without duplicated defects | P2 | Maintenance cost, not a functional error |
| Over-engineering | P2 | YAGNI |
| Inconsistent concurrency model / blocked reactor | **P1** (P0 if it can deadlock/starve) | Direct impact on stability |
| Scan period ≥ business timeout | **P1** | Functional error: the timeout never fires |
| Decision records only the conclusion, not the reason for rejection | **P2** | Cannot be reviewed by later readers |
