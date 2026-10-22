# review-performance

## Purpose

Defines the performance review scope within design review and implementation review, and the balance constraints that any performance conclusion must respect: performance must not come at the cost of readability or implementation complexity, and must not be complicated without evidence.

## Requirements

### Requirement: Four capacity questions on the design side

The system SHALL answer all four items one by one in D9; missing any one of them fails the check: peak derivation (entity count × frequency + management-plane traffic, compared against the declared peak), memory budget breakdown, queue count + byte cap with full-queue behavior, and the P99 target with hot-path complexity.

#### Scenario: derivation missing

- **WHEN** the document only states "supports N nodes / peak M msg/s" without a derivation
- **THEN** D9 fails and is recorded as P1

#### Scenario: self-contradictory derivation

- **WHEN** the peak computed from the document's own node count and frequency is significantly higher than the declared peak, and shards/threads are sized against the declared peak
- **THEN** the capacity conclusion is void and is recorded as P0

### Requirement: Implementation-side performance findings must be quantified

The system SHALL require every performance finding from lens 16 to give an order-of-magnitude estimate or a complexity; when it cannot, the finding is at most a P3 advisory and must not enter P0/P1.

#### Scenario: no quantified evidence

- **WHEN** a finding only says "this may be slow / consider adding a cache" without an order of magnitude or complexity
- **THEN** it is not treated as a defect and is at most a P3 advisory

### Requirement: Balance between performance, readability and implementation cost

The system SHALL require every performance optimization recommendation to state its cost (readability, implementation complexity, maintenance cost), and to prefer the simpler implementation at equal benefit.

#### Scenario: unjustified complication

- **WHEN** lock-free structures, pooling, batching or complex concurrency topologies are recommended under low load or before the bottleneck is located
- **THEN** it is recorded as P2 over-engineering and must not be P0/P1
- **AND** naming, layering or error handling must not be compressed for the sake of optimization

#### Scenario: performance section in the report

- **WHEN** a report is issued at the standard or deep profile
- **THEN** it must contain a "性能与容量" (performance and capacity) section with four items: performance conclusion / capacity and limits / latency and hot paths / balance conclusion (gate G24)
