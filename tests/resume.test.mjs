import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initReview, updateState, appendProgress } from "../skills/design-review/scripts/lib/review-state.mjs";
import { makeReviewId, workDir, auditDir } from "../skills/design-review/scripts/lib/layout.mjs";

const RESUME = new URL("../skills/design-review/scripts/resume.mjs", import.meta.url).pathname;
const STATE = new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname;

function root() { return mkdtempSync(join(tmpdir(), "dcr-resume-")); }

function writeJson(path, obj) { writeFileSync(path, JSON.stringify(obj, null, 2)); }

function finding(id, level) {
  return {
    id, level, title: "示例缺陷", location: "07-设备模块.md:100",
    mechanism: "缺少校验", counterexample: "给定非法输入 → 越界 → 因为没有校验",
    sources: [{ batch: "b01", id, level }]
  };
}

function makeReview(r, id, { closed = false, batches = 2 } = {}) {
  const dir = workDir(r, id);
  const plan = {
    expected: { dimension: batches },
    steps: ["A0"],
    batches: Array.from({ length: batches }, (_, i) => ({ id: `b0${i + 1}`, group: "s1", unit: `D${i + 1}`, kind: "discrete" }))
  };
  initReview(dir, { type: "design", reviewId: id, root: r, expected: plan.expected, steps: plan.steps, batches: plan.batches });
  updateState(dir, (st) => {
    st.steps.A0 = { status: "done", at: new Date().toISOString() };
    if (closed) st.state = "closed";
  });
  return dir;
}

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("同日同类型 id 递增", () => {
  const r = root();
  const id1 = makeReviewId(r, "design");
  mkdirSync(join(r, ".design-code-reviewer", id1), { recursive: true });
  const id2 = makeReviewId(r, "design");
  assert.notEqual(id1, id2);
  assert.match(id2, /-2$/);
});

test("resume --list 空目录", () => {
  const r = root();
  const out = run(RESUME, [r, "--list"]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /无评审|id/);
});

test("一个未完成：自动恢复并给出下一批", () => {
  const r = root();
  makeReview(r, "2026-01-01-design");
  const out = run(RESUME, [r, "--json"]);
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.equal(j.review_id, "2026-01-01-design");
  assert.deepEqual(j.next_batches, ["b01", "b02"]);
});

test("多个未完成：要求 --id 选择", () => {
  const r = root();
  makeReview(r, "2026-01-01-design");
  makeReview(r, "2026-01-02-design");
  const out = run(RESUME, [r]);
  assert.equal(out.status, 3);
  assert.match(out.stderr, /--id/);
  const picked = run(RESUME, [r, "--id", "2026-01-02-design", "--json"]);
  assert.equal(picked.status, 0);
  assert.equal(JSON.parse(picked.stdout).review_id, "2026-01-02-design");
});

test("已 closed：拒绝恢复", () => {
  const r = root();
  makeReview(r, "2026-01-01-design", { closed: true });
  const out = run(RESUME, [r, "--id", "2026-01-01-design"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /closed/);
});

test("approve：gate 未通过拒绝，通过后复制 3 件并 closed", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "REPORT.md"), "# report\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# summary\n");
  updateState(dir, (s) => { s.state = "reported"; });

  let out = run(STATE, ["approve", dir, "--reviewer", "测试"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /gate/);

  writeFileSync(join(dir, "gate-result.md"), "# gate 校验结果\n\n- 结论：通过\n");
  writeJson(join(dir, "05-findings.json"), { findings: [finding("F-001", "P0")] });
  writeJson(join(dir, "06-accusations.json"), { accusations: [{ id: "A-001", source_findings: ["F-001"], location: "x", mechanism: "m", consequence: "c" }] });
  writeJson(join(dir, "08-verdict.json"), { verdicts: [{ accusation_id: "A-001", decision: "upheld", level: "P0", reason: "r" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0 } });
  out = run(STATE, ["approve", dir, "--reviewer", "测试"]);
  assert.equal(out.status, 0, out.stderr);
  for (const f of ["REPORT.md", "SUMMARY.md", "task.md"]) {
    assert.ok(existsSync(join(auditDir(r, "2026-01-01-design"), f)), f);
  }
});

test("closed 后拒绝写批与步骤", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "REPORT.md"), "# report\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# summary\n");
  writeFileSync(join(dir, "gate-result.md"), "- 结论：通过\n");
  updateState(dir, (s) => { s.state = "reported"; });
  writeJson(join(dir, "05-findings.json"), { findings: [finding("F-001", "P0")] });
  writeJson(join(dir, "06-accusations.json"), { accusations: [{ id: "A-001", source_findings: ["F-001"], location: "x", mechanism: "m", consequence: "c" }] });
  writeJson(join(dir, "08-verdict.json"), { verdicts: [{ accusation_id: "A-001", decision: "upheld", level: "P0", reason: "r" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0 } });
  assert.equal(run(STATE, ["approve", dir, "--reviewer", "测试"]).status, 0);

  const step = run(STATE, ["step", dir, "--id", "A0", "--status", "running"]);
  assert.notEqual(step.status, 0);
  assert.match(step.stderr, /closed/);

  const payload = join(dir, "x.json");
  writeFileSync(payload, JSON.stringify({ batch: "b01", group: "s1", unit: "D1", kind: "discrete", status: "done", covers: [], findings: [], coverage_note: "x" }));
  const batch = run(STATE, ["batch", dir, "--payload", payload]);
  assert.notEqual(batch.status, 0);
  assert.match(batch.stderr, /closed/);
});

test("恢复对账：有日志无产物的批被丢弃并重跑", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  makeReview(r, "2026-01-02-design");
  // 给第一个评审写一条"b01 已开始"的日志，但没有任何批产物
  appendProgress(dir, { batch: "b01", status: "running", ts: new Date().toISOString() });
  const out = run(RESUME, [r, "--id", "2026-01-01-design", "--json"]);
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.ok(j.recovery.discarded.includes("b01"));
  assert.ok(j.next_batches.includes("b01"));
});

test("plan.json 被改动：拒绝恢复，--force 可覆盖", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ expected: { dimension: 1 }, steps: [], batches: [{ id: "b01", group: "s1", unit: "x", kind: "discrete" }] }));
  const out = run(RESUME, [r, "--id", "2026-01-01-design"]);
  assert.equal(out.status, 4);
  const forced = run(RESUME, [r, "--id", "2026-01-01-design", "--force", "--json"]);
  assert.equal(forced.status, 0, forced.stderr);
});

test("approve 缺 reviewer / 非 reported：拒绝", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "gate-result.md"), "- 结论：通过\n");
  writeFileSync(join(dir, "REPORT.md"), "# r\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# s\n");

  const noRev = run(STATE, ["approve", dir]);
  assert.equal(noRev.status, 1);
  assert.match(noRev.stderr, /reviewer/);

  updateState(dir, (s) => { s.state = "reported"; });
  writeJson(join(dir, "05-findings.json"), { findings: [finding("F-001", "P0")] });
  writeJson(join(dir, "06-accusations.json"), { accusations: [{ id: "A-001", source_findings: ["F-001"], location: "x", mechanism: "m", consequence: "c" }] });
  writeJson(join(dir, "08-verdict.json"), { verdicts: [{ accusation_id: "A-001", decision: "upheld", level: "P0", reason: "r" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0 } });
  const ok = run(STATE, ["approve", dir, "--reviewer", "测试"]);
  assert.equal(ok.status, 0, ok.stderr);

  const again = run(STATE, ["approve", dir, "--reviewer", "测试"]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /closed/);
});
