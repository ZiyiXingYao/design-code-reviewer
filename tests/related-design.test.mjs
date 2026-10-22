import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCOPE = new URL("../skills/impl-review/scripts/related-design.mjs", import.meta.url).pathname;
const run = (a) => spawnSync(process.execPath, [SCOPE, ...a], { encoding: "utf8" });
const git = (cwd, a) => spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8" });

function repo() {
  const root = mkdtempSync(join(tmpdir(), "dcr-rd-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "a@b"]);
  git(root, ["config", "user.name", "a"]);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "specs", "design"), { recursive: true });
  writeFileSync(join(root, "src", "order_service.cpp"), "int OrderService::Create() { return 0; }\n");
  writeFileSync(join(root, "src", "misc.cpp"), "int Helper() { return 1; }\n");
  writeFileSync(join(root, "specs", "design", "03-订单模块.md"), "# 订单\n\n## 3.1 创建\n\nOrderService 负责创建订单。\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "A"]);
  const from = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  writeFileSync(join(root, "src", "order_service.cpp"), "int OrderService::Create() { return 1; }\n");
  writeFileSync(join(root, "src", "misc.cpp"), "int Helper() { return 2; }\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "B"]);
  const to = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  return { root, from, to };
}

test("related-design：命中设计章节，未覆盖的代码记为缺口", () => {
  const { root, from, to } = repo();
  const out = join(root, ".design-code-reviewer", "2026-01-01-impl");
  const r = run([root, "--from", from, "--to", to, "--out", out, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.code_files.map((f) => f.path).sort(), ["src/misc.cpp", "src/order_service.cpp"]);
  const doc = j.design.find((d) => d.path.endsWith("03-订单模块.md"));
  assert.ok(doc, "未命中设计文档");
  assert.ok(doc.sections.some((s) => s.title.includes("3.1")));
  assert.ok(j.unmatched.includes("src/misc.cpp"), "未覆盖文件应进 unmatched");
});
