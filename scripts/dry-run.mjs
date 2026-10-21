#!/usr/bin/env node
/**
 * 全流程 dry-run：验证所有评审流程与关键场景。
 *
 *   node scripts/dry-run.mjs
 *
 * 全部在临时目录执行，不修改仓库；任一断言失败退出码 1。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initReview, updateState, commitBatch, appendProgress, loadState, sha256File } from "../skills/design-review/scripts/lib/review-state.mjs";
import { workDir, auditDir } from "../skills/design-review/scripts/lib/layout.mjs";
import { generateTaskMd } from "../skills/design-review/scripts/lib/task-plan.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const results = [];
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    results.push(["PASS", name, ""]);
  } catch (e) {
    failed++;
    results.push(["FAIL", name, e.message]);
  }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: 期望 ${b}，实际 ${a}`); }
function truthy(v, msg) { if (!v) throw new Error(msg); }
const run = (script, args, opts = {}) => spawnSync(node, [join(ROOT, script), ...args], { encoding: "utf8", ...opts });
const J = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));
const mk = (prefix) => mkdtempSync(join(tmpdir(), prefix));

function summaryMd(conclusion, bench = "") {
  return `# 结论
${bench ? `基准：${bench}\n` : ""}
## 一句话结论
${conclusion}

## 最该关心的三件事
1. F-001

## 必办清单
| 序 | 项 | 级别 | 依赖 |
|---|---|---|---|
| 1 | F-001 | P0 | - |

## 已接受的风险
无

## 数字概览
- 成立率 1.00 / 有效辩护率 0.00 / 升级率 0.00 / 未决率 0.00

## 本次没看什么
无
`;
}

function seedFindings(dir, { type = "design", level = "P1" } = {}) {
  const f = {
    id: "F-001", level, title: "示例缺陷", location: type === "design" ? "03-订单模块.md:20" : "src/order/order_service.cpp:10",
    mechanism: "缺少校验", counterexample: "给定非法输入 → 越界 → 因为没有校验",
    trigger: "非法输入", suggestion: "补校验", depends_on: [],
    sources: [{ batch: "b01", id: "F-001", level }]
  };
  J(join(dir, "05-findings.json"), { findings: [f] });
  J(join(dir, "06-accusations.json"), { accusations: [{ id: "A-001", source_findings: ["F-001"], location: f.location, mechanism: "m", consequence: "c" }] });
  J(join(dir, "07-defense.json"), { defenses: [{ accusation_id: "A-001", claim: "admit", location: "-", mechanism: "-" }] });
  J(join(dir, "08-verdict.json"), {
    verdicts: [{ accusation_id: "A-001", decision: "upheld", level, reason: "机制成立" }],
    stats: { accusations: 1, upheld: 1, dismissed: 0, unresolved: 0, valid_defense: 0, defended: 1, escalated: 0, first_round: 1 }
  });
}

function seedAgents(dir) {
  updateState(dir, (s) => {
    s.adversarial.agents = [
      ...["s1","s2","s3","s4","s5","s6","s7"].map((g) => ({ role: `scout-${g}`, agent_id: `sub-${g}`, findings: 1, coverage_note: "已检查", cross_hints: [] })),
      { role: "red", agent_id: "sub-red", coverage_note: "17 卡全跑", retries: 0 },
      { role: "blue", agent_id: "sub-blue", retries: 0 },
      { role: "judge", agent_id: "sub-judge", retries: 0 }
    ];
  });
}

function designPlan() {
  return {
    expected: { dimension: 15, scenario: 17, completeness: 20 },
    steps: ["A0"],
    batches: [
      { id: "b01", group: "s1", unit: "15 维度", kind: "discrete" },
      { id: "b02", group: "a4", unit: "17 场景", kind: "discrete" },
      { id: "b03", group: "a3", unit: "FP1", kind: "incremental", cells: 20 }
    ]
  };
}
function implPlan() {
  return {
    expected: { lens: 20 },
    steps: ["B0"],
    batches: [{ id: "b01", group: "s3", unit: "20 镜头", kind: "discrete" }]
  };
}

function initDesign(root, id) {
  const dir = workDir(root, id);
  initReview(dir, { type: "design", reviewId: id, root, expected: designPlan().expected, steps: ["A0"], batches: designPlan().batches });
  updateState(dir, (s) => { s.state = "verifying"; s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  seedAgents(dir);
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "15 维度", kind: "discrete", status: "done", covers: Array.from({ length: 15 }, (_, i) => ({ kind: "dimension", id: `D${i + 1}` })), findings: [], coverage_note: "ok", cross_hints: [] } });
  commitBatch(dir, { payload: { batch: "b02", group: "a4", unit: "17 场景", kind: "discrete", status: "done", covers: ["F1","F2","F3","F4","F5","C1","C2","C3","C4","V1","V2","V3","V4","O1","O2","S1","S2"].map((id) => ({ kind: "scenario", id })), findings: [], coverage_note: "ok", cross_hints: [] } });
  commitBatch(dir, { payload: { batch: "b03", group: "a3", unit: "FP1", kind: "incremental", status: "done", covers: Array.from({ length: 20 }, (_, i) => ({ kind: "completeness", id: `FP1#${i + 1}` })), cells: Array.from({ length: 20 }, (_, i) => ({ id: `FP1#${i + 1}`, verdict: "有" })), findings: [], coverage_note: "ok", cross_hints: [] } });
  seedFindings(dir, { type: "design", level: "P1" });
  writeFileSync(join(dir, "REPORT.md"), "# 设计评审报告\nGate D 结论：不通过\n\n发现 F-001。\n对抗：成立率 1.00 / 有效辩护率 0.00 / 升级率 0.00 / 未决率 0.00\n\n## 交接块\n- C-1 主实体可跨分区 → 状态键按分区聚合\n");
  writeFileSync(join(dir, "SUMMARY.md"), summaryMd("不通过"));
  // 进 reported 即交付成品，人工评审看到的就是交付目录里的文件
  const t = run("skills/design-review/scripts/state.mjs", ["transition", dir, "reported", "--reason", "A7 完成"]);
  if (t.status !== 0) throw new Error("transition reported 失败：" + t.stderr);
  return dir;
}

function initImpl(root, id) {
  const dir = workDir(root, id);
  initReview(dir, { type: "impl", reviewId: id, root, expected: implPlan().expected, steps: ["B0"], batches: implPlan().batches });
  updateState(dir, (s) => { s.state = "verifying"; s.steps.B0 = { status: "done", at: new Date().toISOString() }; });
  seedAgents(dir);
  commitBatch(dir, { payload: { batch: "b01", group: "s3", unit: "20 镜头", kind: "discrete", status: "done", covers: Array.from({ length: 20 }, (_, i) => ({ kind: "lens", id: String(i + 1) })), findings: [], coverage_note: "ok", cross_hints: [] } });
  seedFindings(dir, { type: "impl", level: "P1" });
  J(join(dir, "preflight.json"), { failures: [] });
  writeFileSync(join(dir, "REPORT.md"), "# 实现评审报告\n基准：L1\nGate I 结论：有条件通过\n\n发现 F-001。\n对抗：成立率 1.00 / 有效辩护率 0.00 / 升级率 0.00 / 未决率 0.00\n");
  writeFileSync(join(dir, "SUMMARY.md"), summaryMd("有条件通过", "L1"));
  const t = run("skills/impl-review/scripts/state.mjs", ["transition", dir, "reported", "--reason", "B9 完成"]);
  if (t.status !== 0) throw new Error("transition reported 失败：" + t.stderr);
  return dir;
}

// ---------- 1 基础 ----------
console.log("== 1 基础检查 ==");
ok("所有 mjs 语法", () => {
  const r = spawnSync("bash", ["-lc", `cd "${ROOT}" && for f in $(git ls-files '*.mjs'); do ${node} --check "$f" || exit 1; done`], { encoding: "utf8" });
  eq(r.status, 0, r.stderr || "语法检查失败");
});
ok("单测全绿", () => {
  const r = spawnSync("bash", ["-lc", `cd "${ROOT}" && ${node} --test tests/*.test.mjs`], { encoding: "utf8" });
  eq(r.status, 0, "单测失败：" + (r.stdout || "").split("\n").filter((l) => l.includes("✖") || l.includes("fail ")).slice(0, 3).join(" "));
});
ok("install --dry-run 列出两个技能与命令", () => {
  const r = run("install.mjs", ["--dry-run"]);
  eq(r.status, 0, r.stderr);
  truthy(r.stdout.includes("design-review") && r.stdout.includes("impl-review") && r.stdout.includes("review-resume"), "输出不完整");
});

// ---------- 2 design 全流程 ----------
console.log("== 2 design 全流程 ==");
let designDir = "";
ok("design: gate 通过", () => {
  const root = mk("dcr-dry-design-");
  designDir = initDesign(root, "2026-01-01-design");
  const g = run("skills/design-review/scripts/gate.mjs", [designDir, "--json"]);
  const j = JSON.parse(g.stdout);
  eq(g.status, 0, "gate 失败：" + j.results.filter((x) => !x.ok && x.blocking).map((x) => `${x.id}[${x.detail}]`).join(" | "));
});
ok("design: reported 即交付 2 件，task.md 尚未生成", () => {
  const root = designDir.split("/.design-code-reviewer/")[0];
  const audit = auditDir(root, "2026-01-01-design");
  for (const f of ["REPORT.md", "SUMMARY.md"]) {
    truthy(existsSync(join(audit, f)), `交付缺 ${f}`);
    eq(readFileSync(join(audit, f), "utf8"), readFileSync(join(designDir, f), "utf8"), `${f} 与工作副本不一致`);
  }
  truthy(!existsSync(join(audit, "task.md")), "批准前不该有 task.md");
});

ok("design: 报告修订后 deliver 重新交付", () => {
  const root = designDir.split("/.design-code-reviewer/")[0];
  const audit = auditDir(root, "2026-01-01-design");
  const before = readFileSync(join(designDir, "REPORT.md"), "utf8");
  writeFileSync(join(designDir, "REPORT.md"), before + "\n<!-- 答复人工提问后的修订 -->\n");
  const r = run("skills/design-review/scripts/state.mjs", ["deliver", designDir]);
  eq(r.status, 0, r.stderr);
  eq(readFileSync(join(audit, "REPORT.md"), "utf8"), readFileSync(join(designDir, "REPORT.md"), "utf8"), "交付未刷新");
});

ok("design: approve 生成 task.md / 08-verdict.md / ledger", () => {
  const r = run("skills/design-review/scripts/state.mjs", ["approve", designDir, "--reviewer", "dry-run"]);
  eq(r.status, 0, r.stderr);
  for (const f of ["task.md", "08-verdict.md"]) truthy(existsSync(join(designDir, f)), `缺 ${f}`);
  const ledger = join(designDir.split("/.design-code-reviewer/")[0], ".design-code-reviewer/ledger.yaml");
  truthy(existsSync(ledger), "缺 ledger.yaml");
});
ok("design: closed 后 gate 通过且交付 3 件", () => {
  const g = run("skills/design-review/scripts/gate.mjs", [designDir, "--json"]);
  eq(g.status, 0, "closed gate 失败");
  const root = designDir.split("/.design-code-reviewer/")[0];
  const audit = auditDir(root, "2026-01-01-design");
  for (const f of ["REPORT.md", "SUMMARY.md", "task.md"]) truthy(existsSync(join(audit, f)), `交付缺 ${f}`);
});

// ---------- 3 impl 全流程 ----------
console.log("== 3 impl 全流程 ==");
let implDir = "";
ok("impl: gate 通过（含 G15–G19）", () => {
  const root = mk("dcr-dry-impl-");
  implDir = initImpl(root, "2026-01-01-impl");
  const g = run("skills/impl-review/scripts/gate.mjs", [implDir, "--json"]);
  const j = JSON.parse(g.stdout);
  eq(g.status, 0, "gate 失败：" + j.results.filter((x) => !x.ok && x.blocking).map((x) => `${x.id}[${x.detail}]`).join(" | "));
});
ok("impl: reported 即交付 2 件，task.md 尚未生成", () => {
  const root = implDir.split("/.design-code-reviewer/")[0];
  const audit = auditDir(root, "2026-01-01-impl");
  for (const f of ["REPORT.md", "SUMMARY.md"]) truthy(existsSync(join(audit, f)), `交付缺 ${f}`);
  truthy(!existsSync(join(audit, "task.md")), "批准前不该有 task.md");
});
ok("impl: approve 交付 3 件", () => {
  const r = run("skills/impl-review/scripts/state.mjs", ["approve", implDir, "--reviewer", "dry-run"]);
  eq(r.status, 0, r.stderr);
  const root = implDir.split("/.design-code-reviewer/")[0];
  const audit = auditDir(root, "2026-01-01-impl");
  for (const f of ["REPORT.md", "SUMMARY.md", "task.md"]) truthy(existsSync(join(audit, f)), `交付缺 ${f}`);
});

// ---------- 4 工具链 ----------
console.log("== 4 工具链 ==");
ok("preflight：mini-design 判 L1", () => {
  const project = join(mk("dcr-dry-tools-"), "project");
  cpSync(join(ROOT, "examples/mini-design"), project, { recursive: true });
  const r = run("skills/impl-review/scripts/preflight.mjs", [project, "--json"]);
  eq(JSON.parse(r.stdout).bench, "L1", "基准等级");
});
ok("claims：diagrams 与交接块 C-n 进入断言", () => {
  const project = join(mk("dcr-dry-claims-"), "project");
  cpSync(join(ROOT, "examples/mini-design"), project, { recursive: true });
  mkdirSync(join(project, "specs/design/diagrams"), { recursive: true });
  writeFileSync(join(project, "specs/design/diagrams/01-x.sequence.json"), JSON.stringify({ nodes: [{ call: "OrderService.Accept" }] }));
  mkdirSync(join(project, "specs/audit/2026-01-01-design"), { recursive: true });
  writeFileSync(join(project, "specs/audit/2026-01-01-design/REPORT.md"), "## 交接块\n- C-1 主实体可跨分区 → 状态键按分区聚合\n");
  const r = run("skills/impl-review/scripts/claims.mjs", [project, "--json"]);
  const j = JSON.parse(r.stdout);
  truthy(j.assertions.some((a) => a.kind === "constraint" && a.unverifiable), "缺 C-n 断言");
  truthy(j.assertions.some((a) => a.kind === "call" || a.file), "缺 diagrams 断言");
});
ok("smells：可运行且不判严重性", () => {
  const r = run("skills/impl-review/scripts/smells.mjs", [join(ROOT, "examples/mini-design"), "--json"]);
  eq(r.status, 0, r.stderr);
  truthy(Array.isArray(JSON.parse(r.stdout).signals), "输出缺 signals");
});

// ---------- 5 恢复 ----------
console.log("== 5 恢复 ==");
ok("resume：partial、仅日志批、残留 tmp 与心跳超时", () => {
  const root = mk("dcr-dry-resume-");
  const dir = workDir(root, "2026-01-01-design");
  initReview(dir, { type: "design", reviewId: "2026-01-01-design", root, expected: { dimension: 3 }, steps: ["A0"], batches: [
    { id: "b01", group: "s1", unit: "D1", kind: "discrete" },
    { id: "b02", group: "s1", unit: "D2", kind: "discrete" },
    { id: "b03", group: "a3", unit: "FP1", kind: "incremental" }
  ] });
  updateState(dir, (s) => { s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [], coverage_note: "x" } });
  appendProgress(dir, { batch: "b02", status: "running", ts: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
  writeFileSync(join(dir, "batches/b03.partial.json"), JSON.stringify({ batch: "b03", filled_cells: ["FP1#1", "FP1#2"], partial_findings: [] }));
  writeFileSync(join(dir, "batches/b99.json.tmp"), "{}");
  const r = run("skills/design-review/scripts/resume.mjs", [root, "--json"]);
  eq(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  truthy(j.recovery.discarded.includes("b02"), "心跳超时未判失败");
  eq(j.partial_batches[0].filled, 2, "partial 格数");
  truthy(!existsSync(join(dir, "batches/b99.json.tmp")), "tmp 未清理");
  truthy(loadState(dir).recovery.last_run, "state 未回写");
});
ok("resume：产物被改动判 discarded", () => {
  const root = mk("dcr-dry-tamper-");
  const dir = workDir(root, "2026-01-01-design");
  initReview(dir, { type: "design", reviewId: "2026-01-01-design", root, expected: { dimension: 1 }, steps: ["A0"], batches: [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }] });
  updateState(dir, (s) => { s.steps.A0 = { status: "done", at: new Date().toISOString() }; });
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings: [], coverage_note: "x" } });
  const f = join(dir, "batches/b01.json");
  writeFileSync(f, readFileSync(f, "utf8") + " ");
  const r = run("skills/design-review/scripts/resume.mjs", [root, "--force", "--json"]);
  truthy(JSON.parse(r.stdout).recovery.discarded.includes("b01"), "篡改未识别");
});

// ---------- 6 拒绝场景 ----------
console.log("== 6 拒绝场景 ==");
function gateCheck(dir, prefix) {
  const g = run("skills/design-review/scripts/gate.mjs", [dir, "--json"]);
  const j = JSON.parse(g.stdout);
  return j.results.find((x) => x.id.startsWith(prefix));
}
ok("覆盖不足：G16 拒绝", () => {
  const root = mk("dcr-dry-floor-");
  const dir = workDir(root, "2026-01-01-design");
  initReview(dir, { type: "design", reviewId: "2026-01-01-design", root, expected: { dimension: 5 }, steps: ["A0"], batches: [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }] });
  eq(gateCheck(dir, "G16").ok, false, "未拒绝");
});
ok("L0 写「符合设计」：G7 拒绝", () => {
  const root = mk("dcr-dry-l0-");
  const dir = workDir(root, "2026-01-01-impl");
  initReview(dir, { type: "impl", reviewId: "2026-01-01-impl", root, expected: { lens: 20 }, steps: ["B0"], batches: [{ id: "b01", group: "s3", unit: "L", kind: "discrete" }], bench: "L0" });
  updateState(dir, (s) => { s.state = "reported"; s.steps.B0 = { status: "done", at: new Date().toISOString() }; });
  writeFileSync(join(dir, "REPORT.md"), "基准：L0\n实现符合设计。\n");
  writeFileSync(join(dir, "SUMMARY.md"), summaryMd("通过", "L0"));
  eq(gateCheck(dir, "G7").ok, false, "未拒绝");
});
ok("依赖成环：task.md 拒绝生成", () => {
  const findings = [
    { id: "F-001", level: "P0", title: "a", location: "a.md:1", mechanism: "m", suggestion: "s", counterexample: "c", depends_on: ["F-002"] },
    { id: "F-002", level: "P0", title: "b", location: "b.md:1", mechanism: "m", suggestion: "s", counterexample: "c", depends_on: ["F-001"] }
  ];
  const accusations = findings.map((f, i) => ({ id: `A-${i}`, source_findings: [f.id], location: f.location, mechanism: "m", consequence: "c" }));
  const verdicts = findings.map((f, i) => ({ accusation_id: `A-${i}`, decision: "upheld", level: "P0", reason: "r" }));
  const out = generateTaskMd({ reviewId: "x", reviewType: "design", reviewer: "r", at: "t", conclusion: "不通过", findings, verdicts, accusations });
  eq(out.ok, false, "未拒绝成环");
});
ok("缺 reviewer：approve 拒绝", () => {
  const r = run("skills/design-review/scripts/state.mjs", ["approve", designDir]);
  eq(r.status, 1, "未拒绝");
});
ok("closed 后写入：batch 拒绝", () => {
  const r = run("skills/design-review/scripts/state.mjs", ["batch", designDir, "--payload", join(designDir, "05-findings.json")]);
  truthy(r.status !== 0, "未拒绝");
});
ok("批量上限：16 条 findings 触发 G17", () => {
  const root = mk("dcr-dry-caps-");
  const dir = workDir(root, "2026-01-01-design");
  initReview(dir, { type: "design", reviewId: "2026-01-01-design", root, expected: { dimension: 1 }, steps: ["A0"], batches: [{ id: "b01", group: "s1", unit: "D1", kind: "discrete" }] });
  const findings = Array.from({ length: 16 }, (_, i) => ({ id: `F-${String(i + 1).padStart(3, "0")}`, level: "P1", title: "x", location: "a.md:1", mechanism: "m", counterexample: "c", sources: [{ batch: "b01", id: "x", level: "P1" }] }));
  commitBatch(dir, { payload: { batch: "b01", group: "s1", unit: "D1", kind: "discrete", status: "done", covers: [{ kind: "dimension", id: "D1" }], findings, coverage_note: "x" } });
  eq(gateCheck(dir, "G17").ok, false, "未拒绝");
});
ok("P0 写「通过」：G18 拒绝", () => {
  const root = mk("dcr-dry-g18-");
  const dir = initDesign(root, "2026-01-01-design");
  seedFindings(dir, { type: "design", level: "P0" });
  writeFileSync(join(dir, "REPORT.md"), "# r\nGate D 结论：通过\n");
  eq(gateCheck(dir, "G18").ok, false, "未拒绝");
});

// ---------- 汇总 ----------
console.log("");
for (const [st, name, msg] of results) console.log(`${st}  ${name}${msg ? "  — " + msg : ""}`);
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
