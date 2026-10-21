import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../skills/design-review/scripts/docstat.mjs", import.meta.url).pathname;

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "dcr-docstat-"));
  mkdirSync(join(dir, "specs", "design"), { recursive: true });
  mkdirSync(join(dir, ".brainstorming-archify", "change-lists"), { recursive: true });
  writeFileSync(join(dir, ".brainstorming-archify", "change-lists", "20260101T000000Z-x.md"), "# 轮次\n## 关键决策\n- D1 选 X\n");
  writeFileSync(join(dir, ".brainstorming-archify", "state.yaml"), `schema_version: 1
state: "closed"
files:
  - path: "specs/design/01-架构设计.md"
    status: "confirmed"
reopens:
  - at: "2026-01-01T00:00:00Z"
    reason: "r1"
    files: ["specs/design/01-架构设计.md"]
  - at: "2026-01-02T00:00:00Z"
    reason: "r2"
    files: ["specs/design/01-架构设计.md"]
  - at: "2026-01-03T00:00:00Z"
    reason: "r3"
    files: ["specs/design/01-架构设计.md"]
change_list:
  path: ".brainstorming-archify/change-lists/20260101T000000Z-x.md"
  set_at: "2026-01-01T00:00:00Z"
`);
  const sec = (n, t) => "## " + n + ". " + t + "\n内容\n";
  writeFileSync(join(dir, "specs", "design", "00-接口契约.md"),
    ["总则", "1. MySQL 数据表", "2. Redis key 与结构", "3. MQ 消息通道", "4. HTTP 接口", "5. gRPC 接口", "6. 动态库 API", "7. TCP 接口", "8. 其他对外接口", "9. 跨类别共同约定", "10. 待定问题与风险"].map((h, i) => sec(i || "", h)).join("\n"));
  writeFileSync(join(dir, "specs", "design", "02-实体与数据设计.md"),
    ["1. 数据模式总览", "2. 领域类图", "3. 实体关系图", "4. 数据流图", "5. 核心实体状态机", "6. 数据生命周期与保留", "7. 关键决策记录", "8. 待定问题与风险"].map((h) => sec(0, h)).join("\n"));
  writeFileSync(join(dir, "specs", "design", "01-架构设计.md"), `## 1. 背景与问题
事件循环 + 线程池 + 主循环 并存。
每 60 秒扫描一次。
超时 30 秒。
术语表：见附录。
`);
  writeFileSync(join(dir, "specs", "design", "03-模块A.md"), "## 1. 模块职责与边界\n每 5 秒轮询\n每 3 秒轮询\n每 2 秒轮询\n");
  writeFileSync(join(dir, "specs", "design", "task.md"), "- [ ] T1\n");
  return dir;
}

test("reopen ≥3 判高风险，且命中「扫描周期 ≥ 超时」", () => {
  const dir = makeProject();
  const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8" });
  const out = JSON.parse(r.stdout);
  const arch = out.docs.find((d) => d.file === "01-架构设计.md");
  assert.equal(arch.risk, "high");
  assert.equal(arch.reopens, 3);
  assert.ok(out.d14.some((s) => s.signal === "扫描周期 ≥ 超时阈值"), JSON.stringify(out.d14));
});

test("缺模块文档与 task.md 记为产物问题", () => {
  const dir = makeProject();
  const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8" });
  const out = JSON.parse(r.stdout);
  assert.equal(out.problems.length, 0);
});
