import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../skills/impl/scripts/smells.mjs", import.meta.url).pathname;

function project() {
  const dir = mkdtempSync(join(tmpdir(), "dcr-smells-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  return dir;
}

function run(dir) {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8" });
  return JSON.parse(r.stdout);
}

const { spawnSync } = await import("node:child_process");
const runX = (dir) => {
  const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8" });
  return JSON.parse(r.stdout);
};

const PROC = `void handle(const Msg& m) {
  switch (m.type) {
    case 1: doA(); break;
    case 2: doB(); break;
    default: break;
  }
  if (m.type == 3) doC();
}`;

const BLOCK = `int calc(int x) {
  int a = x + 1;
  int b = a * 2;
  int c = b - 3;
  int d = c / 4;
  int e = d + 5;
  int f = e * 6;
  int g = f - 7;
  int h = g / 8;
  int i = h + 9;
  int j = i * 10;
  int k = j - 11;
  int l = k / 12;
  int m = l + 13;
  int n = m * 14;
  return n;
}`;

test("命中重复分派、重复块、轮询、概念漂移、过度设计", () => {
  const dir = project();
  for (const n of ["a.cpp", "b.cpp", "c.cpp"]) writeFileSync(join(dir, "src", n), PROC + "\n\n" + BLOCK);
  writeFileSync(join(dir, "src", "poll.cpp"), `void f() {
  while (running) {
    sleep(1);
  }
}`);
  writeFileSync(join(dir, "src", "types.h"), `struct Pose2D {};
struct PoseState {};
class IOnly { public: virtual void Run() = 0; };
class Only : public IOnly { public: void Run() override {} };`);

  const out = runX(dir);
  const kinds = new Set(out.signals.map((s) => s.signal));
  assert.ok(kinds.has("repeated-dispatch"), JSON.stringify(out.signals));
  assert.ok(kinds.has("duplicate-block"));
  assert.ok(kinds.has("sleep-polling"));
  assert.ok(kinds.has("concept-drift"));
  assert.ok(kinds.has("over-design"));
});

test("无信号时不输出（不制造噪声）", () => {
  const dir = project();
  writeFileSync(join(dir, "src", "plain.cpp"), "int add(int a, int b) { return a + b; }\n");
  const out = runX(dir);
  assert.equal(out.signals.length, 0);
});
