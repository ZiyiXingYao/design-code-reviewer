# DR-1~DR-8 Drift Classification

| Code | Type | Definition | Level |
|---|---|---|---|
| DR-1 | No implementation | Registered in the docs, absent from the code | P1 |
| DR-2 | Renamed without write-back | Code renamed/re-signatured, docs not updated | P2 |
| DR-3 | Behavior mismatch | All symbols present, but semantics/ordering/criteria differ | P0/P1 |
| DR-4 | Residue | A deleted concept is still referenced or still has code | P2 |
| DR-5 | Internal contradiction | Two conflicting statements within or across docs | P1 |
| DR-6 | Design gap | A whole block of functionality exists in code with no design in the docs | **Not a defect** (report §5 note, not in task.md) |
| DR-7 | Template non-compliance | Missing numbering/sections/table columns | P3 |
| DR-8 | Commitment unfulfilled | `[x]` checked but not actually met (including fake tests) | **P0** |

## Decision Points

- **DR-1 and DR-6 are asymmetric**: doc has it, code does not = debt, a defect (P1); code has it, doc does not = design gap, a note only. Design docs cannot cover everything, so an implementation filling in what the design did not write is not an error.
- **DR-3 needs the most evidence**: never report it just because "it looks different"; you must state "the doc says A, the code does B, and the consequence differs under this input".
- **DR-4 is a high-frequency real problem**: fields/classes removed from the design are still being written in code or still being read elsewhere. Scan method: find "delete/rename" entries in the change-list's "file change ledger", then grep reverse references repo-wide.
- **Typical DR-5 shape**: the same concept is defined differently in 00 and 03; first decide which one is authoritative (usually the 00 contract wins), then assign the level.
- **Typical DR-6 shape**: a whole module is implemented and depended on in many places, while the architecture doc still says "not designed".
- **DR-8 is the most dangerous class in the whole pipeline**: it makes everyone believe the work is done. Detection = `[x]` + a test named in the acceptance criteria that cannot be found in `test/`.

## Relationship to the Five-Category Cross-Check

| Cross-check category | Main output |
|---|---|
| Structure | DR-1 (DR-6 recorded as a note only) |
| Behavior | DR-3 |
| Requirement | DR-1 (missing = P1) |
| Constraint | DR-8 (violating a negative constraint = P0) |
| Acceptance | DR-8 (false checkmark = P0) |

## Three-State Classification (B5)

The mechanical check outputs `found / missing / unverifiable`; every `missing` must be classified as one of "truly missing / renamed without write-back / expression difference", and unclassified items are not counted in the statistics.

- Truly missing → DR-1
- Renamed without write-back → DR-2
- Expression difference → do not report, record in the `unverifiable` notes
