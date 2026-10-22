---
name: design-review
description: Reviews design plans produced by brainstorming-archify (00 interface contract / 01 architecture / 02 data / 03+ modules / task.md / sequence diagrams), judging whether the plan is sound, whether the functionality is complete, and whether the artifacts comply with the craft rules. Supports both full review and incremental review over a specified revision range. 触发语：评审设计方案、这个架构合理吗、模块划分有没有问题、功能全不全、这份设计能不能开工、设计文档评审。
---

# Design Review (design)

The review target is **the archify artifacts themselves**: soundness of content + compliance of the artifact craft. **No code is read at all** (the single exception: directory names referenced inside task.md).

This skill and `impl-review` never call each other, and no result is passed between them: impl uses `specs/design/` directly as its baseline.

`<skill-root>` = the directory containing this file. All scripts are dependency-free; invoke them with `node <skill-root>/scripts/<name>.mjs`.

## 1 Six iron rules

- **A1 Never read code** — never open `src/`. Once you look at code, your perspective slides toward "is implementation possible" instead of "is the plan sound".
- **A2 Counterexample iron rule** — every finding must be expressible as "given X → wrong behavior Y → because Z is missing". If you cannot write it that way, it can only go into the appendix "Risk notes" and does not count toward P0/P1.
- **A3 Full scenario coverage** — all 17 scenario cards are run; when inapplicable, write `N/A + reason`; skipping is not allowed.
- **A4 Item-by-item gap answers** — all 20 gap items are answered one by one with "present / absent / N/A"; "overall reasonably considered" is not an acceptable substitute.
- **A5 Do not review writing style** — only dimension conformance, assertion truthfulness, and decision quality are reviewed. Writing preferences are P3 and never occupy a P0–P2 slot.
- **A6 Adversarial iron rule** — every P0/P1 must pass the red–blue–judge three-round process, executed by **independent sub-agents** (hard isolation). A single agent simulating the rounds is forbidden; compromise verdicts are forbidden.

## 2 Preflight validation (executed inside A0; do not start without it)

```
node <skill-root>/scripts/docstat.mjs <projectRoot> [--json]
```

It outputs: document inventory / line counts / reopen distribution and risk level, missing fixed sections, numbering gaps, state validation, D14/D15 signals.

Disposition rules are in `contract/artifacts.md`:

| Situation | Disposition |
|---|---|
| Any of 00/01/02 missing | Record P1 (incomplete artifact); review the rest as usual |
| `state.yaml` missing or schema incomplete | Mark the whole report "baseline not frozen"; **must not be used for Gate D sign-off** |
| `state=confirm` | May be compared; mark conclusions "baseline not frozen" |
| `state=draft/explore` | Do not refuse; mark conclusions `reference only`; must not sign off |
| Structural features do not match (numbering scheme / sections / change-list) | **Stop, raise an error, and list the actual structure**; guessing a mapping is forbidden |

If the host **lacks sub-agent dispatch capability**, refuse to run and state the reason — do not fall back to single-agent simulation.

## 3 Flow A0–A7

| Step | Action | Artifact | Exit condition |
|---|---|---|---|
| **A0 Baseline + contract validation** | docstat + state gate + risk grading | Baseline table | Contract validation concluded; gaps registered |
| **A0.5 Batch plan + material routing** | Choose profile; slice checks into batches; give each group its material list | `plan.json` | Batch count and units fixed; no changes after written |
| **A1 Extract decisions** | Read "Key decisions" in `change-lists/*.md`; mark per item whether it landed in the documents | Decision trace table | Every D-nnn has an owner |
| **A2 Dimension review** | Walk all 15 dimensions (`dimensions.md`) | Dimension score table | All 15 rows concluded |
| **A3 Functional completeness** | 3–8 core feature points × 20 gap items, two-level screening (`completeness.md`) | Gap coverage matrix | Every cell filled |
| **A4 Scenario walkthrough** | Walk all 17 cards one by one (`scenarios.md`) | Scenario conclusion table | All 17 rows concluded |
| **A4.5 Dedup and merge** | Merge same location + same mechanism; consolidate same mechanism across locations | Unique finding set | No duplicate entries (**must happen before adversarial**) |
| **A5a Red team** | File accusations against all P0/P1 candidates using the ammunition library | `06-accusations.json` | Each entry has location + mechanism + consequence; has coverage_note |
| **A5b Blue team** | Defend or concede, item by item | `07-defense.json` | Every entry concluded; an invalid defense counts as a concession |
| **A5c Judge** | Three-state verdict; compromise forbidden | `08-verdict.json` | Only upheld/dismissed/unresolved |
| **A6 Grade and write** | Grade per verdict → `REPORT.md` (11 sections; P0/P1 in §7 use the four-part form per finding) | Report | Gate G20 passes |
| **A7 Close out + deliver** | `SUMMARY.md` + gate, then deliver REPORT/SUMMARY into `specs/audit/<id>/` | 2-page brief + 2 deliverable files | Gate passes; deliverable directory's 2 files match the working copies |
| **A8 Human review + task.md** | Hand the **already delivered** product to human review; after approval generate the fix task list and close | `task.md` | `approve` succeeds, state `closed` |

**Risk weighting**: documents with reopen ≥3 are examined section by section; 1–2 reopens get spot checks; 0 reopens are judged on dimensions only.

## 4 Batch plan and parallelism (fixed; no mid-run changes)

**Two-layer division of labor**: the scanning layer splits into 7 groups by review aspect and runs **in parallel** (for depth); the adversarial layer splits into 3 roles and runs **sequentially** (for accuracy).

| Group | Attention mode | What it reads | Dimensions owned |
|---|---|---|---|
| S1 | Inventory and signatures | Interface contract, module list, class list, file tree | D1/D2/D3/D15 |
| S2 | State transitions and consistency | State machines, data model, transaction sections | D5/D6/D7 |
| S3 | Timing, interleaving, failure paths | Concurrency model, error handling, resource lifecycle | D8/D14 |
| S4 | Extremes and magnitude | Thresholds, units, capacity assumptions | D4/D9 |
| S5 | Attacker perspective | Trust boundaries, parsing entry points, auth points | D11 |
| S6 | Cross-cutting quality attributes | Metrics, logging, testing, decision records | D10/D12/D13 |
| S7 | Inter-group combined defects | **Reads only the first six groups' findings**, not the source documents | Cross-dimension contradictions |

- One sub-agent per group; within a group, batch further by "review unit": one dimension per batch, gap items by feature point (20 cells per batch), scenario cards 6 per batch.
- **Batch caps**: ≤15 findings per batch; ≤25 cells per batch. Anything larger must be split again.
- S7 must exist, otherwise combined defects are guaranteed to be missed.
- Material routing: each group reads only the sections in its own list; cross-document scenarios (F4 network partition, O1 rolling upgrade) draw from the **shared pool** (global flows, deployment & operations, cross-service calls, master error-code table), and the `coverage_note` must state which pool document was read.
- Max wave concurrency is 4; the batch plan is written into `plan.json` before the run starts and is read-only afterwards.

## 5 State and persistence (single entry point)

```
# Start a round (id auto-generated: <YYYY-MM-DD>-design; second of the same day gets -2)
node <skill-root>/scripts/state.mjs init <projectRoot> --type design --plan <plan.json> [--mode full|delta --from <rev> --to <rev>] [--id <id>]

# Persistence and progress
node <skill-root>/scripts/state.mjs batch <reviewDir> --payload <b01.json> --agent sub-a01 --ms 142000
node <skill-root>/scripts/state.mjs heartbeat <reviewDir> --id b07 --beat 3
node <skill-root>/scripts/state.mjs partial <reviewDir> --batch b08 --payload <part.json>
node <skill-root>/scripts/state.mjs step <reviewDir> --id A2 --status running --done 7 --total 15
node <skill-root>/scripts/state.mjs agent <reviewDir> --role scout-s1 --agent-id sub-a01 --findings 4 --coverage-note "…"
node <skill-root>/scripts/state.mjs stats <reviewDir> --accusations 27 --upheld 12 --dismissed 9 --unresolved 6 --valid-defense 8
node <skill-root>/scripts/state.mjs transition <reviewDir> reported --reason "A6 done"   # auto-delivers REPORT/SUMMARY to specs/audit/<id>/

# Gate and delivery (reported is reviewable; deliver refreshes after report revisions; task.md is generated only after approval, then closed)
node <skill-root>/scripts/scope.mjs <projectRoot> --from <rev> --to <rev> --out <reviewDir>   # delta only: computes changed files and affected sections
node <skill-root>/scripts/gate.mjs <reviewDir>
node <skill-root>/scripts/state.mjs deliver <reviewDir>        # re-deliver after answering review comments or revising the report
node <skill-root>/scripts/state.mjs approve <reviewDir> --reviewer "<name>" [--note "…"] [--include-p2]
node <skill-root>/scripts/ledger.mjs <projectRoot> sync <reviewDir>     # approve runs this automatically
node <skill-root>/scripts/ledger.mjs <projectRoot> list --status open

# Interruption recovery (scans .design-code-reviewer/*-design/state.yaml, newest mtime first)
node <skill-root>/scripts/resume.mjs <projectRoot> --list
node <skill-root>/scripts/resume.mjs <projectRoot> [--id <id>] [--json]
```

- **Authority order**: `batches/*.json` > `progress.log` > `state.yaml`. state is only a summary cache and can be rebuilt if corrupted.
- Batch writes go `tmp → fsync → rename`; never hand-write `batches/`, always go through `state.mjs batch`.
- After an interruption: `resume` cleans `*.tmp`, discards batches that "have a log but no artifact", recomputes coverage, and outputs the next batch.
- **No report may be produced when the gate fails, and approve is not allowed**; in that state the report may only be marked `DRAFT`.
- **Delivery precedes approval**: on entering `reported`, REPORT/SUMMARY are copied to `specs/audit/<id>/` automatically; those are what human review looks at. A report that exists only in the working directory does not count as delivered.
- If the report is revised during review, `deliver` must re-deliver it; gate G14 blocks when the delivery directory and the working copy diverge.
- `approve` is what generates `task.md`; all three files are re-checked together for delivery (overwriting older versions) and the state is set to `closed`; the cross-run ledger `ledger.yaml` is updated automatically at the same time.
- Gate coverage floor: design standard profile = 15 dimensions / 17 cards / 20 cells (cell count must be a multiple of 20); a genuinely smaller scope needs `plan.coverage_floor_exempt` or `gate --allow-partial-coverage`.
- **G20 Report self-containment**: every P0/P1 must have its own subsection containing "where / what is wrong / how to fix", and locations must not use `05:338`-style abbreviations; P0/P1 must not be given as a compressed table only. `05-findings.json` is the evidence store and cannot substitute for the report body.
- **G24 Performance and balance**: the report must have a "Performance and capacity" section with all four parts (performance conclusion / capacity and limits / latency and hotspots / balance conclusion). The performance conclusion must give the derivation and numbers; **optimization suggestions must state both readability cost and implementation cost**; complexity without quantified justification is recorded as P2 over-engineering and must not be raised to P0/P1.
- **Two modes**: `full` (default) reviews all current content of `specs/design/`, **does not inspect commit history**, and writes no baseline commit into the report; `delta` requires `--from/--to`, reviews only the design changes in that range plus the sections they reference or are referenced by, and the report must declare "covers only this range".
- **delta flow**: `init --mode delta --from A --to B` → `scope.mjs` produces `scope.json` → `plan.json` records `scope_file: "scope.json"` and the affected-surface `expected` → batch only the affected dimensions/scenarios/gap items → the report lists all changed files and a "not covered" declaration.
- **Human review is a separate step**: when the report is written, stop at `reported` and wait for user confirmation; the approver must be passed explicitly via `--reviewer`.
- **When asking someone to review, report the delivery state clearly**: give the delivery directory path, the list of files already in place, and state that `task.md` will be generated after approval. Do not just say "the report is ready" — the reviewer will open `specs/audit/<id>/` and there must be something there.

## 6 Directory layout

```
<projectRoot>/.design-code-reviewer/<YYYY-MM-DD>-design/   # working dir (intermediate artifacts, kept read-only)
├── state.yaml           # sole authority, written only by state.mjs/resume.mjs
├── plan.json            # batch plan (fixed before the run)
├── progress.log         # JSONL, one line per batch
├── batches/b01.json …   # authoritative content
├── 00-baseline.md … 05-findings.md
├── 06-accusations.json / 07-defense.json / 08-verdict.json
├── gate-result.md
├── REPORT.md            # working copy (already copied to the delivery dir at reported)
├── SUMMARY.md           # working copy (already copied to the delivery dir at reported)
└── task.md              # generated after approval (working copy)

<projectRoot>/specs/audit/<YYYY-MM-DD>-design/            # delivery dir (finished products only)
├── REPORT.md            # 11 sections (in place as soon as reported is entered)
├── SUMMARY.md           # ≤2 pages (in place as soon as reported is entered)
└── task.md              # fix task list (generated after human approval)
```

The report is a polymer: every section must trace back to a batch artifact; do not improvise. At `reported` the delivery directory holds only REPORT/SUMMARY; `task.md` is added after approval; evidence stays in the working directory and the report references it by path.

## 7 Criteria index

| File | Content | When to read |
|---|---|---|
| `contract/artifacts.md` | Artifact contract, state schema, template sections, structural validation | A0 |
| `contract/craft-checklist.md` | 8 craft compliance items | A0/A4 |
| `dimensions.md` | 15 dimensions (including D14 three-layer test, D15 signals, level caps) | A2 |
| `completeness.md` | 20 gap items + two-level screening | A3 |
| `scenarios.md` | 17 scenario cards | A4 |
| `findings.md` | Counterexample construction, P0–P3, evidence format, dedup, ordering | A4.5/A6 |
| `report.md` | 11-section template + Gate D conditions | A6 |
| `adversarial/*.md` | Sub-agent briefs (orchestrator/scout/red/blue/judge/meta) | A5 |
| `profiles/` | Language/industry specialization (add-only, never modify; see profiles/README.md) | On demand |

## 8 Adversarial process (hard requirement)

- The red team reads only the design documents + the ammunition library; the blue team reads only the structured accusation entries + the documents; the judge reads only the accusation and defense JSON (**reading the source documents is forbidden**).
- Burden of proof: the red team gives location + mechanism + consequence; the blue team must cite a location, and "upstream should have validated it" = invalid defense = concession by default.
- Verdicts have exactly three states; `partially valid` / `somewhat relevant` and the like are all illegal.
- Four metrics are persisted and written into the report: upheld rate 30–60%, valid-defense rate ≥50%, escalation rate ≤30%, unresolved rate ≤10%.
- If a sub-agent produces malformed output twice in a row → mark `failed` → the gate blocks → no report is produced (**the main agent must not step in**).

## 9 Profiles

| Profile | Scan groups | Check items | Adversarial | Duration |
|---|---|---|---|---|
| Quick | S3+S5 | D6/D8/D14 | None | 5–8 minutes |
| Standard (default) | All 7 groups | 15 dimensions + 20 gap items + 17 cards | P0/P1 candidates only | 25–30 minutes (estimate) |
| Deep | All 7 groups + slicing by module | Full set + tool evidence | Full set + escalation rounds | 1–2 hours |

The profile is chosen at A0.5 and written into `plan.json`; no upgrading or downgrading mid-run. Items skipped by the quick profile must be recorded as `skipped + reason`.

## 10 Boundaries

- Do not review code, do not judge implementation difficulty, do not modify documents.
- "This would be painful to implement" → recorded as a feasibility risk in the appendix, not as a defect.
- Explicitly out of scope: business value judgements, requirements-soundness judgements, compliance sign-off.
- Design review does not guarantee that every defect is caught; it guarantees that **you can see what was missed** (coverage matrix, N/A reasons, what was not examined this round).
