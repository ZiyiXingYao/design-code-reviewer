# Orchestrator brief (run by the main agent, no judgement)

The main agent only dispatches, collects, advances state, and gates. It **takes no part in judging whether an accusation holds**.

## 1 Dispatch sequence

```
A0 contract check → A0.5 write plan.json (batches + material routing) → scan layer, 7 groups in parallel (max 4 per wave)
  → A4.5 dedup → adversarial layer red → blue → judge (serial, only for P0/P1) → meta review (optional) → gate
```

## 2 Brief construction rules

Every sub-agent brief must be self-contained (sub-agents cannot see the main session):

1. Role and KPI (including "every high-risk surface must have a per-item conclusion")
2. Whitelist of readable paths + forbidden paths
3. Ammunition paths (give paths, do not paste the full text)
4. Output schema
5. Evidence requirements
6. Coverage statement requirements

**Never** put "I suspect X is here" or any conclusion of the main agent into a brief, and never relay another sub-agent's findings (exception S7: its input is the findings of the first six groups).

## 3 Path whitelist

| Role | May read | Forbidden |
|---|---|---|
| scout-s1..s7 | the material list of its own group + shared pool | other groups' materials; other groups' artifacts under `batches/` |
| scout-s7 | batch artifacts of the first six groups (read-only findings/cross_hints) | raw design documents |
| red | design documents + ammunition | any artifact in the review directory (especially 07-defense.json) |
| blue | structured accusation entries + design documents | the reasoning process of 06; red-team tone |
| judge | the two structured datasets 06/07 | any raw document/code |
| meta | red-team ammunition usage notes + stats of 08 | accusation and defense content |

Isolation rests on three layers: path whitelist, content trimming (only structured fields), id shuffling (the accusation ids handed to the judge are not in their original order).

## 4 Validation and retry

| Situation | Handling |
|---|---|
| return is not valid JSON / missing fields | send back and rerun; at most 2 times per sub-agent |
| red team has no `coverage_note` or clearly skips items | treat as incomplete, rerun |
| a compromise verdict such as "partially valid" appears | send back, require the three-state form |
| 2 consecutive rejections | record `failed`, gate blocks, **no report produced** |
| timeout | mark as failed; on a whole-round timeout keep the completed entries and mark `partial` |

## 5 Persistence

- Write each batch artifact to `batches/<id>.json` first (atomically, via `state.mjs batch`), then record the `agent` entry.
- Accusations/defenses/verdicts are persisted verbatim into `06/07/08.json`; the main agent **does not rewrite, merge, or polish** them.
- Metrics are computed from `08-verdict.json.stats`; sub-agents are never allowed to self-report them.

## 6 Sub-agent records (auditable)

```
node <skill-root>/scripts/state.mjs agent <reviewDir> --role scout-s3 --agent-id sub-a03 --findings 9 --retries 1 --coverage-note "…"
```

Even when every instance runs on the same model, record the instance and the retry count — this is the only evidence that "an independent review actually happened".
