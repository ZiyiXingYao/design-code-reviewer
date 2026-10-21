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

test("promote：gate 未通过拒绝，通过后复制并 closed", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "REPORT.md"), "# report\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# summary\n");

  let out = run(STATE, ["promote", dir]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /gate/);

  writeFileSync(join(dir, "gate-result.md"), "# gate 校验结果\n\n- 结论：通过\n");
  out = run(STATE, ["promote", dir]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(auditDir(r, "2026-01-01-design"), "REPORT.md")));
  assert.ok(existsSync(join(auditDir(r, "2026-01-01-design"), "SUMMARY.md")));
});

test("closed 后拒绝写批与步骤", () => {
  const r = root();
  const dir = makeReview(r, "2026-01-01-design");
  writeFileSync(join(dir, "REPORT.md"), "# report\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# summary\n");
  writeFileSync(join(dir, "gate-result.md"), "- 结论：通过\n");
  assert.equal(run(STATE, ["promote", dir]).status, 0);

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
