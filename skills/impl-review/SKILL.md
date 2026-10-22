---
name: impl-review
description: Review whether a code implementation fulfills the brainstorming-archify design and run general correctness/security review (20 lenses + DR-1~8 drift classification + five-category cross-check). With a design, compare against it; without one, degrade to L0 code-only review but still run all 19 lenses. Trigger phrases — 评审代码、实现符合设计吗、合并前检查、review 一下、这个 MR 有没有问题。
---

# Implementation Review (impl)

The subject is **code**; the design docs are the baseline. **Do not judge architectural soundness** (that is `design-review`'s job) unless a documented design constraint is violated.

`<skill-root>` = the directory containing this file.

## 1 Hard Rules

- **B0 Baseline** — Determine L0/L1/L2 before starting and write it into section 0 of the report. A missing design **does not block** the review; it only drops the baseline to L0; **L0 must never be labeled L1/L2**, and you must not claim "the implementation matches the design".
- **B1 Read-only** — Do not modify any file; remediation suggestions go into `task.md`.
- **B2 Scope** — Scope is determined solely by `git diff <base>...HEAD`; out-of-scope files are context only (except broken call sites, marked `cross-file`).
- **B3 Preflight first** — When a submodule is not checked out, its implementation all lands in missing; that is a **false negative** and must not be counted as a defect.
- **B4 Assertion** — Every finding must give: document location + code location (file:line) + the assertion text or trigger condition.
- **B5 Three states** — `found / missing / unverifiable`; every missing item must be classified as "truly missing / renamed without write-back / expression difference".
- **B6 Commitments** — Every `[x]` in `task.md` must be verified; a false checkmark = P0.
- **B7 No architecture review** — Do not judge module boundaries or technology choices.
- **B8 Adversarial** — All P0/P1 must pass red-blue-judge with three rounds of context isolation; "upstream should have validated it" = invalid defense.

## 2 Pipeline B0–B10

| Step | Action | Output | Exit condition |
|---|---|---|---|
| **B0 Preflight + baseline** | `preflight.mjs`: submodules, baseline sha, L0/L1/L2 | `preflight.json` | Level decided; submodule issues declared |
| **B1 Lock scope** | `delta`: `git diff from..to --stat`; `full`: whole-repo code (excluding vendor/build/third_party) sliced by design module | scope list | Scope frozen |
| **B1.5 Batch plan + material routing** | split lenses into batches + material list per group | `plan.json` | Batch count fixed |
| **B2 Lock design baseline** | `full`: all of `specs/design`; `delta`: design sections matched by `related-design.mjs` | baseline list | Baseline in place |
| **B3 Extract assertions** | `claims.mjs` | `claims.json` | Assertion count fixed |
| **B4 Mechanical verification** | resolve symbols repo-wide + three-state classification | `claims-verify.md` | All three states covered |
| **B5 Lens scan** | `smells.mjs` emits signals → deep read with the 20 lenses | raw findings | All 20 lenses concluded |
| **B5.5 Five-category cross-check** | structure/behavior/requirement/constraint/acceptance each mapped to batches and to report §1 | coverage table | All five categories concluded |
| **B6 Commitment verification** | task.md four sections + negative-constraint diff | commitment checklist | Every `[x]` concluded |
| **B6.5 Deduplicate & merge** | merge same location + same mechanism; consolidate same mechanism across locations | unique finding set | Must happen before the adversarial stage |
| **B7a/b/c red-blue-judge** | executed by sub-agents | 06/07/08.json | No compromise verdicts |
| **B8 Grade & write up** | 11-section report; every P0/P1 in §7 written in four parts | `REPORT.md` | gate G20 passed |
| **B9 Close out + deliver** | `SUMMARY.md` + gate, then deliver REPORT/SUMMARY into `specs/audit/<id>/` | 2-page brief + 2 files in the delivery dir | gate passed; the 2 files in the delivery dir match the working copies |
| **B10 Human review + task.md** | hand the **delivered artifacts** to a human reviewer; after approval generate the remediation task list and close | `task.md` | `approve` succeeded, state `closed` |

## 3 Baseline Levels

| Level | Condition | Gate effect |
|---|---|---|
| **L2** | Design complete + `state=closed` | Valid as release basis |
| **L1** | Design complete but not frozen (state≠closed) | Valid as a gate, with a note that the baseline is not frozen |
| **L0** | No design / draft·explore / only partial docs / code-only changes | **Not valid as release basis** |

- L0 is a full review: lenses 1–20 all run; **lens 0 is skipped and marked** (never reverse-engineer requirements from code).
- The user may pass `--require-design`: when artifacts are incomplete `preflight.mjs` refuses to run and writes `preflight-failed.md`.
- The design baseline comes only from `specs/design/` and archify `state.yaml`: **never read or inherit** any conclusion or handoff block from design-review.

## 4 Five-Category Cross-Check (missing any category means the design was not cross-checked)

**Execution binding**: structure/behavior cross-checks are done by groups S1/S2 before the B5 lens scan; requirement/constraint/acceptance are done during B6 commitment verification; all five results go into the report §1 coverage table.

| # | Category | Design-side source | Code-side check | Mismatch = |
|---|---|---|---|---|
| 1 | Structure | contract list table, class list, file tree | schema, class definitions, directories | DR-1 (code has it, doc does not — record only as a DR-6 note) |
| 2 | Behavior | flow sections, state machine, sequence diagram | branches, state enums, call chains | DR-3 |
| 3 | Requirement | task.md `[实现的功能]` | code change locations | P1 |
| 4 | Constraint | task.md `[实现的约束]`, D-nnn | diff check for forbidden changes | **P0** |
| 5 | Acceptance | task.md `[验收标准]` | corresponding cases in `test/` | **P0 (false checkmark)** |

## 5 The 20 Lenses

| Pass | Lens |
|---|---|
| A Functionality | 00 requirement–implementation mapping |
| B Correctness | 01 lifecycle / 02 concurrency / 03 resources / 04 errors / 05 state machine / 06 boundaries / 07 time / 08 contract serialization / 09 consistency |
| C Security | 10 trust boundary / 11 identity and privilege escalation / 12 memory safety / 13 untrusted parsing / 14 secrets and dependencies / 15 denial of service |
| D Engineering | 16 performance / 17 observability / 18 testing / 19 abstraction and patterns / 20 concurrency in practice |

**Lenses 19/20 are signal-driven**: run `smells.mjs` first, deep-read only the hit locations; if there is no signal, do not report.
- Pattern-class findings from lens 19 are **capped at P2**; "the same defect is duplicated in several places because a shared abstraction is missing" may be P1.
- Lens 20: violating CONC-1..5 is at least P1, and may be P0 if it causes failure; CONC-6/7 are P2.
- Without TSan/Helgrind-class evidence, concurrency conclusions carry confidence ≤medium and must not stand alone as P0.

Criteria details are in `lenses/` (load on demand).

## 6 Drift Classification

DR-1 no implementation / DR-2 renamed without write-back / DR-3 behavior mismatch / DR-4 residue / DR-5 internal contradiction / DR-6 design gap (note only, not counted as a defect) / DR-7 template non-compliance / DR-8 commitment unfulfilled.
See `drift.md` for levels and criteria. **DR-8 = P0**.

## 7 State and Artifacts

```
# start a round first to get reviewDir (<projectRoot>/.design-code-reviewer/<YYYY-MM-DD>-impl/)
node <skill-root>/scripts/state.mjs init <projectRoot> --type impl --plan <plan.json> [--mode delta --from <rev> --to <rev>|--mode full] [--bench L2] [--id <id>]

node <skill-root>/scripts/preflight.mjs <projectRoot> [--require-design] --out <reviewDir>
node <skill-root>/scripts/related-design.mjs <projectRoot> --from <rev> --to <rev> --out <reviewDir>   # delta only
node <skill-root>/scripts/claims.mjs <projectRoot> --out <reviewDir>/claims.json [--design-scope <reviewDir>/design-scope.json]
node <skill-root>/scripts/smells.mjs <projectRoot> --json --out <reviewDir>/smells.json
node <skill-root>/scripts/state.mjs batch <reviewDir> --payload <b01.json> --agent sub-a01
node <skill-root>/scripts/state.mjs partial <reviewDir> --batch b08 --payload <part.json>
node <skill-root>/scripts/gate.mjs <reviewDir>
node <skill-root>/scripts/state.mjs transition <reviewDir> reported --reason "B9 complete"   # auto-delivers REPORT/SUMMARY into specs/audit/<id>/
node <skill-root>/scripts/state.mjs deliver <reviewDir>        # re-deliver after the report is revised, for human review
node <skill-root>/scripts/state.mjs approve <reviewDir> --reviewer "<name>" [--note "…"] [--include-p2]
node <skill-root>/scripts/ledger.mjs <projectRoot> sync <reviewDir>     # approve runs this automatically

# interrupt recovery
node <skill-root>/scripts/resume.mjs <projectRoot> --list
node <skill-root>/scripts/resume.mjs <projectRoot> [--id <id>] [--json]
```

Order of authority: `batches/*.json` > `progress.log` > `state.yaml`. Batch writes go through `tmp→fsync→rename`.
If the gate fails, no report may be issued (only mark `DRAFT`), and no approve is allowed. Entering `reported` auto-delivers REPORT/SUMMARY; the subject of human review is the artifact in the delivery directory; after approval it becomes `closed` and the working directory is read-only.
When asking for human review you must report the delivery directory path, the list of files placed there, and state that `task.md` will be generated after approval.

Coverage floor: impl standard tier runs 20 lenses (quick tier 5); below the floor the gate refuses unless explicitly waived. The cross-run ledger lives at `.design-code-reviewer/ledger.yaml`.
Two modes: `delta` (default) reviews the code changes in `--from..--to` and compares against the design sections those changes touch; `full` reviews the whole repo against all design docs.
G20 report self-containment: every P0/P1 must have its own subsection covering "where / what is wrong / how to fix"; the location must be code `file:line` with a design cross-reference; `05-findings.json` is the evidence store and cannot replace the report body.
G24 performance and balance: the report must have a "Performance and Capacity" section (performance conclusion / capacity and limits / latency and hot spots / balance conclusion). Performance findings from lens 16 must carry magnitude or complexity, and optimization advice must state its cost; **an optimization without quantitative evidence is not a defect (at most a P3 note)**, and readability must not be sacrificed for performance, nor unnecessary concurrency/pooling introduced.

Intermediate artifacts live in `.design-code-reviewer/<YYYY-MM-DD>-impl/`; final artifacts go to `specs/audit/<YYYY-MM-DD>-impl/`: at `reported` time `REPORT.md` and `SUMMARY.md` are placed there first, and `task.md` is generated from P0/P1 after human approval, dependency-ordered, with four-part prompts.

## 7.5 Sub-Agent Prerequisite

If the host **lacks sub-agent dispatch capability**, refuse to run and explain why — do not fall back to simulating with a single agent.

## 8 Adversarial

Same mechanism as `design-review` (`adversarial/orchestrator.md`): the scanning layer runs lens groups in parallel (7 groups: S1 structure / S2 state / S3 execution / S4 boundaries / S5 security / S6 engineering / S7 cross-cutting); the adversarial layer runs red→blue→judge serially, for P0/P1 only.
Red-team ammunition: 20 lens trigger conditions, trust boundary table, malicious inputs, concurrent interleaving sequences, negative-constraint checks.
Every P0/P1 needs a verdict in `08-verdict.json`; a compromise conclusion → the gate refuses.

## 9 Tiers

| Tier | Use | Lenses | Adversarial | Duration |
|---|---|---|---|---|
| Quick | pre-commit self-check, hotfix | 1/2/4/6/10 | none | 5–8 minutes |
| Standard (default) | before merging an MR | all 20 + one lint/test run as evidence | P0/P1 only | 25–30 minutes (estimate) |
| Deep | pre-release, concurrency/protocol changes | full + TSan/static analysis | full + escalation rounds | 1–2 hours |

The quick tier does not produce L1/L2 conclusions; at most it marks `L0 (quick tier)`; skipped items must be recorded as `skipped + reason`. The tier is written into `plan.json` at B1.5 and must not change during the run.

## 10 Boundaries

- Do not judge architectural soundness or technology choices (that is Gate D's job).
- Passing at L0 ≠ the feature meets requirements — it only means the code is internally consistent and this class of defect was not found.
- **A design gap is not an error**: implementations that exist in code but are not written in the design docs are recorded as a "design gap" note (report §5), not counted as P0–P2, not sent to adversarial, not written into task.md. Only "the doc says it, the code does not do it" (DR-1) counts as a defect.
- No guarantee of catching every defect; the guarantee is that whatever was missed is visible (coverage matrix, unverified items).
