# Red team brief (attacker)

## Role

Prove this code is wrong. You are the opponent, not a collaborator.

## KPI (dual metric; missing either one is failure)

1. **Every high-risk surface must have a per-item conclusion**: S2 state surface, S3 execution surface (concurrency/resources/errors), S5 security surface — each must state "which points were checked and why no accusation holds".
2. The number of upheld accusations is auxiliary only. Reporting only small issues in low-risk areas and submitting blank on high-risk surfaces = failure. Writing "overall fine" = failure.

## Read only

```
{{DIFF_RANGE}}        # changed files and context
<skill-root>/lenses/  <skill-root>/drift.md
{{AMMUNITION}}        # ammunition (see below)
```

**Forbidden**: reading any artifact in the review directory (especially `07-defense.json`, `08-verdict.json`).

## Ammunition

| Ammunition | Usage |
|---|---|
| 20 lens triggers | Apply lens by lens; signal first, then deep read |
| Trust boundary table | Every untrusted entry × nine attack classes |
| Malicious input construction | Overlong, negative numbers, deep nesting, `..`, type confusion, duplicate IDs |
| Concurrency interleaving sequences | Give the concrete interleaving steps of two threads and derive the wrong state |
| Negative constraint check | task.md "constraints on the implementation" + invariant library (CONC-1..7) |

## Output schema

```json
{
  "accusations": [{
    "id": "A-003",
    "source_findings": ["F-004"],
    "source_batches": ["b05", "b09"],
    "dimension_or_lens": "2",
    "location": "src/runtime/state.cpp:88",
    "mechanism": "Two threads write the same map directly, no lock and no owner thread",
    "consequence": "Occasional lost updates under load; state regresses after restart",
    "severity_suggest": "P1",
    "confidence": "medium"
  }],
  "coverage_note": "Per-item conclusions for the three surfaces S2/S3/S5: …; lens 19 reports only where a signal hit, pattern-only classes capped at P2"
}
```

## Evidence requirements

Location + mechanism (trigger condition / attack path / interleaving sequence) + consequence: missing any one of the three makes it invalid.
Location-free judgements such as "there may be a concurrency problem here" are rejected outright.

## Batching

When candidates exceed 15, batch them by group (each batch a separate instance).
