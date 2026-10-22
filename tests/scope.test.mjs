import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFloor } from "../skills/design-review/scripts/lib/plan-floor.mjs";
import { scaffold, tmpReviewDir, putBatch, writeVerdicts, writeReports } from "./helpers.mjs";

const SCOPE = new URL("../skills/design-review/scripts/scope.mjs", import.meta.url).pathname;
const GATE = new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname;
const run = (s, a, opts = {}) => spawnSync(process.execPath, [s, ...a], { encoding: "utf8", ...opts });
const git = (cwd, a) => spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8" });

function repo() {
  const root = mkdtempSync(join(tmpdir(), "dcr-scope-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "a@b"]);
  git(root, ["config", "user.name", "a"]);
  mkdirSync(join(root, "specs", "design"), { recursive: true });
  writeFileSync(join(root, "specs", "design", "00-接口契约.md"), "# 契约\n\n## 3 消息\n\n编号 9 入图，见 05-设备域.md。\n");
  writeFileSync(join(root, "specs", "design", "05-设备域.md"), "# 设备域\n\n## 3.1 状态机\n\nONLINE。\n\n## 3.8 扫描\n\n每 5s 扫描。\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "A"]);
  const from = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  writeFileSync(join(root, "specs", "design", "05-设备域.md"), "# 设备域\n\n## 3.1 状态机\n\nONLINE。\n\n## 3.8 扫描\n\n每 5s 扫描并清理。\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "B"]);
  const to = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  return { root, from, to };
}

test("scope：列出变更文件与受影响章节，并找出引用方", () => {
  const { root, from, to } = repo();
  const out = join(root, ".design-code-reviewer", "2026-01-01-design");
  const r = run(SCOPE, [root, "--from", from, "--to", to, "--out", out, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const sc = JSON.parse(r.stdout);
  const files = sc.files.map((f) => f.path);
  assert.deepEqual(files, ["specs/design/05-设备域.md"]);
  const sec = sc.files.find((f) => f.path.endsWith("05-设备域.md")).sections.map((s) => s.title);
  assert.ok(sec.some((t) => t.includes("3.8")), JSON.stringify(sec));
  assert.ok(sc.related.some((x) => x.path.endsWith("00-接口契约.md")), "未识别引用方");
  assert.ok(readFileSync(join(out, "scope.json"), "utf8").includes("delta"));
});

test("scope：区间内无设计变更以 3 退出", () => {
  const { root, to } = repo();
  const r = run(SCOPE, [root, "--from", to, "--to", to, "--out", join(root, "x")]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /无变更/);
});

test("delta 覆盖下限：必须声明受影响面与 scope_file", () => {
  const bad = checkFloor({ review_type: "design", mode: "delta", expected: { dimension: 0, scenario: 0, completeness: 0 } });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => p.includes("dimension")));
  const ok = checkFloor({
    review_type: "design", mode: "delta", scope_file: "scope.json",
    expected: { dimension: 3, scenario: 2, completeness: 20 }
  });
  assert.equal(ok.ok, true, ok.problems.join("；"));
});

test("G23：delta 缺 scope.json → 拒绝", () => {
  const dir = scaffold(tmpReviewDir(), { mode: "delta", from: "abc1234", to: "def5678" });
  putBatch(dir, { batch: "b01", group: "s1", unit: "维度D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [] });
  writeVerdicts(dir, { accusations: [], defenses: [], verdicts: [], stats: { accusations: 0, upheld: 0, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 0 } });
  writeReports(dir, { mode: "delta", from: "abc1234", to: "def5678" });
  const r = run(GATE, [dir, "--json"]);
  const g23 = JSON.parse(r.stdout).results.find((x) => x.id.startsWith("G23"));
  assert.equal(g23.ok, false);
  assert.match(g23.detail, /scope\.json/);
});
