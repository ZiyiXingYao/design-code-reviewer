/**
 * 评审目录布局：工作目录与交付目录。
 *
 *   工作目录  <root>/.design-code-reviewer/<YYYY-MM-DD>-<design|impl>[-N]/
 *   交付目录  <root>/specs/audit/<same-id>/
 *
 * 工作目录持有唯一权威的 state.yaml 与全部中间产物；交付目录只放成品：
 * reported 时交付 REPORT.md / SUMMARY.md 供人工评审，approve 后补入 task.md。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseYaml } from "./yaml.mjs";

export const WORK_ROOT = ".design-code-reviewer";
export const AUDIT_ROOT = "specs/audit";
export const ID_RE = /^(\d{4}-\d{2}-\d{2})-(design|impl)(?:-(\d+))?$/;

export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isValidId(id) {
  return ID_RE.test(id);
}

export function makeReviewId(root, type, d = new Date()) {
  if (!["design", "impl"].includes(type)) throw new Error(`未知评审类型：${type}`);
  const base = `${todayStamp(d)}-${type}`;
  let id = base;
  let n = 2;
  while (existsSync(join(resolve(root), WORK_ROOT, id))) id = `${base}-${n++}`;
  return id;
}

export function workDir(root, id) {
  if (!isValidId(id)) throw new Error(`非法评审 id：${id}`);
  return join(resolve(root), WORK_ROOT, id);
}

/**
 * 把成品从工作目录复制到交付目录（只复制存在且非空的文件）。
 * 返回实际复制的文件名列表，供 state.report.files 记录。
 */
export function deliverArtifacts(reviewDir, outDir, files) {
  mkdirSync(outDir, { recursive: true });
  const copied = [];
  for (const f of files) {
    const src = join(resolve(reviewDir), f);
    if (!existsSync(src) || statSync(src).size === 0) continue;
    copyFileSync(src, join(outDir, f));
    copied.push(f);
  }
  return copied;
}

export function auditDir(root, id) {
  if (!isValidId(id)) throw new Error(`非法评审 id：${id}`);
  return join(resolve(root), AUDIT_ROOT, id);
}

/** 扫描工作根下所有评审；按 state.yaml 的 mtime 倒序 */
export function discoverReviews(root) {
  const base = join(resolve(root), WORK_ROOT);
  if (!existsSync(base)) return [];
  const out = [];
  for (const name of readdirSync(base)) {
    if (!isValidId(name)) continue;
    const dir = join(base, name);
    if (!statSync(dir).isDirectory()) continue;
    const stateFile = join(dir, "state.yaml");
    if (!existsSync(stateFile)) continue;
    let state = null;
    let error = null;
    try {
      state = parseYaml(readFileSync(stateFile, "utf8"));
    } catch (err) {
      error = err.message;
    }
    out.push({
      id: name,
      type: name.endsWith("-design") || /-design-\d+$/.test(name) ? "design" : "impl",
      dir,
      stateFile,
      mtime: statSync(stateFile).mtimeMs,
      state,
      error
    });
  }
  return out.sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id));
}

export function rel(root, p) {
  return relative(resolve(root), p).split("\\").join("/");
}
