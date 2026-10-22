import test from "node:test";
import assert from "node:assert/strict";
import { generateTaskMd } from "../skills/design-review/scripts/lib/task-plan.mjs";

function f(id, level, { file = "07-设备模块.md", sources = 1, depends_on } = {}) {
  return {
    id, level, title: `缺陷 ${id}`, location: `${file}:100`,
    mechanism: "缺机制", suggestion: "补机制", counterexample: "给定X→Y→缺Z",
    sources: Array.from({ length: sources }, (_, i) => ({ batch: `b0${i + 1}`, id, level })),
    ...(depends_on ? { depends_on } : {})
  };
}

function gen(findings, opts = {}) {
  const accusations = findings.map((x, i) => ({ id: `A-${i + 1}`, source_findings: [x.id], location: x.location, mechanism: "m", consequence: "c" }));
  const verdicts = findings.map((x, i) => ({ accusation_id: `A-${i + 1}`, decision: "upheld", level: x.level, reason: "r" }));
  return generateTaskMd({
    reviewId: "2026-01-01-design", reviewType: "design", reviewer: "测试", at: "2026-01-01T00:00:00Z",
    conclusion: "不通过", findings, verdicts, accusations, ...opts
  });
}

test("共用任务优先，同文件后者依赖前者", () => {
  const out = gen([
    f("F-002", "P0", { file: "08-制品模块.md" }),
    f("F-001", "P1", { file: "07-设备模块.md", sources: 2 }),
    f("F-003", "P1", { file: "07-设备模块.md" })
  ]);
  assert.equal(out.ok, true, out.errors.join("；"));
  assert.match(out.markdown, /T-01 \[P1\] 缺陷 F-001/);
  assert.match(out.markdown, /T-02 \[P0\] 缺陷 F-002/);
  assert.match(out.markdown, /T-03 \[P1\] 缺陷 F-003/);
  assert.match(out.markdown, /T-03[\s\S]*?依赖：T-01/);
  assert.match(out.markdown, /四段|实现的功能/);
});

test("依赖成环：拒绝生成", () => {
  const out = gen([
    f("F-001", "P0", { file: "a.md", depends_on: ["F-002"] }),
    f("F-002", "P0", { file: "b.md", depends_on: ["F-001"] })
  ]);
  assert.equal(out.ok, false);
  assert.match(out.errors.join("；"), /成环/);
});

test("已有未勾选任务：只追加、续号", () => {
  const existing = `# 修复任务

## 任务

- [ ] **T-01 [P0] 缺陷 F-001**（F-001）
  - 问题：旧
  - 依赖：无

## 依赖校验

- 环检测：无
`;
  const out = gen([f("F-001", "P0"), f("F-002", "P0", { file: "08-制品模块.md" })], { existing });
  assert.equal(out.ok, true);
  assert.match(out.markdown, /T-01 \[P0\] 缺陷 F-001/);
  assert.match(out.markdown, /T-02 \[P0\] 缺陷 F-002/);
  assert.match(out.markdown, /旧/);
});

test("已有任务全部勾选：整份重写", () => {
  const existing = `# 旧任务

## 任务

- [x] **T-01 [P0] 旧缺陷**（F-009）
`;
  const out = gen([f("F-002", "P1")], { existing });
  assert.equal(out.ok, true);
  assert.doesNotMatch(out.markdown, /F-009/);
  assert.match(out.markdown, /T-01 \[P1\] 缺陷 F-002/);
});

test("task.md 保留完整改法与影响，给完整路径与证据位置", () => {
  const x = f("F-001", "P0");
  x.suggestion = "第一步收敛出口；第二步让扫描返回待收尾；第三步删掉转移环";
  x.location = "05-设备域.md:338（§3.8）；01-架构设计.md:775（§12.2）";
  x.impact = "对象与订阅泄漏随正常下线数线性增长";
  const out = gen([x]);
  assert.equal(out.ok, true, out.errors.join("；"));
  assert.match(out.markdown, /第二步让扫描返回待收尾/, "分号后的改法被截断");
  assert.match(out.markdown, /第三步删掉转移环/);
  assert.match(out.markdown, /影响：对象与订阅泄漏随正常下线数线性增长/);
  assert.match(out.markdown, /specs\/design\/05-设备域\.md:338/);
  assert.match(out.markdown, /specs\/design\/01-架构设计\.md:775/);
  assert.match(out.markdown, /05-findings\.json → F-001/);
});

test("impl task.md：设计对照、违反不变量、不截断", async () => {
  const { generateTaskMd: genImpl } = await import("../skills/impl-review/scripts/lib/task-plan.mjs");
  const x = {
    id: "F-001", level: "P0", title: "加载失败后继续启动",
    location: "src/plugin/runtime.cpp:430",
    doc_ref: "04-插件运行时.md:88（§3.2）",
    module: "插件运行时", problem: "加载失败只记 WARN 并继续启动",
    mechanism: "错误被吞掉", invariant: "加载失败必须 fail-closed",
    impact: "插件运行时半初始化", trigger: "符号缺失",
    suggestion: "第一步返回错误；第二步逆序卸载已启动插件",
    sources: [{ batch: "b01", id: "F-001", level: "P0" }]
  };
  const accusations = [{ id: "A-001", source_findings: ["F-001"], location: x.location, mechanism: "m", consequence: "c" }];
  const verdicts = [{ accusation_id: "A-001", decision: "upheld", level: "P0", reason: "r" }];
  const out = genImpl({
    reviewId: "2026-01-01-impl", reviewType: "impl", reviewer: "测试", at: "2026-01-01T00:00:00Z",
    conclusion: "不通过", findings: [x], verdicts, accusations
  });
  assert.equal(out.ok, true, out.errors.join("；"));
  assert.match(out.markdown, /第二步逆序卸载已启动插件/);
  assert.match(out.markdown, /src\/plugin\/runtime\.cpp:430/);
  assert.match(out.markdown, /specs\/design\/04-插件运行时\.md:88/);
  assert.match(out.markdown, /违反不变量：加载失败必须 fail-closed/);
  assert.match(out.markdown, /触发条件不再复现：符号缺失/);
});
