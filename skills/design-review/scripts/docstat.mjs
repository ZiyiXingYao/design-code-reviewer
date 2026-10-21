#!/usr/bin/env node
/**
 * 设计产物统计与信号扫描（对应流程 A0）。
 *
 *   node scripts/docstat.mjs <projectRoot> [--json] [--design-dir specs/design]
 *
 * 只做统计与信号，不做严重性判断：输出供 A0 基线表与 D14/D15 深查使用。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parseYaml } from "./lib/yaml.mjs";

const root = process.argv[2];
if (!root) { console.error("用法: node docstat.mjs <projectRoot> [--json] [--design-dir <dir>]"); process.exit(2); }
const asJson = process.argv.includes("--json");
const ddIdx = process.argv.indexOf("--design-dir");
const designDir = join(root, ddIdx > 0 ? process.argv[ddIdx + 1] : "specs/design");
const archDir = join(root, ".brainstorming-archify");

const REQUIRED = ["00-接口契约.md", "01-架构设计.md", "02-实体与数据设计.md"];
const FIXED_SECTIONS = {
  "00-接口契约.md": ["MySQL", "Redis", "MQ", "HTTP", "gRPC", "动态库", "TCP", "其他对外接口", "跨类别共同约定", "待定问题"],
  "01-架构设计.md": ["背景与问题", "目标与非目标", "方案对比", "整体功能说明", "功能点需求", "功能模块划分", "跨模块接口矩阵", "核心类设计", "代码文件树", "全局功能流程", "业务编排流程", "运行视图", "部署视图", "关键决策记录", "待定问题"],
  "02-实体与数据设计.md": ["数据模式总览", "领域类图", "实体关系图", "数据流图", "核心实体状态机", "数据生命周期", "关键决策记录", "待定问题"],
  module: ["模块职责", "本模块类清单", "类详细设计", "对外依赖契约", "端到端业务流程", "本模块实体状态机", "关键决策记录", "待定问题"]
};

function listDesignFiles() {
  if (!existsSync(designDir)) return [];
  return readdirSync(designDir).filter((n) => n.endsWith(".md")).sort();
}

function lineCount(p) { return readFileSync(p, "utf8").split("\n").length; }

function headings(text) {
  return text.split("\n").filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s*\d+\.?\s*/, "").trim());
}

function loadArchState() {
  const p = join(archDir, "state.yaml");
  if (!existsSync(p)) return { present: false };
  try {
    const s = parseYaml(readFileSync(p, "utf8"));
    return {
      present: true, raw: s, state: s.state, schema_version: s.schema_version,
      files: s.files, reopens: s.reopens, change_list: s.change_list || {}
    };
  } catch (err) {
    return { present: true, error: err.message };
  }
}

const files = listDesignFiles();
const problems = [];
const warnings = [];
const infos = [];

for (const f of REQUIRED) {
  if (!files.includes(f)) problems.push(`缺固定文档 ${f}`);
}
const modules = files.filter((n) => /^0[3-9]-|^[1-9]\d+-/.test(n));
if (!modules.length) problems.push("缺模块文档（03+）");
const ordinals = modules.map((n) => Number(n.match(/^(\d+)-/)[1]));
for (let i = 1; i < ordinals.length; i++) {
  if (ordinals[i] !== ordinals[i - 1] + 1) warnings.push(`模块编号不连续：${ordinals[i - 1]} -> ${ordinals[i]}`);
}
if (!existsSync(join(designDir, "task.md"))) problems.push("缺 task.md");
if (!existsSync(join(designDir, "diagrams"))) infos.push("无 diagrams/ 目录（工艺项 P3）");

// 固定章节
for (const [name, expect] of Object.entries(FIXED_SECTIONS)) {
  const target = name === "module" ? modules : [name];
  for (const f of target) {
    const p = join(designDir, f);
    if (!existsSync(p)) continue;
    const hs = headings(readFileSync(p, "utf8")).join("\n");
    const miss = expect.filter((k) => !hs.includes(k));
    if (miss.length) warnings.push(`${f} 缺/改名章节：${miss.join("、")}`);
  }
}

const arch = loadArchState();
if (!arch.present) problems.push("缺 .brainstorming-archify/state.yaml");
else if (arch.error) problems.push(`state.yaml 解析失败：${arch.error}`);
else {
  // 方案 §2.4.3：四个必需字段缺任一都要显式告警，不得静默兜底
  for (const key of ["schema_version", "state", "files", "reopens"]) {
    if (arch.raw?.[key] === undefined || arch.raw?.[key] === null) warnings.push(`state.yaml 缺必需字段 ${key}`);
  }
  if (arch.schema_version !== 1) warnings.push(`state.yaml schema_version=${arch.schema_version}（期望 1）`);
  if (!arch.change_list?.path) warnings.push("state.yaml 未登记 change_list.path");
  else {
    const clp = join(root, arch.change_list.path);
    if (!existsSync(clp)) problems.push(`change_list 指向的文件不存在：${arch.change_list.path}`);
    else {
      const text = readFileSync(clp, "utf8");
      if (!/^##\s*关键决策/m.test(text)) warnings.push("change-list 缺「关键决策」段");
      if (!/\bD-?\d+\b/.test(text)) warnings.push("change-list 未见 D-nnn 决策编号");
    }
  }
}

const reopenCount = new Map();
for (const r of arch.reopens || []) for (const f of r.files || []) {
  reopenCount.set(f, (reopenCount.get(f) || 0) + 1);
}

const docs = files.map((f) => {
  const p = join(designDir, f);
  const text = readFileSync(p, "utf8");
  const rc = reopenCount.get(`specs/design/${f}`) ?? reopenCount.get(relative(root, p)) ?? 0;
  return {
    file: f, lines: lineCount(p), reopens: rc,
    risk: rc >= 3 ? "high" : rc >= 1 ? "medium" : "low",
    pending: (text.match(/待定/g) || []).length
  };
});

// ---- D14 并发模型信号（项目级，不做逐文档噪声）----
const d14 = [];
const d15 = [];
const CONC_WORDS = ["Reactor", "事件循环", "线程池", "actor", "每连接", "单线程", "epoll", "io_uring", "主循环", "回调池"];
const TIMER_WORDS = ["轮询", "定时", "周期", "每隔"];
const archDoc = docs.find((d) => d.file === "01-架构设计.md");
const archText = archDoc ? readFileSync(join(designDir, archDoc.file), "utf8") : "";
const modelWords = CONC_WORDS.filter((w) => archText.includes(w));
if (archDoc) {
  if (!modelWords.length) {
    d14.push({ doc: "01-架构设计.md", signal: "并发模型未声明", detail: "架构文档未见任何并发/调度模型词", level: "P1" });
  } else if (modelWords.length >= 3) {
    d14.push({ doc: "01-架构设计.md", signal: "模型多套并存", detail: modelWords.join("/"), level: "需查三层边界" });
  }
}

const timerDocs = [];
for (const d of docs) {
  const lines = readFileSync(join(designDir, d.file), "utf8").split("\n");
  const timerHits = lines.filter((l) => TIMER_WORDS.some((w) => l.includes(w))).length;
  if (timerHits >= 3) timerDocs.push(`${d.file}(${timerHits})`);

  const periods = [];
  const timeouts = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(?:每\s*|周期[^0-9]{0,6})(\d+)\s*(ms|毫秒|s|秒)/g)) periods.push({ n: Number(m[1]), unit: m[2], line: i + 1 });
    for (const m of l.matchAll(/超时[^0-9\n]{0,12}(\d+)\s*(ms|毫秒|s|秒)/g)) timeouts.push({ n: Number(m[1]), unit: m[2], line: i + 1 });
  });
  const toMs = (x) => (/ms|毫秒/.test(x.unit) ? x.n : x.n * 1000);
  const seen = new Set();
  for (const p1 of periods) for (const t of timeouts) {
    if (toMs(p1) < toMs(t)) continue;
    const key = `${p1.line}:${t.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    d14.push({
      doc: d.file, signal: "扫描周期 ≥ 超时阈值",
      detail: `第 ${p1.line} 行周期 ${p1.n}${p1.unit} ≥ 第 ${t.line} 行超时 ${t.n}${t.unit}`,
      level: "P1"
    });
  }
}
if (timerDocs.length >= 3) {
  d14.push({ doc: "-", signal: "定时扫描散落", detail: `${timerDocs.length} 份文档含轮询/定时：${timerDocs.join("、")}`, level: "P1" });
}

// ---- D15 抽象一致性信号 ----
const conceptStems = new Map();
let hasGlossary = false;
for (const d of docs) {
  const text = readFileSync(join(designDir, d.file), "utf8");
  if (/术语/.test(text)) hasGlossary = true;
  for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9]*?)(2D|List|Info|Data|State|Pose|Action|Actions|Config)\b/g)) {
    const stem = m[1];
    if (!conceptStems.has(stem)) conceptStems.set(stem, new Set());
    conceptStems.get(stem).add(m[0]);
  }
  const oneImpl = text.match(/接口[^\n]{0,30}(仅|只有)\s*(一|1)\s*个实现/g);
  if (oneImpl) d15.push({ doc: d.file, signal: "单实现接口", detail: oneImpl[0], level: "P2" });
}
if (!hasGlossary) d15.push({ doc: "-", signal: "无术语表", detail: "全部文档未见术语章节", level: "P3" });
for (const [stem, variants] of conceptStems) {
  if (variants.size >= 2) d15.push({ doc: "-", signal: "同概念多类型", detail: `${stem}: ${[...variants].join(" / ")}`, level: "需查是否需转换" });
}

const report = {
  root, designDir,
  total_lines: docs.reduce((a, d) => a + d.lines, 0),
  file_count: files.length,
  arch_state: { state: arch.state, schema_version: arch.schema_version, reopens: (arch.reopens || []).length },
  docs, problems, warnings, infos, d14, d15
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`# 设计产物基线\n\n- 目录：${designDir}\n- 文档：${files.length} 份 / ${report.total_lines} 行\n- state：${arch.state ?? "缺失"}；reopen ${(arch.reopens || []).length} 次\n`);
  console.log("| 文档 | 行数 | reopen | 风险 | 待定 |");
  console.log("|---|---|---|---|---|");
  for (const d of docs) console.log(`| ${d.file} | ${d.lines} | ${d.reopens} | ${d.risk} | ${d.pending} |`);
  const dump = (title, arr) => {
    if (!arr.length) return;
    console.log(`\n## ${title}`);
    for (const x of arr) console.log(`- [${x.level || "-"}] ${x.doc}：${x.signal} —— ${x.detail}`);
  };
  dump("产物问题（P1 候选）", problems.map((p) => ({ doc: "-", signal: p, detail: "", level: "P1" })));
  dump("产物告警", warnings.map((w) => ({ doc: "-", signal: w, detail: "", level: "P2" })));
  dump("D14 信号", d14);
  dump("D15 信号", d15);
  if (!problems.length && !warnings.length) console.log("\n产物契约校验：无告警");
}
