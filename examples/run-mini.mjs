#!/usr/bin/env node
/**
 * 可复跑的脱敏验收样例。
 *
 *   node examples/run-mini.mjs
 *
 * 只跑确定性部分（不派子代理）：
 *   1) docstat / preflight / claims / smells 在迷你设计集上的输出
 *   2) 状态机：建评审目录 → 落一批 → 恢复对账
 *   3) 闸门：用一份最小但合规的报告跑 gate，验证"能过"与"缺覆盖会拒"
 *
 * 全部写入临时目录，不改动 examples/ 与仓库。
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initReview, commitBatch, updateState, loadState
} from "../skills/design-review/scripts/lib/review-state.mjs";
import { auditDir, makeReviewId, workDir } from "../skills/design-review/scripts/lib/layout.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const run = (script, args) => spawnSync(node, [join(ROOT, script), ...args], { encoding: "utf8" });

const tmp = mkdtempSync(join(tmpdir(), "dcr-example-"));
const project = join(tmp, "project");
cpSync(join(ROOT, "examples", "mini-design"), project, { recursive: true });

console.log("== 1. 设计产物基线 ==");
const ds = run("skills/design-review/scripts/docstat.mjs", [project, "--json"]);
if (ds.status !== 0) { console.error(ds.stderr); process.exit(1); }
const docstat = JSON.parse(ds.stdout);
console.log(`文档 ${docstat.file_count} 份 / ${docstat.total_lines} 行；问题 ${docstat.problems.length}；告警 ${docstat.warnings.length}`);

console.log("\n== 2. 实现侧基准等级 ==");
const pf = run("skills/impl-review/scripts/preflight.mjs", [project, "--json"]);
const pre = JSON.parse(pf.stdout);
console.log(`基准 ${pre.bench}；设计 ${pre.design.files.length} 份；state=${pre.design.state}`);

console.log("\n== 3. 断言与信号 ==");
const cl = run("skills/impl-review/scripts/claims.mjs", [project, "--json"]);
const claims = JSON.parse(cl.stdout);
console.log(`断言 ${claims.assertions.length}；汇总 ${JSON.stringify(claims.summary)}`);
const sm = run("skills/impl-review/scripts/smells.mjs", [project, "--json"]);
const smells = JSON.parse(sm.stdout);
console.log(`信号 ${smells.signals.length} 组`);

console.log("\n== 4. 状态机 ==");
const reviewId = makeReviewId(project, "design");
const review = workDir(project, reviewId);
const plan = {
  expected: { dimension: 1 },
  steps: ["A0"],
  batches: [{ id: "b01", group: "s1", unit: "D1 示例", kind: "discrete" }]
};
writeFileSync(join(tmp, "plan.json"), JSON.stringify(plan, null, 2));
initReview(review, {
  type: "design", reviewId, root: project, tier: "standard",
  expected: plan.expected, steps: plan.steps,
  batches: plan.batches, commit: "example", designState: "closed", reopen: 0
});
updateState(review, (st) => { st.steps.A0 = { status: "done", at: new Date().toISOString() }; });
commitBatch(review, {
  payload: {
    batch: "b01", group: "s1", unit: "D1 示例", kind: "discrete", status: "done",
    covers: [{ kind: "dimension", id: "D1" }],
    findings: [{
      id: "F-001", level: "P1", title: "示例：批量操作未定义部分失败",
      location: "03-订单模块.md:20",
      mechanism: "未定义部分成功语义",
      counterexample: "给定 5 条订单，第 3 条写库失败 → 前 2 条已写且未回滚 → 因为缺补偿",
      impact: "库内残留半批数据", suggestion: "定义部分成功与补偿", confidence: "high"
    }]
  }
});
const st = loadState(review);
console.log(`批完成 ${st.recovery.done}；覆盖 ${JSON.stringify(st.coverage)}`);

// 让 gate 看到完整的对抗记录（本样例不派子代理，仅验证闸门规则）
updateState(review, (s) => {
  s.state = "reported";
  s.steps.A4_5 = { status: "done", at: "2026-01-01T00:00:00Z" };
  s.steps.A5a = { status: "done", at: "2026-01-01T00:01:00Z" };
  s.adversarial.agents = [
    ...["s1","s2","s3","s4","s5","s6","s7"].map((g) => ({ role: `scout-${g}`, agent_id: `sub-${g}`, coverage_note: "示例" })),
    { role: "red", agent_id: "sub-red", coverage_note: "示例", retries: 0 },
    { role: "blue", agent_id: "sub-blue", retries: 0 },
    { role: "judge", agent_id: "sub-judge", retries: 0 }
  ];
  s.adversarial.stats = { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0, escalated: 0 };
  s.batches[0].status = "done";
});
writeFileSync(join(review, "06-accusations.json"), JSON.stringify({ accusations: [{ id: "A-001", source_findings: ["F-001"], location: "03-订单模块.md:20", mechanism: "m", consequence: "c" }] }, null, 2));
writeFileSync(join(review, "07-defense.json"), JSON.stringify({ defenses: [{ accusation_id: "A-001", claim: "admit", location: "-", mechanism: "-" }] }, null, 2));
writeFileSync(join(review, "08-verdict.json"), JSON.stringify({ verdicts: [{ accusation_id: "A-001", decision: "upheld", level: "P1", reason: "机制成立" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0 } }, null, 2));
writeFileSync(join(review, "05-findings.json"), JSON.stringify({ findings: [{ id: "F-001", level: "P1", title: "示例", location: "03-订单模块.md:20", mechanism: "m", counterexample: "c", sources: [{ batch: "b01", id: "F-001", level: "P1" }] }] }, null, 2));
writeFileSync(join(review, "REPORT.md"), `# 示例评审报告

发现 F-001。对抗：成立率 1.00 / 有效辩护率 0.00 / 升级率 0.00 / 未决率 0.00。

## 1 结论摘要

有条件通过。

## 交接块

- 设计基线：example
`);
writeFileSync(join(review, "SUMMARY.md"), `# 示例结论

## 一句话结论

有条件通过。

## 最该关心的三件事

1. F-001

## 必办清单

| 序 | 项 | 级别 | 依赖 |
|---|---|---|---|
| 1 | F-001 | P1 | - |

## 已接受的风险

无

## 数字概览

- 成立率 1.00 / 有效辩护率 0.00 / 升级率 0.00 / 未决率 0.00

## 本次没看什么

示例未覆盖真实业务。
`);

console.log("\n== 5. 闸门 ==");
const gate = run("skills/design-review/scripts/gate.mjs", [review]);
console.log(gate.stdout.trim());
console.log(`gate 退出码 ${gate.status}（0=通过）`);
if (gate.status !== 0) process.exit(1);

console.log("\n== 6. 交付 ==");
console.log("人工批准（示例）：reviewer=示例评审员");
const approved = run("skills/design-review/scripts/state.mjs", ["approve", review, "--reviewer", "示例评审员"]);
if (approved.status !== 0) { console.error(approved.stderr); process.exit(1); }
console.log(approved.stdout.trim());
const tmd = join(auditDir(project, reviewId), "task.md");
console.log(`task.md：${tmd}（${existsSync(tmd) ? "已生成" : "缺失"}）`);

console.log(`\n工作目录：${review}`);
console.log(`交付目录：${auditDir(project, reviewId)}`);
console.log(`临时根目录：${tmp}`);
process.exit(0);
