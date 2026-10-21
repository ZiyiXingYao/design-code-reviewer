import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initReview, loadState, updateState } from "../skills/design-review/scripts/lib/review-state.mjs";
import { auditDir, workDir } from "../skills/design-review/scripts/lib/layout.mjs";

const STATE = new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname;
const ID = "2026-01-01-design";

function root() { return mkdtempSync(join(tmpdir(), "dcr-deliver-")); }

const run = (args) => spawnSync(process.execPath, [STATE, ...args], { encoding: "utf8" });

function makeReview(r, { state = "verifying" } = {}) {
  const dir = workDir(r, ID);
  const plan = {
    expected: { dimension: 1 },
    steps: ["A0"],
    batches: [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }]
  };
  initReview(dir, { type: "design", reviewId: ID, root: r, expected: plan.expected, steps: plan.steps, batches: plan.batches });
  updateState(dir, (st) => { st.state = state; st.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  return dir;
}

test("进入 reported 自动交付 REPORT/SUMMARY 到 specs/audit", () => {
  const r = root();
  const dir = makeReview(r);
  writeFileSync(join(dir, "REPORT.md"), "# 报告\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# 摘要\n");

  const out = run(["transition", dir, "reported", "--reason", "A7 完成"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /已交付/);

  const audit = auditDir(r, ID);
  for (const f of ["REPORT.md", "SUMMARY.md"]) {
    assert.ok(existsSync(join(audit, f)), `交付缺 ${f}`);
    assert.equal(readFileSync(join(audit, f), "utf8"), readFileSync(join(dir, f), "utf8"), f);
  }
  assert.ok(!existsSync(join(audit, "task.md")), "task.md 必须等批准后才生成");

  const s = loadState(dir);
  assert.equal(s.state, "reported");
  assert.deepEqual(s.report.files, ["REPORT.md", "SUMMARY.md"]);
  assert.equal(s.report.dir, "specs/audit/" + ID);
  assert.ok(s.report.delivered_at);
});

test("缺 REPORT.md：拒绝进入 reported，且不创建交付目录", () => {
  const r = root();
  const dir = makeReview(r);
  writeFileSync(join(dir, "SUMMARY.md"), "# 摘要\n");

  const out = run(["transition", dir, "reported"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /REPORT\.md/);
  assert.ok(!existsSync(auditDir(r, ID)), "失败时不应留下空交付目录");
  assert.equal(loadState(dir).state, "verifying");
});

test("deliver：报告修订后重新交付，交付目录与工作副本一致", () => {
  const r = root();
  const dir = makeReview(r);
  writeFileSync(join(dir, "REPORT.md"), "# 报告 v1\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# 摘要 v1\n");
  assert.equal(run(["transition", dir, "reported"]).status, 0);

  writeFileSync(join(dir, "REPORT.md"), "# 报告 v2（答复人工提问后修订）\n");
  const out = run(["deliver", dir]);
  assert.equal(out.status, 0, out.stderr);

  const audit = auditDir(r, ID);
  assert.equal(readFileSync(join(audit, "REPORT.md"), "utf8"), "# 报告 v2（答复人工提问后修订）\n");
  assert.equal(readFileSync(join(audit, "SUMMARY.md"), "utf8"), "# 摘要 v1\n");
  assert.equal(loadState(dir).state, "reported", "deliver 不改变状态");
});

test("closed 后 deliver 拒绝覆盖定稿", () => {
  const r = root();
  const dir = makeReview(r, { state: "closed" });
  writeFileSync(join(dir, "REPORT.md"), "# 报告\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# 摘要\n");

  const out = run(["deliver", dir]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /closed/);
});
