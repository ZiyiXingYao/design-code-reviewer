#!/usr/bin/env node
/**
 * 跨次评审账本。
 *
 *   node scripts/ledger.mjs <projectRoot> sync <reviewDir> [--json]
 *   node scripts/ledger.mjs <projectRoot> list [--status open|fixed|accepted|false-positive] [--json]
 *   node scripts/ledger.mjs <projectRoot> close <L-id|fingerprint> --status fixed --reason "…"
 */

import { listEntries, closeEntry, syncForReview } from "./lib/ledger.mjs";

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

function fail(msg) { console.error(`ledger: ${msg}`); process.exit(1); }

const root = args._[0];
const cmd = args._[1];
if (!root) fail("缺少 projectRoot");
if (!cmd) fail("缺少子命令（sync|list|close）");

if (cmd === "sync") {
  const reviewDir = args._[2];
  if (!reviewDir) fail("缺少 reviewDir");
  const res = syncForReview(root, reviewDir);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else console.log(`账本已更新：新增 ${res.created} / 仍存在 ${res.updated} / 总计 ${res.total}`);
} else if (cmd === "list") {
  const res = listEntries(root, args.status);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log("| 编号 | 状态 | 级别 | 标题 | 类型 |");
    console.log("|---|---|---|---|---|");
    for (const e of res.entries) console.log(`| ${e.id} | ${e.status} | ${e.level} | ${String(e.title).replace(/\|/g, "/").slice(0, 60)} | ${e.review_type} |`);
    if (!res.entries.length) console.log("（空）");
  }
} else if (cmd === "close") {
  const id = args._[2];
  if (!id) fail("缺少 L-id 或 fingerprint");
  if (!args.status) fail("缺少 --status");
  const e = closeEntry(root, id, args.status, args.reason || "");
  console.log(JSON.stringify({ ok: true, id: e.id, status: e.status }, null, 2));
} else fail(`未知子命令：${cmd}`);
