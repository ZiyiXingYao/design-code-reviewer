# Craft compliance checklist (design-specific)

Reviewing archify artifacts means checking not only whether the content is right, but also whether **the artifacts themselves follow the craft rules**.

| # | Check item | Criterion | Level |
|---|---|---|---|
| 1 | Document numbering continuity | 03+ module document numbers have no gaps and no duplicates (deletions must be explained) | P2 |
| 2 | Contract list-table numbering continuity | The "number" column of each list table has no gaps (deletions must be explained) | P3 |
| 3 | Fixed sections complete | Module 8 / architecture 15 / contract 10 / data 8 sections all present; a missing section must say "N/A + reason" | P2 |
| 4 | Table columns complete | Field tables include visibility/constraint columns; function tables include signature/callers/parameters/return value/exceptions | P2 |
| 5 | Diagrams complete | Every end-to-end flow has a sequence diagram; the `json/svg/html` trio is consistent | P3 |
| 6 | state consistent with change list | The file pointed to by `state.yaml.change_list.path` exists and is the latest change | P2 |
| 7 | Abnormal reopen | The same document reopened ≥3 times → list as high risk and examine section by section | Risk weight (not a standalone level) |
| 8 | Residue check | Concepts already deleted are still referenced by other documents (a field removed from 00 is still used in 03) | **P1** |

**Judgement reserved**: craft problems are mostly P2/P3 and must not outweigh content defects. But item 8 "residue" is often P1 — it means **the design is already internally inconsistent**, and the implementation will inevitably stumble.

## How to execute

1. `node scripts/docstat.mjs <projectRoot>` to get the baseline table, missing sections, numbering gaps, and reopen distribution.
2. Manually check items 2, 4, 5, 8 (the script does not cover them).
3. Suggested approach for item 8: take the symbols marked as "deleted/renamed" from the change-list's "文件修改台账", then grep the whole repo for reverse references.
