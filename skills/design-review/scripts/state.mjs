#!/usr/bin/env node
/**
 * 评审流程状态 CLI —— 唯一有权写 state.yaml 的入口。
 *
 *   state.mjs init <dir> --type design|impl --plan <plan.json> [--tier 标准档] [--commit sha]
 *   state.mjs recover <dir> [--json]
 *   state.mjs batch <dir> --payload <batch.json> [--agent id] [--ms n]
 *   state.mjs heartbeat <dir> --id b01 --beat 3
 *   state.mjs step <dir> --id A2 --status running|done|failed|skipped [--reason ...] [--done 7] [--total 15] [--output file]
 *   state.mjs agent <dir> --role scout-s1 --agent-id sub-a01 [--findings 4] [--retries 0] [--coverage-note "..."]
 *   state.mjs stats <dir> --accusations 27 --upheld 12 --dismissed 9 --unresolved 6 --valid-defense 8 [--escalated 0]
 *   state.mjs transition <dir> <scoped|scanning|verifying|reported|closed> --reason "..."
 *   state.mjs interruption <dir> --batch b12 --reason "..." --action "..."
 *   state.mjs show <dir>
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { auditDir, makeReviewId, rel, workDir } from "./lib/layout.mjs";
import {
  addLog, commitBatch, initReview, loadState, reconcile, saveState, updateState,
  appendProgress, computeCoverage, loadPlan, loadBatches
} from "./lib/review-state.mjs";

function fail(msg) { console.error(`state: ${msg}`); process.exit(1); }

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parse(rest);
const dir = args._[0] ? resolve(args._[0]) : null;

if (!cmd) fail("缺少子命令（init|recover|batch|heartbeat|step|agent|stats|transition|interruption|show）");
if (cmd !== "init" && !dir) fail("缺少评审目录");

switch (cmd) {
  case "init": {
    if (!args.type) fail("缺少 --type");
    if (!args.plan) fail("缺少 --plan（批次计划 JSON）");
    const root = resolve(args._[0] || ".");
    const id = args.id || makeReviewId(root, args.type);
    const reviewDir = workDir(root, id);
    const spec = JSON.parse(readFileSync(resolve(args.plan), "utf8"));
    const state = initReview(reviewDir, {
      type: args.type,
      reviewId: id,
      root,
      tier: args.tier || "standard",
      maxConcurrency: args["max-concurrency"] ? Number(args["max-concurrency"]) : 4,
      expected: spec.expected || {},
      steps: spec.steps || [],
      batches: spec.batches || [],
      commit: args.commit || "",
      designState: args["design-state"] || "",
      reopen: args.reopen ? Number(args.reopen) : 0,
      bench: args.bench || ""
    });
    console.log(JSON.stringify({ ok: true, review_id: id, dir: reviewDir, audit: auditDir(root, id), batches: state.plan.total_batches }, null, 2));
    break;
  }
  case "recover": {
    const s = reconcile(dir);
    console.log(args.json ? JSON.stringify(s, null, 2)
      : `恢复：完成 ${s.done.length} / 待跑 ${s.pending.length} / 丢弃 ${s.discarded.length} / 跳过 ${s.skipped.length}`);
    break;
  }
  case "batch": {
    if (!args.payload) fail("缺少 --payload");
    const payload = JSON.parse(readFileSync(resolve(args.payload), "utf8"));
    const s = commitBatch(dir, { payload, agent: args.agent || "", ms: args.ms ? Number(args.ms) : 0 });
    console.log(`已落盘 ${payload.batch}；完成 ${s.done.length}/${s.done.length + s.pending.length}`);
    break;
  }
  case "heartbeat": {
    if (!args.id) fail("缺少 --id");
    appendProgress(dir, { batch: args.id, status: "running", beat: Number(args.beat || 1), ts: new Date().toISOString() });
    console.log(`心跳 ${args.id}`);
    break;
  }
  case "step": {
    if (!args.id || !args.status) fail("缺少 --id / --status");
    if (loadState(dir).state === "closed") fail("评审已 closed，拒绝写入");
    const s = updateState(dir, (st) => {
      const cur = st.steps[args.id] || {};
      const next = { ...cur, status: args.status, at: new Date().toISOString() };
      if (args.reason) next.reason = args.reason;
      if (args.output) next.output = args.output;
      if (args.done !== undefined) next.done = Number(args.done);
      if (args.total !== undefined) next.total = Number(args.total);
      if (args.status === "skipped" && !args.reason) fail("skipped 必须带 --reason");
      st.steps[args.id] = next;
      if (args.status === "running" && st.state === "scoped") addLog(st, "scanning", `${args.id} 开始`);
    });
    console.log(`步骤 ${args.id} -> ${s.steps[args.id].status}`);
    break;
  }
  case "agent": {
    if (!args.role) fail("缺少 --role");
    const s = updateState(dir, (st) => {
      st.adversarial = st.adversarial || { rounds: 0, agents: [], stats: {} };
      st.adversarial.agents = st.adversarial.agents || [];
      const rec = {
        role: args.role,
        agent_id: args["agent-id"] || "",
        findings: args.findings ? Number(args.findings) : undefined,
        retries: args.retries ? Number(args.retries) : 0,
        coverage_note: args["coverage-note"] || undefined,
        failed: args.failed === true || args.failed === "true" ? true : undefined,
        at: new Date().toISOString()
      };
      const idx = st.adversarial.agents.findIndex((a) => a.role === rec.role);
      if (idx >= 0) st.adversarial.agents[idx] = { ...st.adversarial.agents[idx], ...rec };
      else st.adversarial.agents.push(rec);
    });
    console.log(`已记录子代理 ${args.role}（共 ${s.adversarial.agents.length}）`);
    break;
  }
  case "stats": {
    const s = updateState(dir, (st) => {
      st.adversarial = st.adversarial || { rounds: 0, agents: [] };
      const n = (k) => (args[k] === undefined ? 0 : Number(args[k]));
      st.adversarial.stats = {
        accusations: n("accusations"), upheld: n("upheld"), dismissed: n("dismissed"),
        unresolved: n("unresolved"), valid_defense: n("valid-defense"), escalated: n("escalated")
      };
      const t = st.adversarial.stats.accusations || 1;
      st.adversarial.rates = {
        uphold_rate: Number((st.adversarial.stats.upheld / t).toFixed(3)),
        unresolved_rate: Number((st.adversarial.stats.unresolved / t).toFixed(3)),
        escalation_rate: Number((st.adversarial.stats.escalated / t).toFixed(3))
      };
    });
    console.log(JSON.stringify(s.adversarial.stats));
    break;
  }
  case "transition": {
    const to = args._[1];
    if (!to) fail("缺少目标状态");
    if (!["scoped", "scanning", "verifying", "reported", "closed"].includes(to)) fail(`非法状态 ${to}`);
    const s = updateState(dir, (st) => addLog(st, to, args.reason || ""));
    console.log(`状态 -> ${s.state}`);
    break;
  }
  case "interruption": {
    if (!args.batch) fail("缺少 --batch");
    const s = updateState(dir, (st) => {
      st.interruptions = st.interruptions || [];
      st.interruptions.push({
        at: new Date().toISOString(),
        batch: args.batch,
        reason: args.reason || "",
        recovered_at: args["recovered-at"] || "",
        action: args.action || ""
      });
    });
    console.log(`已记录中断 ${args.batch}（共 ${s.interruptions.length}）`);
    break;
  }
  case "promote": {
    const st = loadState(dir);
    if (st.state === "closed") fail("评审已 closed，无需重复 promote");
    const gateFile = join(dir, "gate-result.md");
    if (!existsSync(gateFile)) fail("缺 gate-result.md，请先运行 gate.mjs");
    const gateText = readFileSync(gateFile, "utf8");
    if (!/结论：通过/.test(gateText)) fail("gate 未通过，拒绝 promote");
    const reports = ["REPORT.md", "SUMMARY.md"];
    for (const f of reports) {
      const fp = join(dir, f);
      if (!existsSync(fp) || statSync(fp).size === 0) fail(`缺少或为空：${f}`);
    }
    const root = st.root ? resolve(st.root) : resolve(".");
    const out = args.out ? resolve(args.out) : auditDir(root, st.review_id || basename(dir));
    mkdirSync(out, { recursive: true });
    for (const f of reports) copyFileSync(join(dir, f), join(out, f));
    updateState(dir, (s) => {
      s.report = { dir: rel(root, out), files: reports };
      addLog(s, "closed", "promote 完成，报告已交付");
    });
    console.log(JSON.stringify({ ok: true, audit: out, files: reports }, null, 2));
    break;
  }

  case "show": {
    const st = loadState(dir);
    const plan = loadPlan(dir);
    const batches = loadBatches(dir).map((b) => b.payload);
    console.log(`type=${st.review_type} tier=${st.tier} state=${st.state}`);
    console.log(`batches=${st.plan?.total_batches} 完成=${st.recovery?.done} 待跑=${st.recovery?.pending}`);
    console.log("coverage=" + JSON.stringify(computeCoverage(plan, batches)));
    break;
  }
  default:
    fail(`不认识的子命令：${cmd}`);
}
