#!/usr/bin/env node
/**
 * 恢复中断的评审。
 *
 *   node scripts/resume.mjs [root] --list
 *   node scripts/resume.mjs [root] [--type design|impl] [--id <YYYY-MM-DD>-<type>] [--json] [--force]
 *
 * 规则：
 *   - 扫描 <root>/.design-code-reviewer/*-{design,impl}/state.yaml，按 mtime 倒序
 *   - 无未完成：提示并退出 0
 *   - 恰好 1 个：直接恢复
 *   - ≥2 个：列出并要求 --id 选择，退出码 3
 *   - 指定 id 且已 closed：拒绝，退出码 1
 *   - plan.json 与 state 记录的 sha 不一致：拒绝，退出码 4（--force 可覆盖）
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverReviews, isValidId } from "./lib/layout.mjs";
import { loadState, reconcile, sha256File, loadPlan } from "./lib/review-state.mjs";

const argv = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) args[k] = true;
    else { args[k] = n; i++; }
  } else args._.push(a);
}

const root = resolve(args._[0] || ".");
const asJson = args.json === true;
const all = discoverReviews(root).filter((r) => !args.type || r.type === args.type);

const invalid = all.filter((r) => r.error || !r.state);
const valid = all.filter((r) => !r.error && r.state);
const unfinished = valid.filter((r) => r.state.state !== "closed");

const fmtTime = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

function printList(rows) {
  if (!rows.length) { console.log("（无评审）"); return; }
  console.log("| id | 类型 | 状态 | 完成/总数 | 更新时间 |");
  console.log("|---|---|---|---|---|");
  for (const r of rows) {
    const rec = r.state.recovery || {};
    console.log(`| ${r.id} | ${r.type} | ${r.state.state || "-"} | ${rec.done ?? 0}/${r.state.plan?.total_batches ?? "-"} | ${fmtTime(r.mtime)} |`);
  }
}

if (args.list) {
  if (asJson) console.log(JSON.stringify({ root, reviews: valid.map((r) => ({ id: r.id, type: r.type, state: r.state.state, mtime: r.mtime, recovery: r.state.recovery })), invalid: invalid.map((r) => r.id) }, null, 2));
  else {
    printList(valid);
    if (invalid.length) console.log(`\n无法解析：${invalid.map((r) => r.id).join("、")}`);
  }
  process.exit(0);
}

function pick() {
  if (args.id) {
    if (!isValidId(args.id)) { console.error(`resume: 非法 id ${args.id}`); process.exit(2); }
    const hit = valid.find((r) => r.id === args.id);
    if (!hit) { console.error(`resume: 未找到评审 ${args.id}`); process.exit(2); }
    return hit;
  }
  if (unfinished.length === 1) return unfinished[0];
  if (unfinished.length === 0) {
    console.log("没有未完成的评审。用 --list 查看历史评审。");
    process.exit(0);
  }
  printList(unfinished);
  console.error(`\n有 ${unfinished.length} 个未完成评审，请用 --id <id> 指定要恢复的一个。`);
  process.exit(3);
}

const target = pick();
if (target.state.state === "closed") {
  console.error(`resume: ${target.id} 已 closed，不能恢复；要修结论请开新一轮。`);
  process.exit(1);
}

const stateSha = target.state.plan?.sha256;
const planFile = join(target.dir, "plan.json");
if (!existsSync(planFile)) { console.error(`resume: 缺 plan.json：${planFile}`); process.exit(4); }
const actual = sha256File(planFile);
if (stateSha && actual !== stateSha && !args.force) {
  console.error(`resume: plan.json 已被改动（sha 不匹配）。确认无碍后加 --force。`);
  process.exit(4);
}

const plan = loadPlan(target.dir);
const result = reconcile(target.dir);
const st = loadState(target.dir);
const pendingSteps = Object.entries(st.steps || {})
  .filter(([, v]) => v.status !== "done" && v.status !== "skipped")
  .map(([k, v]) => ({ id: k, status: v.status }));
const nextBatches = result.pending;
const payload = {
  review_id: target.id,
  type: target.type,
  dir: target.dir,
  state: st.state,
  recovery: { done: result.done, pending: result.pending, discarded: result.discarded, skipped: result.skipped },
  partial_batches: result.partial || [],
  next_batches: nextBatches,
  pending_steps: pendingSteps,
  interruptions: st.interruptions || [],
  report: st.report || null,
  plan_batches: (plan.batches || []).length
};

if (asJson) console.log(JSON.stringify(payload, null, 2));
else {
  console.log(`恢复评审：${payload.review_id}（${payload.type}）`);
  console.log(`目录：${payload.dir}`);
  console.log(`完成 ${result.done.length} / 待跑 ${result.pending.length} / 丢弃 ${result.discarded.length} / 跳过 ${result.skipped.length}`);
  if (nextBatches.length) console.log(`下一批：${nextBatches.slice(0, 5).join(", ")}${nextBatches.length > 5 ? " …" : ""}`);
  if (pendingSteps.length) console.log(`待办步骤：${pendingSteps.map((s) => s.id).join(", ")}`);
  if (payload.partial_batches.length) {
    for (const p of payload.partial_batches) console.log(`未完成批：${p.batch} 已填 ${p.filled} 格，从 ${p.next_cell} 继续`);
  }
  if (payload.interruptions.length) console.log(`历史中断：${payload.interruptions.length} 次`);
  console.log("\n从 next_batches 继续；每批完成后用 state.mjs batch 落盘。");
}
process.exit(result.pending.length ? 0 : 0);
