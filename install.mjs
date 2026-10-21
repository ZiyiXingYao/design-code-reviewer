#!/usr/bin/env node
/**
 * 安装/更新/卸载 design-review 与 impl-review 两个技能到 CodeBuddy 技能目录。
 *
 * 零依赖。成功不残留备份；中途失败保留备份供恢复。
 *
 * 用法：
 *   node install.mjs [--dry-run] [--force] [--dest <dir>]
 *   node install.mjs --uninstall [--dry-run] [--dest <dir>]
 */

import { existsSync, mkdirSync, cpSync, copyFileSync, renameSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKILLS = ["design-review", "impl-review"];
const COMMANDS = ["review-resume.md"];

function usage() {
  console.log(`用法: node install.mjs [--dry-run] [--force] [--dest <dir>] [--uninstall]`);
  console.log("  --dest <dir>   安装目标根目录，默认 ~/.codebuddy/skills");
  console.log("  --dry-run      只打印计划，不写盘");
  console.log("  --force        兼容保留：默认行为已是「备份旧目录后覆盖更新」");
  console.log("  --uninstall    移除已安装技能");
}

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, uninstall: false, dest: join(homedir(), ".codebuddy", "skills") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--uninstall") opts.uninstall = true;
    else if (a === "--dest") {
      const v = argv[++i];
      if (!v) fail("--dest 需要参数");
      opts.dest = resolve(v);
    } else if (a === "-h" || a === "--help") { usage(); process.exit(0); }
    else fail(`不认识的参数：${a}`);
  }
  return opts;
}

function fail(msg) {
  console.error(`install: ${msg}`);
  process.exit(1);
}

function assertSource(name) {
  const src = join(ROOT, "skills", name);
  if (!existsSync(join(src, "SKILL.md"))) fail(`源目录缺少 SKILL.md：${src}`);
  return src;
}

function installOne(name, opts, stamp) {
  const src = assertSource(name);
  const dest = join(opts.dest, name);
  const backup = `${dest}.bak-${stamp}`;
  const staging = `${dest}.new-${stamp}`;
  console.log(`${opts.dryRun ? "[dry-run] " : ""}安装 ${name}: ${src} -> ${dest}`);
  if (opts.dryRun) return;

  mkdirSync(opts.dest, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  cpSync(src, staging, { recursive: true });

  const hadOld = existsSync(dest);
  if (hadOld) {
    if (!opts.force) {
      // 已存在且未要求覆盖：仍执行更新，但保留备份直到成功
      console.log(`  更新已有技能（原目录保留为 ${backup}，成功后删除）`);
    }
    renameSync(dest, backup);
  }
  try {
    renameSync(staging, dest);
  } catch (err) {
    if (hadOld && existsSync(backup)) renameSync(backup, dest);
    rmSync(staging, { recursive: true, force: true });
    fail(`写入失败，已回滚：${err.message}`);
  }
  if (hadOld) rmSync(backup, { recursive: true, force: true });
  console.log("  完成");
}

function uninstallOne(name, opts) {
  const dest = join(opts.dest, name);
  console.log(`${opts.dryRun ? "[dry-run] " : ""}卸载 ${name}: ${dest}`);
  if (opts.dryRun) return;
  if (!existsSync(dest)) { console.log("  未安装，跳过"); return; }
  rmSync(dest, { recursive: true, force: true });
  console.log("  完成");
}

const opts = parseArgs(process.argv.slice(2));

if (!existsSync(join(ROOT, "skills"))) fail(`未找到 skills/ 目录：${ROOT}`);

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
for (const name of SKILLS) {
  if (opts.uninstall) uninstallOne(name, opts);
  else installOne(name, opts, stamp);
}

// 斜杠命令装到 <dest>/../commands
const cmdDir = join(dirname(opts.dest), "commands");
for (const name of COMMANDS) {
  const src = join(ROOT, "commands", name);
  const dest = join(cmdDir, name);
  if (!existsSync(src)) fail(`缺命令源文件：${src}`);
  console.log(`${opts.dryRun ? "[dry-run] " : ""}${opts.uninstall ? "卸载" : "安装"}命令 ${name}: ${dest}`);
  if (opts.dryRun) continue;
  if (opts.uninstall) { rmSync(dest, { force: true }); continue; }
  mkdirSync(cmdDir, { recursive: true });
  copyFileSync(src, dest);
}

if (!opts.dryRun) {
  const leftover = existsSync(opts.dest)
    ? readdirSync(opts.dest).filter((n) => /\.(bak|new)-/.test(n))
    : [];
  if (leftover.length) console.log(`警告：安装目录残留备份：${leftover.join(", ")}`);
}
