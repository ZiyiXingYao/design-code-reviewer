# The 17 scenario cards (criterion three)

**Usage**: every card asks the same question — "if this scenario happens, what does the system do? Which section of the design guarantees that behavior?"

- **Pass**: a specific section can be pointed to, and that section really guarantees the behavior.
- **Fail**: no section can be pointed to; or the section pointed to only describes the happy path.

The cards are industry-independent; domain-specific scenarios are appended by `profiles/`.

| Class | # | Scenario | Typical gap shape |
|---|---|---|---|
| **Failure** | F1 | Primary database unavailable for 30 seconds | Can read-only capability degrade; does a DB failure at startup prevent booting |
| | F2 | Message middleware backlog for 10 minutes | Do new commands queue during the backlog; is there a drop policy; how are offsets committed |
| | F3 | An instance OOMs and restarts | Which state is recovered on restart; what happens to state written just before |
| | F4 | Network partition (two services cannot see each other) | How to decide when the peer's state is invisible; how to reconcile after recovery |
| | F5 | Clock jump (NTP correction) | Computing timeouts with wall-clock time yields negative values / premature timeouts |
| **Capacity** | C1 | Primary entity count ×10 | Does processing traverse everything; can in-memory state hold it; is there a single-point bottleneck |
| | C2 | Request/report frequency ×10 | Is there backpressure; are queues unbounded; does the pressure propagate upstream |
| | C3 | Single data set size ×10 (map/index/config) | Load time, traversal complexity, memory amplification |
| | C4 | Concurrency within one shard ×10 | Lock contention; write amplification; hot keys |
| **Change** | V1 | Adding a new kind of entity/type | Are fields extensible; are there hard-coded enumerations; how many places must change |
| | V2 | Replacing a middleware implementation | Is the abstraction isolating; does the protocol layer couple implementation details |
| | V3 | Adding a deployment unit/region | Does the aggregation key support it; does cross-unit state still hold |
| | V4 | Upgrading a dependency library (exported surface changes) | Is an adapter layer isolating; compatibility policy |
| **Operations** | O1 | Rolling upgrade (old and new versions coexisting) | Contract compatibility; data-format compatibility; how versions are distinguished |
| | O2 | Single-instance restart recovery | Recovery order; does it accept new requests during recovery; is repeated recovery idempotent |
| **Security** | S1 | Trust boundary breached (an attacker inside the intranet) | Is identity verified per request; is there service-to-service authorization; can commands be forged |
| | S2 | Key rotation | Do old and new keys coexist during rotation; is the key source hot-reloadable |

**Output shape**:

```
17 cards → clearly guaranteed 11 / no guarantee 4 (F3 state written just before restart is lost, C2 no backpressure, O1 old/new coexistence not designed, S1 identity only from connection state) / N/A 2
```

Cards marked N/A must have a reason; skipping is not allowed.
