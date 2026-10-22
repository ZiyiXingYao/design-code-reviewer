import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/design-review/scripts/lib/yaml.mjs";
import { loadState, saveState } from "../skills/design-review/scripts/lib/review-state.mjs";
import { scaffold, tmpReviewDir, writeReports, writeVerdicts, putBatch } from "./helpers.mjs";

const STATE = new URL("../skills/design-review/scripts/state.mjs", import.meta.url).pathname;
const GATE = new URL("../skills/design-review/scripts/gate.mjs", import.meta.url).pathname;
const run = (s, a) => spawnSync(process.execPath, [s, ...a], { encoding: "utf8" });

function initArgs(root, mode, extra = []) {
  const plan = join(root, "plan.json");
  writeFileSync(plan, JSON.stringify({
    expected: { dimension: 1 },
    steps: ["A0"],
    batches: [{ id: "b01", group: "s1", unit: "u", kind: "discrete" }]
  }));
  return ["init", root, "--type", "design", "--plan", plan, "--mode", mode, ...extra];
}

test("init：design 默认 full，impl 默认 delta", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-mode-"));
  const out = run(STATE, ["init", root, "--type", "design", "--plan", (() => {
    const p = join(root, "p.json");
    writeFileSync(p, JSON.stringify({ expected: { dimension: 1 }, steps: ["A0"], batches: [{ id: "b01", group: "s1", unit: "u", kind: "discrete" }] }));
    return p;
  })()]);
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.equal(j.mode, "full");
  const st = parseYaml(readFileSync(join(root, ".design-code-reviewer", j.review_id, "state.yaml"), "utf8"));
  assert.equal(st.mode, "full");
  assert.equal(st.range, undefined);
});

test("init：delta 缺 --from 拒绝；给了区间则落盘", () => {
  const root = mkdtempSync(join(tmpdir(), "dcr-mode2-"));
  const bad = run(STATE, initArgs(root, "delta"));
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--from/);

  const ok = run(STATE, initArgs(root, "delta", ["--from", "abc1234", "--to", "def5678"]));
  assert.equal(ok.status, 0, ok.stderr);
  const j = JSON.parse(ok.stdout);
  assert.deepEqual(j.range, { from: "abc1234", to: "def5678" });
  const st = parseYaml(readFileSync(join(root, ".design-code-reviewer", j.review_id, "state.yaml"), "utf8"));
  assert.equal(st.mode, "delta");
  assert.equal(st.range.from, "abc1234");
});

test("G21：报告未声明模式 → 拒绝", () => {
  const dir = scaffold(tmpReviewDir(), { mode: "full" });
  putBatch(dir, { batch: "b01", group: "s1", unit: "维度D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [] });
  writeVerdicts(dir, { accusations: [], defenses: [], verdicts: [], stats: { accusations: 0, upheld: 0, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 0 } });
  writeReports(dir);
  const p = join(dir, "REPORT.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("评审模式：全量（工作区当前版本）\n", ""));
  const r = run(GATE, [dir, "--json"]);
  const g21 = JSON.parse(r.stdout).results.find((x) => x.id.startsWith("G21"));
  assert.equal(g21.ok, false);
  assert.match(g21.detail, /全量/);
});

test("G22：state 与 plan 模式不一致 → 拒绝", () => {
  const dir = scaffold(tmpReviewDir(), { mode: "full" });
  putBatch(dir, { batch: "b01", group: "s1", unit: "维度D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [] });
  writeVerdicts(dir, { accusations: [], defenses: [], verdicts: [], stats: { accusations: 0, upheld: 0, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 0 } });
  writeReports(dir);
  const st = loadState(dir);
  st.mode = "delta";
  st.range = { from: "abc1234", to: "HEAD" };
  saveState(dir, st);
  const r = run(GATE, [dir, "--json"]);
  const g22 = JSON.parse(r.stdout).results.find((x) => x.id.startsWith("G22"));
  assert.equal(g22.ok, false);
});
