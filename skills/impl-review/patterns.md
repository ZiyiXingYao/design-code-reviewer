# Design Pattern Reference (GoF 23)

**Not a mandatory checklist.** Only two uses: reverse lookup (signal first, then consult the table) and forward lookup (see which pattern is used, then look for misuse).

## Reverse Lookup: Signal → Missing Pattern

| Signal (observable) | Missing pattern | Criterion |
|---|---|---|
| Type branching on the same dimension repeated ≥3 times with an identical branch set | Strategy / polymorphic dispatch | adding one type means changing N places |
| State decided by scattered string/int checks | State | state values spread across ≥3 files |
| Hand-maintained callback list in ≥2 places | Observer | the publisher has to know its subscribers |
| ≥7 constructor parameters or ≥3 bools | Builder / parameter object | call-site ordering is error-prone |
| Resource acquire/release scattered across ≥3 places | RAII / Template Method | leaks exist |
| Caller invokes 5+ objects in a fixed order | Facade | ordering relies on documented convention |
| Cross-cutting logic scattered across call sites | Proxy / Decorator | the same pre/post code repeats |
| Two dimensions vary independently | Bridge | combinations = product of the dimensions |
| Frequent new operations on a stable structure | Visitor | adding an operation touches every class |
| Third-party interface does not match the internal one | Adapter | conversion code is duplicated |

## Forward Lookup: Typical Misuse of the 23 Patterns

Unified criterion: **implementation count = 1 with no expected variation → over-engineering (P2)**.

| # | Pattern | Applicable signal | Typical misuse |
|---|---|---|---|
| 1 | Abstract Factory | switching a whole product family set | only one product family |
| 2 | Builder | ≥7 parameters or combinatorial explosion | Builder for two or three fields |
| 3 | Factory Method | several subclasses each creating a different product | only one subclass |
| 4 | Prototype | cloning is cheaper than constructing | clone on simple value objects |
| 5 | Singleton | genuinely unique and controlled | used as a global variable |
| 6 | Adapter | interface mismatch | no conversion, just a wrapper |
| 7 | Bridge | two dimensions vary independently | only one dimension |
| 8 | Composite | tree structure with uniform leaves and branches | only one level |
| 9 | Decorator | dynamically stacking responsibilities | wrapper layers that only pass through |
| 10 | Facade | simplifying subsystem calls | Facade becomes a god class |
| 11 | Flyweight | many repeated immutable objects | objects are few to begin with |
| 12 | Proxy | access control / lazy loading | business logic stuffed into the proxy |
| 13 | Chain of Responsibility | multiple optional handlers | a chain of one link |
| 14 | Command | queueing / undo / audit trail | no queue, no undo |
| 15 | Interpreter | a small grammar | used as a general expression engine |
| 16 | Iterator | multiple traversals / hidden structure | the container already traverses |
| 17 | Mediator | N×N interactions | Mediator becomes a god object |
| 18 | Memento | snapshot and restore | huge snapshots that are never compressed |
| 19 | Observer | one-to-many notification | only one subscriber |
| 20 | State | state-driven behavior | two states with no transitions |
| 21 | Strategy | interchangeable algorithms | a strategy with a single implementation |
| 22 | Template Method | fixed skeleton, variable steps | a skeleton with a single implementation |
| 23 | Visitor | extending operations on a stable structure | unstable structure (double explosion) |

## Decision Rules

1. Should have been used but was not: report only when the signal holds, **capped at P2**.
2. Used but wrong: incomplete structure (a strategy with one branch, an observer with one subscriber), P2.
3. Over-engineering: implementation count = 1 with no expected variation, P2; it must be reported, otherwise it encourages over-abstraction.

Pattern-level findings **never produce P0/P1**; if a pattern misuse has already caused a real defect, assign it to the corresponding lens and grade it there.
