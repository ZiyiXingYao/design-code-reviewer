---
description: Resume an interrupted design/implementation review (scans .design-code-reviewer and lets you choose) — 恢复中断的设计/实现评审（扫描 .design-code-reviewer，按需选择）
argument-hint: "[project-dir] [--list] [--id <YYYY-MM-DD>-<design|impl>] [--json]"
allowed-tools: Bash, Read
---

The user asks to resume a review. Arguments: `$ARGUMENTS`

## Steps

1. **Determine the project root**: the first argument that does not start with `--`; fall back to the current working directory. Referred to below as `<project>`.
2. **Call resume** (each skill ships its own copy; either one works, design-review preferred):

   ```bash
   node "$HOME/.codebuddy/skills/design-review/scripts/resume.mjs" <project> <remaining args>
   ```

   If that path does not exist, try `impl-review` next, or run `node skills/design-review/scripts/resume.mjs` directly from the repository.

3. **Handle the exit code**:

   | Exit code | Meaning | What you should do |
   |---|---|---|
   | 0 | Resumed, or nothing left unfinished | If the output is "没有未完成的评审", report it to the user as is; otherwise continue with step 4 |
   | 1 | The target is already closed | Tell the user it cannot be resumed; changing the conclusion requires a new round |
   | 2 | The id is invalid or does not exist | Ask the user to pick from `--list` |
   | 3 | Several reviews are unfinished | **Show the list as is** and ask the user to specify one with `--id`; do not choose for them |
   | 4 | plan.json was modified | Explain the sha mismatch and ask whether to use `--force` |

4. **Continue the review**: rerun once with `--json` and read `review_id`, `type`, `dir`, `next_batches`, `pending_steps`, then:
   - `type=design` → continue per the design-review skill;
   - `type=impl` → continue per the impl-review skill.
   - Run only the unfinished items in `next_batches` and `pending_steps`; **completed batches are not rerun**, and **do not modify plan.json**.
   - After each batch, persist it with `state.mjs batch` from the corresponding skill directory.
5. **Close out**: once all batches are done, run `gate.mjs` → only then `state.mjs promote`.

## Notes

- Do not hand-edit `.design-code-reviewer/*/state.yaml`.
- If `review.dir` does not exist or the state cannot be parsed before resuming, report it directly instead of recreating the directory.
- Resuming continues a run, it is not a re-review: the criteria, profile and batch split all come from the original `plan.json`.
