#!/usr/bin/env node
/**
 * 实现增量：把代码变更映射到相关设计章节。
 *
 *   node scripts/related-design.mjs <projectRoot> --from <rev> --to <rev> [--out <reviewDir>] [--json]
 *
 * 产物 <out>/design-scope.json：
 *   { mode:"delta", from, to, code_files:[...],
 *     design:[{path, sections:[{title,line}], tokens:[...]}],
 *     unmatched:[未在任何设计文档出现的代码文件] }
 *
 * 规则：取 diff 中的文件名与标识符作为 token，在设计文档里找字面出现；
 *       命中的文档取命中行上方最近的二/三级标题。未命中的代码文件进 unmatched，
 *       表示「设计未覆盖」，按技能规则只记设计缺口提示，不算实现缺陷。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const root = argv.find((a) => !a.startsWith("--"));
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const from = arg("--from");
const to = arg("--to");
const asJson = argv.includes("--json");
const outIdx = argv.indexOf("--out");
const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]) : null;

if (!root || !from || !to) {
  console.error("用法: node related-design.mjs <projectRoot> --from <rev> --to <rev> [--out <dir>] [--json]");
  process.exit(2);
}

function git(args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }); }
  catch (err) {
    console.error(`related-design: git ${args.join(" ")} 失败：${String(err.stderr || err.message).trim()}`);
    process.exit(2);
  }
}

git(["rev-parse", "--verify", `${from}^{commit}`]);
git(["rev-parse", "--verify", `${to}^{commit}`]);

const CODE_EXT = new Set([".h", ".hpp", ".hh", ".c", ".cc", ".cpp", ".cxx", ".js", ".mjs", ".ts", ".tsx", ".py", ".go", ".java", ".rs", ".proto", ".sql"]);
const SKIP = /^(specs\/|vendor\/|third_party\/|build\/|dist\/|out\/|node_modules\/|\.git\/)/;
const STOP = new Set(["const", "static", "return", "class", "struct", "public", "private", "void", "nullptr", "include", "define", "namespace", "using", "this", "true", "false", "std"]);

const raw = git(["diff", "--name-status", `${from}..${to}`]).trim();
const codeFiles = raw ? raw.split("\n").filter(Boolean).map((l) => {
  const [status, path] = l.split("\t");
  return { status, path };
}).filter((f) => CODE_EXT.has(extname(f.path)) && !SKIP.test(f.path)) : [];

const tokens = new Set();
for (const f of codeFiles) {
  tokens.add(basename(f.path));
  tokens.add(basename(f.path, extname(f.path)));
}
const diff = git(["diff", "-U0", `${from}..${to}`]);
for (const line of diff.split("\n")) {
  if (!/^[+-]/.test(line) || /^[+-]{3}/.test(line)) continue;
  for (const m of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{3,})\b/g)) {
    const t = m[1];
    if (!STOP.has(t.toLowerCase())) tokens.add(t);
  }
}

const designDir = join(root, "specs", "design");
let docs = [];
try {
  docs = execFileSync("git", ["-C", root, "ls-tree", "--name-only", to, "specs/design/"], { encoding: "utf8" })
    .split("\n").filter((p) => p.endsWith(".md"));
} catch {
  docs = [];
}

const readAt = (p) => { try { return git(["show", `${to}:${p}`]).split("\n"); } catch { return null; } };
const headingAbove = (lines, idx) => {
  for (let i = Math.min(idx, lines.length - 1); i >= 0; i--) {
    const m = lines[i].match(/^#{2,4}\s+(.+)$/);
    if (m) return { title: m[1].trim(), line: i + 1 };
  }
  return null;
};

const design = [];
const covered = new Set();
for (const doc of docs) {
  const lines = readAt(doc);
  if (!lines) continue;
  const hits = [];
  for (const t of tokens) {
    const idx = lines.findIndex((l) => l.includes(t));
    if (idx >= 0) hits.push({ token: t, line: idx + 1 });
  }
  if (!hits.length) continue;
  const sections = new Map();
  for (const h of hits) {
    const head = headingAbove(lines, h.line - 1);
    if (head) sections.set(head.title, head);
  }
  design.push({ path: doc, sections: [...sections.values()], tokens: [...new Set(hits.map((h) => h.token))].slice(0, 20) });
  for (const f of codeFiles) {
    if (hits.some((h) => h.token === basename(f.path) || h.token === basename(f.path, extname(f.path)))) covered.add(f.path);
  }
  if (codeFiles.length) {
    // 文档命中了任一代码符号，视为该文档覆盖了这次变更的某一部分
  }
}

const unmatched = codeFiles.map((f) => f.path).filter((p) => !covered.has(p));

const result = {
  mode: "delta",
  from,
  to,
  generated_at: new Date().toISOString(),
  code_files: codeFiles.map((f) => ({ path: f.path, status: f.status })),
  design,
  unmatched
};

const json = JSON.stringify(result, null, 2) + "\n";
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "design-scope.json"), json);
}
if (asJson || !outDir) process.stdout.write(json);
else {
  console.log(`代码变更 ${codeFiles.length} 个文件；命中设计文档 ${design.length} 份；未被设计覆盖 ${unmatched.length} 个`);
  for (const d of design) console.log(`  - ${d.path}: ${d.sections.map((s) => s.title).join(" / ") || "（整份）"}`);
  if (unmatched.length) console.log(`  设计缺口（只记提示，不算缺陷）：${unmatched.join(", ")}`);
}
