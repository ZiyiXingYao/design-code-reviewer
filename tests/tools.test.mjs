import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const run = (rel, args) => spawnSync(process.execPath, [join(ROOT, rel), ...args], { encoding: "utf8" });
const fixture = join(ROOT, "examples", "mini-design");

test("T3 复现性：同输入两次输出逐字节一致", () => {
  const cases = [
    ["skills/design-review/scripts/docstat.mjs", [fixture, "--json"]],
    ["skills/impl-review/scripts/claims.mjs", [fixture, "--json"]],
    ["skills/impl-review/scripts/smells.mjs", [fixture, "--json"]]
  ];
  for (const [script, args] of cases) {
    const a = run(script, args);
    const b = run(script, args);
    assert.equal(a.status, 0, script + a.stderr);
    assert.equal(a.stdout, b.stdout, `${script} 两次输出不一致`);
  }
});

test("T9 隔离：任务书里的禁令齐全", () => {
  const red = readFileSync(join(ROOT, "skills/design-review/adversarial/red.md"), "utf8");
  const blue = readFileSync(join(ROOT, "skills/design-review/adversarial/blue.md"), "utf8");
  const judge = readFileSync(join(ROOT, "skills/design-review/adversarial/judge.md"), "utf8");

  assert.match(red, /Forbidden/);
  assert.match(red, /07-defense\.json/);
  assert.match(blue, /structured accusation/);
  assert.match(blue, /Forbidden/);
  assert.match(judge, /Forbidden/);
  assert.match(judge, /raw/);
});
