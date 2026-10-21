#!/usr/bin/env node
/**
 * 镜头 19/20 的信号扫描（只出信号，不判严重性）。
 *
 *   node scripts/smells.mjs <projectRoot> [--json] [--scope src/,include/] [--out smells.json]
 *
 * 六类信号：
 *   repeated-dispatch   同一维度的类型分支在 ≥3 处出现
 *   duplicate-block     同一逻辑块 ≥3 处、每处 ≥15 行
 *   concept-drift       同概念 ≥2 个命名变体
 *   sleep-polling       循环内 sleep 轮询
 *   blocking-callback   事件循环文件内出现阻塞调用
 *   over-design         接口/基类只有一个实现
 *
 * 没有信号就不报——这是镜头 19/20 不变成说教的前提。
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join, relative } from "node:path";

const root = process.argv[2];
if (!root) { console.error("用法: node smells.mjs <projectRoot> [--json] [--scope a,b] [--out file]"); process.exit(2); }
const asJson = process.argv.includes("--json");
const scopeIdx = process.argv.indexOf("--scope");
const scopes = scopeIdx > 0 ? process.argv[scopeIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
const outIdx = process.argv.indexOf("--out");
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : null;

const CODE_EXT = new Set([".h", ".hpp", ".hh", ".c", ".cc", ".cpp", ".cxx", ".m", ".mm", ".js", ".mjs", ".ts", ".tsx", ".py", ".go", ".java", ".rs"]);
const SKIP_DIRS = new Set([".git", "node_modules", "build", "dist", "out", "third_party", "vendor", "specs", ".cache", "test", "tests"]);

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

const roots = scopes ? scopes.map((s) => join(root, s)).filter((p) => existsSync(p)) : [root];
const files = [...new Set(roots.flatMap((r) => (statSync(r).isDirectory() ? walk(r) : [r])))];
const docs = files.map((f) => ({
  file: relative(root, f),
  lines: readFileSync(f, "utf8").split("\n")
}));

const signals = [];

// 1) repeated-dispatch
{
  const hits = [];
  for (const d of docs) {
    let n = 0;
    let first = null;
    d.lines.forEach((l, i) => {
      const yes = /\bswitch\s*\(/.test(l) || /\bif\s*\(.*(?:[Tt]ype|Type\(\)|kind|state)\s*==/.test(l);
      if (yes) { n++; if (!first) first = i + 1; }
    });
    if (n >= 2) hits.push({ file: d.file, line: first, count: n });
  }
  if (hits.length >= 3) {
    signals.push({
      signal: "repeated-dispatch",
      detail: `${hits.length} 个文件含 ≥2 处类型分派`,
      locations: hits.slice(0, 12)
    });
  }
}

// 2) duplicate-block（≥15 行、跨 ≥2 处）
{
  const index = new Map();
  for (const d of docs) {
    const text = d.lines.join("\n");
    const blocks = text.split(/\n\s*\n/);
    let offset = 1;
    for (const b of blocks) {
      const startLine = offset;
      offset += b.split("\n").length + 1;
      const raw = b.split("\n").filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l));
      if (raw.length < 15) continue;
      const norm = raw.map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
      if (norm.length < 200) continue;
      const h = createHash("sha1").update(norm).digest("hex").slice(0, 12);
      if (!index.has(h)) index.set(h, []);
      index.get(h).push({ file: d.file, line: startLine, lines: raw.length });
    }
  }
  for (const [h, locs] of index) {
    const uniqFiles = new Set(locs.map((l) => l.file));
    if (uniqFiles.size >= 2 && locs.length >= 2) {
      signals.push({ signal: "duplicate-block", detail: `同一 ${locs[0].lines} 行块重复 ${locs.length} 处（hash ${h}）`, locations: locs.slice(0, 8) });
    }
  }
}

// 3) concept-drift
{
  const variants = new Map();
  const SUFFIX = /^(.*?)(2D|List|Info|Data|State|Pose|Action|Actions|Config)$/;
  const VERB = new Set(["Set", "Get", "Is", "Has", "Add", "Remove", "Create", "Update", "Find", "Build", "Parse", "To", "From", "Load", "Save", "Read", "Write", "Make", "Do"]);
  for (const d of docs) {
    const seen = new Set();
    d.lines.forEach((l, i) => {
      for (const m of l.matchAll(/\b([A-Z][A-Za-z0-9]{2,48})\b/g)) {
        const name = m[1];
        const sm = name.match(SUFFIX);
        if (!sm) continue;
        const stem = sm[1];
        if (!stem || stem.length < 3) continue;
        if (VERB.has(stem)) continue;
        const key = `${stem}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!variants.has(stem)) variants.set(stem, []);
        variants.get(stem).push({ file: d.file, line: i + 1, name });
      }
    });
  }
  for (const [stem, locs] of variants) {
    const names = new Set(locs.map((l) => l.name));
    if (names.size >= 2) {
      signals.push({ signal: "concept-drift", detail: `${stem} 有 ${names.size} 个变体：${[...names].join(" / ")}`, locations: locs.slice(0, 8) });
    }
  }
}

// 4) sleep-polling
{
  for (const d of docs) {
    d.lines.forEach((l, i) => {
      if (!/\b(sleep|usleep|sleep_for|Sleep)\s*\(/.test(l)) return;
      const ctx = d.lines.slice(Math.max(0, i - 6), i).join("\n");
      if (/\bwhile\s*\(|\bfor\s*\(/.test(ctx)) {
        signals.push({ signal: "sleep-polling", detail: "循环内 sleep 轮询", locations: [{ file: d.file, line: i + 1 }] });
      }
    });
  }
}

// 5) blocking-callback
{
  const LOOP = /(epoll_wait|uv_run|event_base_dispatch|io_context\.run|QEventLoop|select\s*\()/;
  const BLOCK = /(\bsleep\s*\(|\busleep\s*\(|fopen\s*\(|::query\s*\(|sqlite3_exec\s*\()/;
  for (const d of docs) {
    const text = d.lines.join("\n");
    if (!LOOP.test(text)) continue;
    const bad = [];
    d.lines.forEach((l, i) => { if (BLOCK.test(l)) bad.push({ file: d.file, line: i + 1, code: l.trim().slice(0, 120) }); });
    if (bad.length) signals.push({ signal: "blocking-callback", detail: "事件循环文件内出现阻塞调用", locations: bad.slice(0, 8) });
  }
}

// 6) over-design（接口实现数 = 1）
{
  const ifaces = new Map();
  const impls = new Map();
  for (const d of docs) {
    const text = d.lines.join("\n");
    for (const m of text.matchAll(/class\s+(\w+)[^{;]*\{([\s\S]{0,800}?)\};/g)) {
      if (/virtual[^;]*=\s*0/.test(m[2])) ifaces.set(m[1], d.file);
    }
    for (const m of text.matchAll(/class\s+\w+\s*:\s*public\s+(\w+)/g)) {
      impls.set(m[1], (impls.get(m[1]) || 0) + 1);
    }
  }
  for (const [name, file] of ifaces) {
    const n = impls.get(name) || 0;
    if (n === 1) signals.push({ signal: "over-design", detail: `接口 ${name} 只有 1 个实现（YAGNI 需确认是否有变化预期）`, locations: [{ file, line: 1 }] });
  }
}

const out = {
  root,
  scanned_files: docs.length,
  signals: signals.map((s) => ({ ...s, count: s.locations?.length ?? 0 })),
  note: "只出信号，不判断严重性；深读代码后再定级。镜头 19 的模式类发现封顶 P2。"
};

if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`扫描文件 ${docs.length}；信号 ${out.signals.length} 组\n`);
  for (const s of out.signals) {
    console.log(`## ${s.signal} — ${s.detail}`);
    for (const l of s.locations || []) console.log(`  - ${l.file}:${l.line ?? "?"}${l.name ? " " + l.name : ""}`);
  }
  if (!out.signals.length) console.log("无信号。");
}
