import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initReview, commitBatch, updateState, appendProgress
} from "../skills/design-review/scripts/lib/review-state.mjs";

export function tmpReviewDir() {
  return mkdtempSync(join(tmpdir(), "dcr-"));
}

export function scaffold(dir, {
  reviewType = "design",
  tier = "standard",
  steps = ["A0"],
  expected = { dimension: 1 },
  batches = [{ id: "b01", group: "s1", unit: "维度D1", kind: "discrete" }],
  commit = "abc1234",
  bench = "L2",
  mode = "full",
  from = "",
  to = "HEAD"
} = {}) {
  initReview(dir, {
    type: reviewType, tier, expected, steps, batches,
    mode, from, to,
    commit, designState: "closed", reopen: 0, bench
  });
  for (const id of steps) {
    updateState(dir, (st) => {
      st.steps[id] = { status: "done", at: new Date().toISOString() };
    });
  }
  updateState(dir, (st) => {
    st.state = "reported";
    if (tier !== "quick") {
      st.adversarial.agents = [
        ...["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((g) => ({
          role: `scout-${g}`, agent_id: `sub-${g}`, findings: 1, coverage_note: "本组检查完毕", cross_hints: []
        })),
        { role: "red", agent_id: "sub-red", coverage_note: "17 卡全跑", retries: 0 },
        { role: "blue", agent_id: "sub-blue", retries: 0 },
        { role: "judge", agent_id: "sub-judge", retries: 0 }
      ];
    } else {
      st.adversarial.agents = [{ role: "scout-s3" }, { role: "scout-s5" }];
    }
  });
  return dir;
}

export function putBatch(dir, payload) {
  return commitBatch(dir, { payload });
}

export function writeVerdicts(dir, { accusations, defenses, verdicts, stats }) {
  writeFileSync(join(dir, "06-accusations.json"), JSON.stringify({ accusations, coverage_note: "全卡" }, null, 2));
  writeFileSync(join(dir, "07-defense.json"), JSON.stringify({ defenses }, null, 2));
  writeFileSync(join(dir, "08-verdict.json"), JSON.stringify({ verdicts, stats }, null, 2));
}

export function writeReports(dir, { bench = "L2", extra = "", findings = [] } = {}) {
  const blocks = findings
    .filter((f) => ["P0", "P1"].includes(f.level))
    .map((f) => `### ${f.id} ${f.title}

- **在哪**：\`${f.location}\`（§3.1）
  - 模块：示例模块｜功能点：FP-1｜流程：示例流程
- **什么问题**：${f.mechanism || "缺机制"}
- **会怎样**：${f.counterexample || "给定X→Y→缺Z"}
- **怎么改**：${f.suggestion || "补机制"}
`).join("\n");
  writeFileSync(join(dir, "REPORT.md"), `# 评审报告
评审模式：全量（工作区当前版本）
基准：${bench}

## 1 结论摘要
发现 F-001。
- 对抗：指控 1，成立 1，驳回 0，未决 0（成立率 1.0 / 有效辩护率 0.5 / 升级率 0.0 / 未决率 0.0）
${extra}
## 7 发现清单

${blocks}
## 交接块

- 设计基线：abc1234
`);
  writeFileSync(join(dir, "SUMMARY.md"), `# 结论
基准：${bench}

## 一句话结论
有条件通过。

## 最该关心的三件事
1. F-001

## 必办清单
| 序 | 项 | 级别 | 依赖 |
|---|---|---|---|
| 1 | F-001 | P0 | - |

## 已接受的风险
无

## 数字概览
- 成立率 0.5 / 有效辩护率 0.5 / 升级率 0.0 / 未决率 0.0

## 本次没看什么
无
`);
}

export function heartbeat(dir, batch, beat = 1) {
  appendProgress(dir, { batch, status: "running", beat, ts: new Date().toISOString() });
}
