import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initReview, updateState, commitBatch, appendProgress, loadState } from "../skills/design-review/scripts/lib/review-state.mjs";
import { workDir } from "../skills/design-review/scripts/lib/layout.mjs";
import { parseYaml } from "../skills/design-review/scripts/lib/yaml.mjs";
import { syncForReview, loadLedger, closeEntry } from "../skills/design-review/scripts/lib/ledger.mjs";

const STATE = new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname;
const RESUME = new URL("../skills/design-review/scripts/resume.mjs", import.meta.url).pathname;
const GATE = new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname;
const CLAIMS = new URL("../skills/impl-review/scripts/claims.mjs", import.meta.url).pathname;
const run = (s, a, opts = {}) => spawnSync(process.execPath, [s, ...a], { encoding: "utf8", ...opts });

function mkReview(root, id, type = "design", expected = { dimension: 15 }) {
  const dir = workDir(root, id);
  initReview(dir, {
    type, reviewId: id, root, expected, steps: ["A0"],
    batches: [{ id: "b01", group: "s1", unit: "x", kind: "discrete" }]
  });
  updateState(dir, (s) => { s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  return dir;
}
const J = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));

test("两份 gate 检查项一致（G1–G19）", () => {
  const ids = (p) => [...readFileSync(p, "utf8").matchAll(/check\("(G[0-9]+[a-z]?)/g)].map((m) => m[1]).sort();
  const a = ids("/code/design-code-reviewer/skills/design-review/scripts/gate.mjs");
  const b = ids("/code/design-code-reviewer/skills/impl-review/scripts/gate.mjs");
  assert.deepEqual(a, b);
  assert.ok(a.includes("G15") && a.includes("G16") && a.includes("G17"));
});

test("stats：defended 与 valid_defense_rate、升级率用首轮分母", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-stats-"));
  const dir = mkReview(root, "2026-01-01-design");
  const out = run(STATE, ["stats", dir, "--accusations", "10", "--upheld", "4", "--dismissed", "5", "--unresolved", "1", "--valid-defense", "3", "--defended", "8", "--escalated", "2", "--first-round", "10"]);
  assert.equal(out.status, 0, out.stderr);
  const st = parseYaml(readFileSync(join(dir, "state.yaml"), "utf8"));
  assert.equal(st.adversarial.stats.defended, 8);
  assert.equal(st.adversarial.rates.valid_defense_rate, 0.375);
  assert.equal(st.adversarial.rates.escalation_rate, 0.2);
});

test("G18：结论写「通过」但有 P0 → 拒绝", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-g18-"));
  const dir = mkReview(root, "2026-01-01-design");
  updateState(dir, (s) => { s.state = "reported"; });
  writeFileSync(join(dir, "REPORT.md"), "# r\nGate D 结论：通过\n发现 F-001。\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# s\n## 一句话结论\n通过\n## 最该关心的三件事\n1\n## 必办清单\n1\n## 已接受的风险\n无\n## 数字概览\n成立率 1\n## 本次没看什么\n无\n");
  J(join(dir, "05-findings.json"), { findings: [{ id: "F-001", level: "P0", title: "x", location: "a.md:1", mechanism: "m", counterexample: "c", sources: [{ batch: "b01", id: "F-001", level: "P0" }] }] });
  J(join(dir, "06-accusations.json"), { accusations: [{ id: "A-1", source_findings: ["F-001"], location: "a", mechanism: "m", consequence: "c" }] });
  J(join(dir, "07-defense.json"), { defenses: [{ accusation_id: "A-1", claim: "admit", location: "-", mechanism: "-" }] });
  J(join(dir, "08-verdict.json"), { verdicts: [{ accusation_id: "A-1", decision: "upheld", level: "P0", reason: "r" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 1 } });
  const out = run(GATE, [dir, "--json"]);
  const j = JSON.parse(out.stdout);
  const g18 = j.results.find((x) => x.id.startsWith("G18"));
  assert.equal(g18.ok, false);
});

test("G19：impl 子模块未检出且未声明影响 → 拒绝", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-g19-"));
  const dir = mkReview(root, "2026-01-01-impl", "impl", { lens: 20 });
  updateState(dir, (s) => { s.state = "reported"; });
  writeFileSync(join(dir, "REPORT.md"), "# r\n基准：L1\n");
  writeFileSync(join(dir, "SUMMARY.md"), "# s\n## 一句话结论\nL1\n## 最该关心的三件事\n1\n## 必办清单\n1\n## 已接受的风险\n无\n## 数字概览\n成立率 1\n## 本次没看什么\n无\n");
  J(join(dir, "preflight.json"), { failures: ["子模块未检出"] });
  const out = run(GATE, [dir, "--json"]);
  const j = JSON.parse(out.stdout);
  const g19 = j.results.find((x) => x.id.startsWith("G19"));
  assert.equal(g19.ok, false);
});

test("resume：HEAD 与基线不一致时拒绝，--force 放行", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-head-"));
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "--allow-empty", "-qm", "init"], { cwd: root });
  const dir = mkReview(root, "2026-01-01-design");
  updateState(dir, (s) => { s.baseline = { commit: "deadbee", design_state: "closed", reopen_count: 0, bench: "" }; });
  const bad = run(RESUME, [root, "--id", "2026-01-01-design"]);
  assert.equal(bad.status, 5);
  const ok = run(RESUME, [root, "--id", "2026-01-01-design", "--force", "--json"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("恢复：心跳超时与 sha 篡改被识别", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-recover-"));
  const dir = mkReview(root, "2026-01-01-design", "design", { dimension: 1 });
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "x", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [], coverage_note: "x" } });
  // 篡改批产物但保留旧的 sha 记录
  const before = readFileSync(join(dir, "batches", "b01.json"), "utf8");
  writeFileSync(join(dir, "batches", "b01.json"), before.replace('"done"', '"done" '));
  const out = run(RESUME, [root, "--id", "2026-01-01-design", "--force", "--json"]);
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.ok(j.recovery.discarded.includes("b01"));
});

test("ledger：sync 记 reviews，accepted 记接受人与补偿", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-ledger-"));
  const dir = mkReview(root, "2026-01-01-design");
  J(join(dir, "05-findings.json"), { findings: [{ id: "F-001", level: "P1", title: "x", location: "a.md:1", mechanism: "m", counterexample: "c", sources: [{ batch: "b01", id: "F-001", level: "P1" }] }] });
  J(join(dir, "06-accusations.json"), { accusations: [{ id: "A-1", source_findings: ["F-001"], location: "a", mechanism: "m", consequence: "c" }] });
  J(join(dir, "08-verdict.json"), { verdicts: [{ accusation_id: "A-1", decision: "upheld", level: "P1", reason: "r" }], stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 1 } });
  syncForReview(root, dir);
  const l = loadLedger(root);
  assert.equal(l.reviews.length, 1);
  assert.equal(l.reviews[0].p1, 1);
  const e = closeEntry(root, l.entries[0].id, "accepted", "暂不修", { by: "张三", compensation: "加监控" });
  assert.equal(e.acceptance.by, "张三");
  assert.equal(e.acceptance.compensation, "加监控");
});

test("claims：交接块 C-n 进入断言集并标 unverifiable", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-fix-claims-"));
  mkdirSync(join(root, "specs", "design"), { recursive: true });
  mkdirSync(join(root, "specs", "audit", "2026-01-01-design"), { recursive: true });
  writeFileSync(join(root, "specs", "design", "00-接口契约.md"), "## 总则\n\n`OrderId`\n");
  writeFileSync(join(root, "specs", "audit", "2026-01-01-design", "REPORT.md"), "## 交接块\n\n- C-1 主实体可跨分区 → 状态键按分区聚合\n");
  const out = run(CLAIMS, [root, "--json"]);
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.ok(j.assertions.some((a) => a.kind === "constraint" && a.unverifiable));
});
