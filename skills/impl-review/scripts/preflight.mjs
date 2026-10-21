#!/usr/bin/env node
/**
 * 开跑前体检 + 基准等级判定（B0）。
 *
 *   node scripts/preflight.mjs <projectRoot> [--require-design] [--json] [--out <dir>]
 *
 * 产出 <out>/preflight.json；--require-design 不满足时写 preflight-failed.md 并以 1 退出。
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { parseYaml } from "./lib/yaml.mjs";

const root = process.argv[2];
if (!root) { console.error("用法: node preflight.mjs <projectRoot> [--require-design] [--json] [--out <dir>]"); process.exit(2); }
const requireDesign = process.argv.includes("--require-design");
const asJson = process.argv.includes("--json");
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : root;

const designDir = join(root, "specs", "design");
const archState = join(root, ".brainstorming-archify", "state.yaml");

function git(args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
  catch { return null; }
}

function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === ".git" || name === "node_modules") continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p); else n++;
    }
  };
  try { walk(dir); } catch { return 0; }
  return n;
}

const result = {
  root,
  repo: git(["rev-parse", "--show-toplevel"]) !== null,
  head: git(["rev-parse", "HEAD"]),
  base: null,
  submodules: [],
  design: { present: false, files: [], state: null, task_md: false, diagrams: false },
  handoff: null,
  bench: "L0",
  reasons: [],
  failures: []
};

result.base = git(["merge-base", "HEAD", "origin/HEAD"]) || git(["rev-parse", "HEAD~1"]) || result.head;

// 子模块体检（B3）
if (result.repo) {
  const raw = git(["submodule", "status", "--recursive"]) || "";
  for (const line of raw.split("\n").filter(Boolean)) {
    const m = line.match(/^([-+ ])([0-9a-f]+)\s+(\S+)/);
    if (!m) continue;
    const path = m[3];
    const files = countFiles(join(root, path));
    result.submodules.push({ path, checked_out: files > 0, files });
    if (files === 0) result.failures.push(`子模块未检出：${path}（其实现全落 missing，属假阴性）`);
  }
}

// 设计产物
if (existsSync(designDir)) {
  result.design.present = true;
  result.design.files = readdirSync(designDir).filter((n) => n.endsWith(".md")).sort();
  result.design.task_md = existsSync(join(designDir, "task.md"));
  result.design.diagrams = existsSync(join(designDir, "diagrams"));
}
if (existsSync(archState)) {
  try {
    const s = parseYaml(readFileSync(archState, "utf8"));
    result.design.state = s.state;
    const okSchema = s.schema_version === 1 && Array.isArray(s.files) && Array.isArray(s.reopens);
    if (!okSchema) result.reasons.push("state.yaml schema 不全，保守按 draft");
  } catch (err) {
    result.reasons.push(`state.yaml 解析失败：${err.message}`);
  }
}

// 交接块
const auditDir = join(root, "specs", "audit");
if (existsSync(auditDir)) {
  for (const d of readdirSync(auditDir)) {
    const p = join(auditDir, d);
    if (!statSync(p).isDirectory()) continue;
    const report = join(p, "REPORT.md");
    if (existsSync(report) && /##\s*交接块/.test(readFileSync(report, "utf8"))) result.handoff = relative(root, report);
  }
}

// 等级判定
const required = ["00-接口契约.md", "01-架构设计.md", "02-实体与数据设计.md"];
const missing = required.filter((f) => !result.design.files.includes(f));
const modules = result.design.files.filter((n) => /^0[3-9]-|^[1-9]\d+-/.test(n));
const complete = missing.length === 0 && modules.length > 0;

if (!result.design.present || !complete) {
  result.bench = "L0";
  result.reasons.push(complete ? "无设计文档" : `设计产物不全：缺 ${[...missing, modules.length ? "" : "模块文档"].filter(Boolean).join("、")}`);
} else if (result.design.state !== "closed") {
  result.bench = "L0";
  result.reasons.push(`设计未冻结（state=${result.design.state || "缺失"}），不做对照`);
} else if (result.handoff) {
  result.bench = "L2";
} else {
  result.bench = "L1";
  result.reasons.push("无 Gate D 交接块，基准未审");
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "preflight.json"), JSON.stringify(result, null, 2) + "\n");

if (requireDesign && result.bench === "L0") {
  writeFileSync(join(outDir, "preflight-failed.md"),
    `# preflight 失败：--require-design\n\n` +
    `- 基准等级：L0\n- 原因：\n` + result.reasons.map((r) => `  - ${r}\n`).join("") +
    `\n拒绝运行：本次承诺做设计对照，但产物不足以支撑。\n`);
  console.error("preflight: --require-design 不满足，已写 preflight-failed.md 并拒绝运行");
  process.exit(1);
}

if (asJson) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`基准等级：${result.bench}`);
  if (result.reasons.length) for (const r of result.reasons) console.log(`  - ${r}`);
  console.log(`子模块：${result.submodules.length ? result.submodules.map((s) => `${s.path}(${s.files})`).join(", ") : "无"}`);
  console.log(`设计产物：${result.design.files.length} 份；state=${result.design.state ?? "缺失"}；task.md=${result.design.task_md}`);
  console.log(`交接块：${result.handoff ?? "无"}`);
  if (result.failures.length) for (const f of result.failures) console.log(`  ! ${f}`);
}
