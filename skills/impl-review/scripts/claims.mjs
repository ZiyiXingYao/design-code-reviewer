#!/usr/bin/env node
/**
 * 断言抽取与机械核对（B3/B4）。
 *
 *   node scripts/claims.mjs <projectRoot> [--out claims.json] [--json] [--scope src/,include/]
 *
 * 只做机械匹配：把设计文档里的标识符（清单表单元格 / 行内代码）当断言，
 * 在全仓代码里查字面量。missing 不等于缺陷，必须人工归为
 * 真缺失 / 改名未回写 / 表达差异（见 claims.md）。
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.argv[2];
if (!root) { console.error("用法: node claims.mjs <projectRoot> [--out file] [--json] [--scope a,b]"); process.exit(2); }
const asJson = process.argv.includes("--json");
const outIdx = process.argv.indexOf("--out");
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : null;
const scopeIdx = process.argv.indexOf("--scope");
const scopes = scopeIdx > 0 ? process.argv[scopeIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;

const CODE_EXT = new Set([".h", ".hpp", ".hh", ".c", ".cc", ".cpp", ".cxx", ".m", ".mm", ".js", ".mjs", ".ts", ".tsx", ".py", ".go", ".java", ".rs", ".proto", ".sql", ".json", ".yaml", ".yml", ".sh", ".cmake", ".txt"]);
const SKIP_DIRS = new Set([".git", "node_modules", "build", "dist", "out", "third_party", "vendor", "specs", ".cache"]);
const STOP = new Set(["true", "false", "null", "none", "void", "int", "string", "bool", "float", "double", "const", "static", "return", "class", "struct", "enum", "namespace", "public", "private", "std"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (CODE_EXT.has(extname(name)) && st.size < 2_000_000) acc.push(p);
  }
  return acc;
}

const designDir = join(root, "specs", "design");
if (!existsSync(designDir)) {
  console.error("claims: 无 specs/design，无法抽取断言");
  process.exit(2);
}

const roots = scopes ? scopes.map((s) => join(root, s)).filter((p) => existsSync(p)) : [root];
const files = roots.flatMap((r) => (statSync(r).isDirectory() ? walk(r) : [r]));
const corpus = files.map((f) => ({ file: relative(root, f), text: readFileSync(f, "utf8") }));

const assertions = [];
const gaps = [];

for (const name of readdirSync(designDir).filter((n) => n.endsWith(".md")).sort()) {
  const text = readFileSync(join(designDir, name), "utf8");
  const lines = text.split("\n");
  let inFence = false;
  let tableNo = 0;
  let tableCol = [];
  let heading = "";

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) heading = h[1];

    // 行内代码
    for (const m of line.matchAll(/`([^`]{2,80})`/g)) {
      const tok = m[1].trim();
      if (/^[A-Za-z_][\w.:/-]*$/.test(tok) && !STOP.has(tok.toLowerCase())) {
        assertions.push({ doc: name, line: i + 1, token: tok, kind: "inline" });
      }
    }

    // 表格
    if (/^\s*\|/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (/^-+$/.test(cells[0]?.replace(/:/g, "")) || cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
      if (!tableCol.length) tableCol = cells;
      else {
        // 编号连续性
        const no = cells[0];
        if (/^\d+$/.test(no)) {
          const last = gaps.filter((g) => g.doc === name && g.table === tableNo).at(-1);
          const n = Number(no);
          if (last && n > last.to + 1) gaps.push({ doc: name, line: i + 1, table: tableNo, from: last.to, to: n });
          gaps.push({ doc: name, line: i + 1, table: tableNo, from: n, to: n, _mark: true });
        }
        for (const c of cells) {
          if (/^[A-Za-z_][\w.:/-]*$/.test(c) && c.length >= 3 && !STOP.has(c.toLowerCase())) {
            assertions.push({ doc: name, line: i + 1, token: c, kind: heading.includes("状态机") ? "state" : "cell" });
          }
        }
      }
    } else if (!/^\s*\|/.test(line)) {
      if (tableCol.length) { tableCol = []; tableNo++; }
    }
  });
}

// 时序图：把节点里的调用/标签当作“调用顺序”断言
const diagramsDir = join(designDir, "diagrams");
if (existsSync(diagramsDir)) {
  for (const name of readdirSync(diagramsDir).filter((n) => n.endsWith(".json"))) {
    try {
      const j = JSON.parse(readFileSync(join(diagramsDir, name), "utf8"));
      const nodes = Array.isArray(j.nodes) ? j.nodes : Array.isArray(j.steps) ? j.steps : [];
      for (const n of nodes) {
        const label = n.call || n.label || n.name;
        if (typeof label !== "string") continue;
        for (const m of label.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g)) {
          assertions.push({ doc: `diagrams/${name}`, line: 0, token: m[1], kind: "call" });
        }
      }
    } catch { /* 非标准图结构跳过 */ }
  }
}

// 交接块：C-n 设计约束纳入断言集（不可机械匹配，标 unverifiable）
const auditRoot = join(root, "specs", "audit");
if (existsSync(auditRoot)) {
  for (const d of readdirSync(auditRoot)) {
    const rp = join(auditRoot, d, "REPORT.md");
    if (!existsSync(rp)) continue;
    const text = readFileSync(rp, "utf8");
    const idx = text.indexOf("## 交接块");
    if (idx < 0) continue;
    for (const line of text.slice(idx).split("\n")) {
      const m = line.match(/^-\s*(C-\d+)\s*[：:]?\s*(.+)$/);
      if (m) assertions.push({ doc: "交接块", line: 0, token: `${m[1]} ${m[2]}`.slice(0, 120), kind: "constraint", manual: true });
    }
  }
}

// 去重
const seen = new Set();
const uniq = [];
for (const a of assertions) {
  const k = `${a.doc}:${a.token}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(a);
}

function kindOf(tok) {
  if (/\//.test(tok)) return "interface";
  if (/:/.test(tok)) return "topic";
  if (/\./.test(tok)) return "field";
  if (/^[A-Z]/.test(tok)) return "symbol";
  return "field";
}

function probes(tok, kind) {
  const out = [tok];
  if (kind === "interface") {
    const segs = tok.split("/").filter((s) => s && !/^\{.*\}$/.test(s));
    if (segs.length) out.push(segs[segs.length - 1]);
  }
  if (kind === "field" && tok.includes(".")) {
    const leaf = tok.split(".").pop();
    if (leaf && leaf.length >= 3) out.push(leaf);
  }
  if (kind === "topic") {
    const head = tok.split(":")[0];
    if (head.length >= 3) out.push(head);
    out.push(tok.replace(/\{[^}]*\}/g, ""));
  }
  return [...new Set(out.filter((t) => t.length >= 3))];
}

const results = uniq.map((a) => {
  const kind = ["constraint", "call", "state"].includes(a.kind) ? a.kind : kindOf(a.token);
  if (kind === "constraint") {
    return { ...a, kind, found: false, unverifiable: true, file: null, probe: null, note: "C-n 约束需人工核" };
  }
  let hit = null;
  let used = null;
  for (const probe of probes(a.token, kind)) {
    hit = corpus.find((c) => c.text.includes(probe));
    if (hit) { used = probe; break; }
  }
  return { ...a, kind, found: Boolean(hit), unverifiable: false, file: hit ? hit.file : null, probe: used };
});

const summary = {};
for (const r of results) {
  summary[r.kind] ||= { total: 0, found: 0, missing: 0, unverifiable: 0 };
  summary[r.kind].total++;
  if (r.found) summary[r.kind].found++; else if (r.unverifiable) summary[r.kind].unverifiable++; else summary[r.kind].missing++;
}

// 编号跳号（去掉内部标记）
const realGaps = [];
const byTable = new Map();
for (const g of gaps) {
  const key = `${g.doc}#${g.table}`;
  if (!byTable.has(key)) byTable.set(key, []);
  byTable.get(key).push(g);
}
for (const [key, arr] of byTable) {
  for (const g of arr) if (g.to > g.from && g.from > 0) realGaps.push({ doc: g.doc, line: g.line, from: g.from, to: g.to });
}

const out = {
  root,
  scanned_files: corpus.length,
  assertions: results,
  summary,
  numbering_gaps: realGaps,
  note: "found/missing 为机械匹配；constraint（交接块 C-n）永不参与机械匹配，统一记 unverifiable。missing 必须人工归为 真缺失/改名未回写/表达差异"
};

if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`扫描代码文件：${corpus.length}；断言：${results.length}\n`);
  console.log("| 类型 | 断言数 | found | missing |");
  console.log("|---|---|---|---|");
  for (const [k, v] of Object.entries(summary)) console.log(`| ${k} | ${v.total} | ${v.found} | ${v.missing} |`);
  if (realGaps.length) {
    console.log("\n编号跳号：");
    for (const g of realGaps) console.log(`- ${g.doc}:${g.line} ${g.from} -> ${g.to}`);
  }
}
