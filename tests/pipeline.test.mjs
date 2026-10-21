import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initReview, updateState, commitBatch, appendProgress, loadState, reconcile } from "../skills/design-review/scripts/lib/review-state.mjs";
import { workDir } from "../skills/design-review/scripts/lib/layout.mjs";
import { checkFloor } from "../skills/design-review/scripts/lib/plan-floor.mjs";

const STATE = new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname;
const RESUME = new URL("../skills/design-review/scripts/resume.mjs", import.meta.url).pathname;
const GATE = new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname;
const run = (s, a) => spawnSync(process.execPath, [s, ...a], { encoding: "utf8" });

function mk(rootDir, id, batches, expected = { dimension: 15 }) {
  const dir = workDir(rootDir, id);
  initReview(dir, {
    type: "design", reviewId: id, root: rootDir, expected, steps: ["A0"], batches
  });
  updateState(dir, (s) => { s.state = "scanning"; s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  return dir;
}

const three = [
  { id: "b01", group: "s1", unit: "D1", kind: "discrete" },
  { id: "b02", group: "s1", unit: "D2", kind: "discrete" },
  { id: "b03", group: "a3", unit: "FP1", kind: "incremental", cells: 20 }
];
const done = (id, unit, covers) => ({
  batch: id, group: "s1", unit, kind: "discrete", status: "done",
  covers, findings: [], coverage_note: "ok"
});

test("覆盖下限：standard 15/17/20，completeness 必须是 20 的倍数", () => {
  assert.equal(checkFloor({ review_type: "design", tier: "standard", expected: { dimension: 15, scenario: 17, completeness: 40 } }).ok, true);
  assert.equal(checkFloor({ review_type: "design", tier: "standard", expected: { dimension: 15, scenario: 17, completeness: 30 } }).ok, false);
  assert.equal(checkFloor({ review_type: "design", tier: "quick", expected: { dimension: 4, scenario: 6, completeness: 8 } }).ok, true);
  assert.equal(checkFloor({ review_type: "impl", tier: "standard", expected: { lens: 19 } }).ok, false);
  assert.equal(checkFloor({ review_type: "impl", tier: "quick", expected: { lens: 5 } }).ok, true);
});

test("partial：记录已填格，resume 显示下一格，最终批落盘后清理", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-partial-"));
  const dir = mk(root, "2026-01-01-design", three);
  const payload = { batch: "b03", group: "a3", unit: "FP1", filled_cells: ["FP1#1", "FP1#2", "FP1#3"], cells: [] };
  const pf = join(root, "p.json");
  writeFileSync(pf, JSON.stringify(payload));
  const w = run(STATE, ["partial", dir, "--batch", "b03", "--payload", pf]);
  assert.equal(w.status, 0, w.stderr);
  assert.ok(existsSync(join(dir, "batches", "b03.partial.json")));

  const rs = run(RESUME, [root, "--json"]);
  assert.equal(rs.status, 0, rs.stderr);
  const j = JSON.parse(rs.stdout);
  assert.equal(j.partial_batches[0].batch, "b03");
  assert.equal(j.partial_batches[0].filled, 3);
  assert.equal(j.partial_batches[0].next_cell, "#4");

  commitBatch(dir, { payload: { batch: "b03", group: "a3", unit: "FP1", kind: "incremental", status: "done", covers: [{ kind: "completeness", id: "FP1#1" }], findings: [], coverage_note: "done" } });
  assert.equal(existsSync(join(dir, "batches", "b03.partial.json")), false);
});

test("T14 强杀续跑：tmp 清理、仅日志批重跑、覆盖与完整版一致", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-t14-"));
  const dir = mk(root, "2026-01-01-design", three);

  commitBatch(dir, { payload: done("b01", "D1", [{ kind: "dimension", id: "D1" }]) });
  appendProgress(dir, { batch: "b02", status: "running", ts: new Date().toISOString() });
  writeFileSync(join(dir, "batches", "b03.partial.json"), JSON.stringify({ batch: "b03", filled_cells: ["FP1#1", "FP1#2"] }));
  writeFileSync(join(dir, "batches", "b99.json.tmp"), "{}");

  const rs = run(RESUME, [root, "--json"]);
  assert.equal(rs.status, 0, rs.stderr);
  const j = JSON.parse(rs.stdout);
  assert.ok(j.recovery.discarded.includes("b02"));
  assert.ok(j.next_batches.includes("b02"));
  assert.equal(j.partial_batches[0].filled, 2);
  assert.equal(existsSync(join(dir, "batches", "b99.json.tmp")), false);

  commitBatch(dir, { payload: done("b02", "D2", [{ kind: "dimension", id: "D2" }]) });
  commitBatch(dir, { payload: { batch: "b03", group: "a3", unit: "FP1", kind: "incremental", status: "done", covers: [{ kind: "dimension", id: "D3" }], findings: [], coverage_note: "done" } });
  const resumed = loadState(dir).coverage;

  const root2 = mkdtempSync(join(tmpdir(), "dcr-t14b-"));
  const dir2 = mk(root2, "2026-01-01-design", three);
  commitBatch(dir2, { payload: done("b01", "D1", [{ kind: "dimension", id: "D1" }]) });
  commitBatch(dir2, { payload: done("b02", "D2", [{ kind: "dimension", id: "D2" }]) });
  commitBatch(dir2, { payload: { batch: "b03", group: "a3", unit: "FP1", kind: "incremental", status: "done", covers: [{ kind: "dimension", id: "D3" }], findings: [], coverage_note: "done" } });
  assert.deepEqual(resumed, loadState(dir2).coverage);
});

test("G17：单批 findings >15 拒绝", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-caps-"));
  const dir = mk(root, "2026-01-01-design", [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }]);
  const findings = Array.from({ length: 16 }, (_, i) => ({
    id: `F-${String(i + 1).padStart(3, "0")}`, level: "P1", title: "x", location: "a.md:1",
    mechanism: "m", counterexample: "c", sources: [{ batch: "b01", id: "x", level: "P1" }]
  }));
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings, coverage_note: "x" } });
  const g = run(GATE, [dir, "--json"]);
  const j = JSON.parse(g.stdout);
  const g17 = j.results.find((r) => r.id.startsWith("G17"));
  assert.equal(g17.ok, false);
  assert.match(g17.detail, /16 > 15/);
});
