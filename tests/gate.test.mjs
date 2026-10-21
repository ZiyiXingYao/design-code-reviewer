import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scaffold, tmpReviewDir, putBatch, writeVerdicts, writeReports } from "./helpers.mjs";
import { loadState, saveState } from "../skills/design-review/scripts/lib/review-state.mjs";

const GATE = new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname;

function runGate(dir) {
  const r = spawnSync(process.execPath, [GATE, dir, "--json"], { encoding: "utf8" });
  return { code: r.status, out: JSON.parse(r.stdout || "{}") };
}

function finding(overrides = {}) {
  return {
    id: "F-001", level: "P0", title: "部分失败未定义", location: "09-任务模块.md:365",
    mechanism: "批量删除第 3 条失败时无语义", counterexample: "给定 5 台设备，第 3 台不存在 → 前 2 台已删且未回滚",
    trigger: "3 台以上批量删除", ...overrides
  };
}

function build(dir, opts = {}) {
  scaffold(dir, { reviewType: "impl", steps: ["B0"], expected: { lens: 20 },
    batches: [{ id: "b01", group: "s3", unit: "镜头2", kind: "discrete" }], bench: "L2" });
  putBatch(dir, {
    batch: "b01", group: "s3", unit: "镜头2", kind: "discrete", status: "done",
    covers: Array.from({ length: 20 }, (_, i) => ({ kind: "lens", id: String(i + 1) })), findings: opts.findings ?? [finding()]
  });
  writeVerdicts(dir, {
    accusations: [{ id: "A-001", source_findings: ["F-001"], location: "x", mechanism: "m", consequence: "c" }],
    defenses: [{ accusation_id: "A-001", claim: "invalid", location: "-", mechanism: "-" }],
    verdicts: [{ accusation_id: "A-001", decision: opts.decision ?? "upheld", level: opts.level ?? "P0", reason: opts.reason ?? "机制成立" }],
    stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 1 }
  });
  writeReports(dir, { bench: opts.bench ?? "L2", extra: opts.extra ?? "" });
  return dir;
}

test("完整产物通过 gate", () => {
  const dir = build(tmpReviewDir());
  const r = runGate(dir);
  assert.equal(r.code, 0, JSON.stringify(r.out.results.filter((x) => !x.ok), null, 2));
});

test("缺一张场景卡：gate 拒绝并在 G3 列出", () => {
  const dir = tmpReviewDir();
  scaffold(dir, { steps: ["A4"], expected: { scenario: 17 }, batches: [{ id: "b01", group: "s2", unit: "6卡", kind: "discrete" }] });
  putBatch(dir, { batch: "b01", group: "s2", unit: "6卡", kind: "discrete", status: "done",
    covers: [{ kind: "scenario", id: "F1" }], findings: [], coverage_note: "ok" });
  writeVerdicts(dir, { accusations: [], defenses: [], verdicts: [], stats: { accusations: 0, upheld: 0, dismissed: 0, unresolved: 0, valid_defense: 0 } });
  writeReports(dir);
  const r = runGate(dir);
  assert.equal(r.code, 1);
  const g3 = r.out.results.find((x) => x.id.startsWith("G3"));
  assert.equal(g3.ok, false);
  assert.match(g3.detail, /scenario 1\/17/);
});

test("L0 报告出现「符合设计」：gate 拒绝", () => {
  const dir = build(tmpReviewDir(), { bench: "L0", extra: "实现符合设计。" });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.equal(r.out.results.find((x) => x.id.startsWith("G7")).ok, false);
});

test("L0 的 SUMMARY 出现「符合设计」：gate 拒绝", () => {
  const dir = build(tmpReviewDir(), { bench: "L0" });
  const sp = join(dir, "SUMMARY.md");
  writeFileSync(sp, readFileSync(sp, "utf8").replace("有条件通过", "实现符合设计"));
  const r = runGate(dir);
  assert.equal(r.code, 1);
  const g7 = r.out.results.find((x) => x.id.startsWith("G7"));
  assert.equal(g7.ok, false);
  assert.match(g7.detail, /SUMMARY/);
});

test("折中裁断：gate 拒绝", () => {
  const dir = build(tmpReviewDir(), { reason: "部分成立，有一定道理" });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.equal(r.out.results.find((x) => x.id.startsWith("G5")).ok, false);
});

test("P0 未经对抗：gate 拒绝", () => {
  const dir = build(tmpReviewDir(), { findings: [finding({ id: "F-001" }), finding({ id: "F-002" })] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  const g5 = r.out.results.find((x) => x.id.startsWith("G5"));
  assert.match(g5.detail, /F-002/);
});

test("报告引用不存在的发现编号：gate 拒绝", () => {
  const dir = build(tmpReviewDir(), { extra: "另见 F-999。" });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.equal(r.out.results.find((x) => x.id.startsWith("G8")).ok, false);
});

test("去重晚于对抗：G13 提示不通过（非阻断）", () => {
  const dir = build(tmpReviewDir());
  const st = loadState(dir);
  st.steps["B6.5"] = { status: "done", at: "2026-01-02T00:00:00Z" };
  st.steps["B7a"] = { status: "done", at: "2026-01-01T00:00:00Z" };
  saveState(dir, st);
  const r = runGate(dir);
  const g13 = r.out.results.find((x) => x.id.startsWith("G13"));
  assert.equal(g13.ok, false);
  assert.equal(g13.blocking, false);
});

test("stats 与裁断不符：gate 拒绝", () => {
  const dir = build(tmpReviewDir());
  const p = join(dir, "08-verdict.json");
  const v = JSON.parse(readFileSync(p, "utf8"));
  v.stats.upheld = 5;
  writeFileSync(p, JSON.stringify(v));
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.equal(r.out.results.find((x) => x.id.startsWith("G12")).ok, false);
});

test("reported 但成品未交付：G14 提示不通过（非阻断）", () => {
  const dir = build(tmpReviewDir());
  const r = runGate(dir);
  assert.equal(r.code, 0, "reported 阶段不该阻断历史流程");
  const g14 = r.out.results.find((x) => x.id.startsWith("G14"));
  assert.equal(g14.ok, false);
  assert.equal(g14.blocking, false);
  assert.match(g14.detail, /state.report.dir/);
});

test("closed 但交付目录是旧稿：G14 拒绝", () => {
  const dir = build(tmpReviewDir());
  const out = join(dir, "specs", "audit", "2026-01-01-impl");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "REPORT.md"), "# 旧稿\n");
  writeFileSync(join(out, "SUMMARY.md"), readFileSync(join(dir, "SUMMARY.md"), "utf8"));
  writeFileSync(join(out, "task.md"), "# 任务\n");
  const st = loadState(dir);
  st.root = dir;
  st.state = "closed";
  st.report = { dir: "specs/audit/2026-01-01-impl", files: ["REPORT.md", "SUMMARY.md", "task.md"] };
  saveState(dir, st);

  const r = runGate(dir);
  assert.equal(r.code, 1);
  const g14 = r.out.results.find((x) => x.id.startsWith("G14"));
  assert.equal(g14.ok, false);
  assert.match(g14.detail, /REPORT.md 与工作目录不一致/);
});
