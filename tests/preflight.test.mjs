import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../skills/impl-review/scripts/preflight.mjs", import.meta.url).pathname;

function base() {
  const dir = mkdtempSync(join(tmpdir(), "dcr-pf-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "--allow-empty", "-qm", "init"], { cwd: dir });
  return dir;
}

function withDesign(dir, state = "closed") {
  mkdirSync(join(dir, "specs", "design"), { recursive: true });
  mkdirSync(join(dir, ".brainstorming-archify"), { recursive: true });
  for (const f of ["00-接口契约.md", "01-架构设计.md", "02-实体与数据设计.md", "03-模块.md"]) {
    writeFileSync(join(dir, "specs", "design", f), "# x\n");
  }
  writeFileSync(join(dir, "specs", "design", "task.md"), "- [ ] T1\n");
  writeFileSync(join(dir, ".brainstorming-archify", "state.yaml"), `schema_version: 1
state: "${state}"
files:
  - path: "specs/design/00-接口契约.md"
    status: "confirmed"
reopens: []
`);
}

function run(dir, extra = []) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, "--json", ...extra], { encoding: "utf8" });
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null };
}

test("无设计 -> L0", () => {
  const dir = base();
  const r = run(dir);
  assert.equal(r.out.bench, "L0");
});

test("设计齐全且 closed -> L2（不看评审报告）", () => {
  const dir = base();
  withDesign(dir);
  const r = run(dir);
  assert.equal(r.out.bench, "L2");
});

test("设计齐全但未冻结 -> L1", () => {
  const dir = base();
  withDesign(dir, "draft");
  const r = run(dir);
  assert.equal(r.out.bench, "L1");
  assert.ok(r.out.reasons.some((x) => x.includes("未冻结")));
});

test("设计评审报告不再影响基准等级", () => {
  const dir = base();
  withDesign(dir, "draft");
  mkdirSync(join(dir, "specs", "audit", "2026-01-01-design"), { recursive: true });
  writeFileSync(join(dir, "specs", "audit", "2026-01-01-design", "REPORT.md"), "## 交接块\n- C-1 x\n");
  const r = run(dir);
  assert.equal(r.out.bench, "L1");
  assert.equal(r.out.handoff, undefined);
});

test("--require-design 在 L0 时拒绝运行并写 preflight-failed.md", () => {
  const dir = base();
  const r = run(dir, ["--require-design"]);
  assert.equal(r.status, 1);
  assert.ok(existsSync(join(dir, "preflight-failed.md")));
});
