#!/usr/bin/env node
/**
 * 设计增量范围：算出 <from>..<to> 之间 specs/design 的变更文件与受影响章节。
 *
 *   node scripts/scope.mjs <projectRoot> --from <rev> --to <rev> [--out <reviewDir>] [--json]
 *
 * 产物 <out>/scope.json：
 *   { mode:"delta", from, to, files:[{path,status,sections:[{title,line}]}],
 *     related:[{path,reason,sections:[...]}], unchanged }
 *
 * 规则：
 *   - files    = git diff --name-status 命中的设计文档（只看 specs/design）
 *   - sections = 每个改动 hunk 上方最近的二级/三级标题
 *   - related  = 其它设计文档中直接引用「变更文件名」或「变更章节标题」的章节
 * 区间内无设计变更时以 3 退出，不产生 scope.json。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const root = argv.find((a) => !a.startsWith("--"));
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const from = arg("--from");
const to = arg("--to");
const asJson = argv.includes("--json");
const outIdx = argv.indexOf("--out");
const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]) : null;

if (!root || !from || !to) {
  console.error("用法: node scope.mjs <projectRoot> --from <rev> --to <rev> [--out <dir>] [--json]");
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  } catch (err) {
    console.error(`scope: git ${args.join(" ")} 失败：${String(err.stderr || err.message).trim()}`);
    process.exit(2);
  }
}

git(["rev-parse", "--verify", `${from}^{commit}`]);
git(["rev-parse", "--verify", `${to}^{commit}`]);

const raw = git(["diff", "--name-status", `${from}..${to}`, "--", "specs/design"]);
if (!raw) {
  console.error(`scope: ${from}..${to} 区间内 specs/design 无变更，无需增量评审`);
  process.exit(3);
}

const changed = raw.split("\n").filter(Boolean).map((line) => {
  const [status, path] = line.split("\t");
  return { status, path };
}).filter((f) => f.path.endsWith(".md"));

const show = (p) => git(["show", `${to}:${p}`]).split("\n");
const existsAtTo = (p) => {
  try { git(["cat-file", "-e", `${to}:${p}`]); return true; } catch { return false; }
};

function headingAbove(lines, idx) {
  for (let i = Math.min(idx, lines.length - 1); i >= 0; i--) {
    const m = lines[i].match(/^#{2,4}\s+(.+)$/);
    if (m) return { title: m[1].trim(), line: i + 1 };
  }
  return null;
}

function sectionsOf(path) {
  const diff = git(["diff", "-U0", `${from}..${to}`, "--", path]);
  if (!existsAtTo(path)) return [];
  const lines = show(path);
  const seen = new Map();
  for (const line of diff.split("\n")) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!m) continue;
    const h = headingAbove(lines, Number(m[1]) - 1);
    if (h) seen.set(h.title, h);
  }
  return [...seen.values()];
}

const files = changed.map((f) => ({
  path: f.path,
  status: f.status,
  sections: sectionsOf(f.path)
}));

// related：其它设计文档里直接引用变更文件或变更章节的位置
const allDocs = git(["ls-tree", "--name-only", `${to}`, "specs/design/"])
  .split("\n").filter((p) => p.endsWith(".md"));
const changedPaths = new Set(files.map((f) => f.path));
const tokens = [];
for (const f of files) {
  tokens.push({ token: basename(f.path), reason: `引用 ${basename(f.path)}` });
  for (const s of f.sections) tokens.push({ token: s.title, reason: `引用「${s.title}」` });
}

const related = [];
for (const doc of allDocs) {
  if (changedPaths.has(doc)) continue;
  const lines = show(doc);
  const hits = [];
  for (const t of tokens) {
    const idx = lines.findIndex((l) => l.includes(t.token));
    if (idx >= 0) hits.push({ token: t.token, reason: t.reason, line: idx + 1 });
  }
  if (!hits.length) continue;
  const sections = new Map();
  for (const h of hits) {
    const head = headingAbove(lines, h.line - 1);
    if (head) sections.set(head.title, head);
  }
  related.push({ path: doc, reason: [...new Set(hits.map((h) => h.reason))].join("；"), sections: [...sections.values()] });
}

const result = {
  mode: "delta",
  from,
  to,
  generated_at: new Date().toISOString(),
  files,
  related,
  unchanged: Math.max(0, allDocs.length - files.length)
};

const json = JSON.stringify(result, null, 2) + "\n";
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "scope.json"), json);
}
if (asJson || !outDir) process.stdout.write(json);
else {
  const secs = files.reduce((n, f) => n + f.sections.length, 0);
  console.log(`增量范围 ${from}..${to}：变更 ${files.length} 份 / 受影响章节 ${secs} 个；关联文档 ${related.length} 份`);
  for (const f of files) console.log(`  - ${f.path} [${f.status}] ${f.sections.map((s) => s.title).join(" / ") || "（整份）"}`);
}
