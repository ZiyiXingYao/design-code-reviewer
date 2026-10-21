import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initReview, updateState } from "../skills/design-review/scripts/lib/review-state.mjs";
import { workDir, auditDir } from "../skills/design-review/scripts/lib/layout.mjs";
import { syncForReview, listEntries, closeEntry, loadLedger } from "../skills/design-review/scripts/lib/ledger.mjs";

const LEDGER = new URL("../skills/design-review/scripts/ledger.mjs", import.meta.url).pathname;

function root() {
  const r = mkdtempSync(join(tmpdir(), "dcr-ledger-"));
  return r;
}
function writeJson(p, o) { writeFileSync(p, JSON.stringify(o, null, 2)); }

function review(rootDir, id, findings) {
  const dir = workDir(rootDir, id);
  initReview(dir, {
    type: "design", reviewId: id, root: rootDir,
    expected: { dimension: 15 }, steps: ["A0"],
    batches: [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }]
  });
  updateState(dir, (s) => { s.state = "reported"; s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  writeJson(join(dir, "05-findings.json"), { findings });
  writeJson(join(dir, "06-accusations.json"), {
    accusations: findings.map((f, i) => ({ id: `A-${i + 1}`, source_findings: [f.id], location: f.location, mechanism: "m", consequence: "c" }))
  });
  writeJson(join(dir, "08-verdict.json"), {
    verdicts: findings.map((f, i) => ({ accusation_id: `A-${i + 1}`, decision: "upheld", level: f.level, reason: "r" })),
    stats: { accusations: findings.length, upheld: findings.length, dismissed: 0, unresolved: 0, valid_defense: 0 }
  });
  return dir;
}

const f = (id, title, loc, level = "P1") => ({
  id, level, title, location: loc, mechanism: "m", counterexample: "c",
  sources: [{ batch: "b01", id, level }]
});

test("同一缺陷换行号仍归同一条；重复 sync 不新增", () => {
  const r = root();
  const d1 = review(r, "2026-01-01-design", [f("F-001", "路径未校验", "03-资源模块.md:83")]);
  const s1 = syncForReview(r, d1);
  assert.equal(s1.created, 1);

  const d2 = review(r, "2026-01-02-design", [f("F-001", "路径未校验", "03-资源模块.md:95")]);
  const s2 = syncForReview(r, d2);
  assert.equal(s2.created, 0);
  assert.equal(s2.updated, 1);
  assert.equal(loadLedger(r).entries.length, 1);
});

test("新缺陷入库；close 改状态并记历史", () => {
  const r = root();
  const d1 = review(r, "2026-01-01-design", [f("F-001", "路径未校验", "a.md:1")]);
  syncForReview(r, d1);
  const d2 = review(r, "2026-01-02-design", [f("F-001", "路径未校验", "a.md:1"), f("F-002", "订单无幂等", "b.md:2")]);
  const s2 = syncForReview(r, d2);
  assert.equal(s2.created, 1);
  assert.equal(loadLedger(r).entries.length, 2);

  const e = listEntries(r, "open").entries.find((x) => x.title === "订单无幂等");
  const closed = closeEntry(r, e.id, "fixed", "已在 0.4 修复");
  assert.equal(closed.status, "fixed");
  assert.equal(closed.history.at(-1).action, "fixed");
  assert.equal(listEntries(r, "open").entries.length, 1);
});

test("approve 会同步账本；gate G15 在 closed 缺账本时拒绝", () => {
  const r = root();
  const dir = review(r, "2026-01-01-design", [f("F-001", "路径未校验", "a.md:1")]);
  writeFileSync(join(dir, "REPORT.md"), "# r\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# s\n");
  writeFileSync(join(dir, "gate-result.md"), "- 结论：通过\n");
  const r1 = spawnSync(process.execPath, [new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname, "approve", dir, "--reviewer", "测试"], { encoding: "utf8" });
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  assert.ok(existsSync(join(r, ".design-code-reviewer", "ledger.yaml")));
  assert.ok(loadLedger(r).entries.length >= 1);
});

test("ledger CLI list / close", () => {
  const r = root();
  const d = review(r, "2026-01-01-design", [f("F-001", "路径未校验", "a.md:1")]);
  syncForReview(r, d);
  const list = spawnSync(process.execPath, [LEDGER, r, "list", "--json"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  const j = JSON.parse(list.stdout);
  assert.equal(j.entries.length, 1);
  const close = spawnSync(process.execPath, [LEDGER, r, "close", j.entries[0].id, "--status", "accepted", "--reason", "风险接受"], { encoding: "utf8" });
  assert.equal(close.status, 0, close.stderr);
  assert.equal(loadLedger(r).entries[0].status, "accepted");
});

test("G15：closed 但未同步账本时 gate 拒绝", () => {
  const r = root();
  const dir = review(r, "2026-01-01-design", [f("F-001", "路径未校验", "a.md:1")]);
  writeFileSync(join(dir, "REPORT.md"), "# r\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# s\n");
  updateState(dir, (s) => { s.state = "closed"; s.report = { dir: ".", files: ["REPORT.md", "SUMMARY.md"] }; });
  const g = spawnSync(process.execPath, [new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname, dir, "--json"], { encoding: "utf8" });
  const j = JSON.parse(g.stdout);
  const g15 = j.results.find((x) => x.id.startsWith("G15"));
  assert.equal(g15.ok, false);
  assert.match(g15.detail, /未同步/);
});
