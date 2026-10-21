import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const INSTALL = new URL("../install.mjs", import.meta.url).pathname;

test("--dry-run 不写盘且列出两个技能", () => {
  const dest = join(mkdtempSync(join(tmpdir(), "dcr-inst-")), "skills");
  const r = spawnSync(process.execPath, [INSTALL, "--dest", dest, "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /design/);
  assert.match(r.stdout, /impl/);
  assert.equal(existsSync(dest), false);
});

test("安装后可卸载，且成功安装不残留备份", () => {
  const dest = join(mkdtempSync(join(tmpdir(), "dcr-inst-")), "skills");
  const r1 = spawnSync(process.execPath, [INSTALL, "--dest", dest], { encoding: "utf8" });
  assert.equal(r1.status, 0, r1.stderr);
  assert.ok(existsSync(join(dest, "design-review", "SKILL.md")));
  assert.ok(existsSync(join(dest, "impl-review", "SKILL.md")));
  assert.ok(existsSync(join(dirname(dest), "commands", "review-resume.md")));
  assert.equal(readdirSync(dest).filter((n) => /\.(bak|new)-/.test(n)).length, 0);

  const r2 = spawnSync(process.execPath, [INSTALL, "--dest", dest, "--uninstall"], { encoding: "utf8" });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(existsSync(join(dest, "design-review")), false);
  assert.equal(existsSync(join(dirname(dest), "commands", "review-resume.md")), false);
});
