# Assertion Extraction and Verification

**List tables in design docs are naturally assertion sets.** The core defines only "assertion types", never "which file, which section" — the latter is delegated to the adapter.

## 1 Assertion Types

| Type | Form in the docs | Code-side verification point |
|---|---|---|
| Entity | entity/table list | schema definitions, DAO constants |
| Field | field table | DDL, record structures |
| Key / path / topic | string patterns in list tables | constant definitions, string literals |
| Interface | "method + path" in list tables | route registration, call sites |
| Class / type | class list, detailed design sections | type definitions, aliases |
| State machine | state enum + transition table | enum definitions, transition table |
| Call sequence | sequence diagram | call chain |

## 2 archify Adapter Mapping

| Document | Section | Assertion type |
|---|---|---|
| `00-接口契约.md` | §1.1 table list / §1.2 fields / §2.1 keys / §3.1 topics / §4.1 interfaces | entity / field / key / topic / interface |
| `01-架构设计.md` | §6 module split / §7 cross-module interface matrix / §8 core class design / §9 file tree | class / interface / directory |
| `02-实体与数据设计.md` | §5 state machine / §1 overview | state machine / entity |
| `NN-模块.md` | §2.1 class list / §3.x detailed class design / §6 state machine | class / field / state machine |
| `diagrams/*.sequence.json` | node sequence | call sequence |

Switching to a different doc toolchain means swapping only the adapter; the core criteria stay unchanged.

## 3 Three States and Classification

```
node <skill-root>/scripts/claims.mjs <projectRoot> --out <reviewDir>/claims.json [--scope src/]
```

The output gives `found / missing / unverifiable` counts and details per assertion type. Rules:

- `found`: a symbol/literal with the same name is found in the code (case and naming family are distinguished).
- `missing`: no match repo-wide → must be manually classified as "truly missing / renamed without write-back / expression difference".
- `unverifiable`: the doc wording cannot be matched mechanically (e.g. "the plugin is responsible") → not counted in the statistics, listed in the appendix.
  Currently `claims.mjs` only produces found/missing; assertions that need semantic judgment are added as `unverifiable` manually by the reviewer, with reasons.

## 4 Measured Baseline (for calibrating expectations)

A real project: 369 assertions; the contract layer hit 100% (MQ 43/43, Redis 14/14, MySQL tables 12/12, HTTP 1/1); of 108 class assertions, 39 were missing, and 33 of those were **false negatives** from submodules that had not been checked out.

**Conclusions**:
1. The contract layer can be automated with low noise;
2. The class layer must be classified manually;
3. **Run the submodule preflight first**, otherwise the missing count is polluted by false negatives.

## 5 Incidental Mechanical Findings

Gaps in list-table numbering (e.g. 12→15, 5→5.1) are almost impossible to spot by eye but are craftsmanship defects (DR-7 = P3). `claims.mjs` reports them as well.
