#!/usr/bin/env node
/**
 * 评审流程状态 CLI —— 唯一有权写 state.yaml 的入口。
 *
 *   state.mjs init <dir> --type design|impl --plan <plan.json> [--mode full|delta] [--from rev] [--to rev] [--tier 标准档]
 *   state.mjs recover <dir> [--json]
 *   state.mjs batch <dir> --payload <batch.json> [--agent id] [--ms n]
 *   state.mjs heartbeat <dir> --id b01 --beat 3
 *   state.mjs step <dir> --id A2 --status running|done|failed|skipped [--reason ...] [--done 7] [--total 15] [--output file]
 *   state.mjs agent <dir> --role scout-s1 --agent-id sub-a01 [--findings 4] [--retries 0] [--coverage-note "..."]
 *   state.mjs stats <dir> --accusations 27 --upheld 12 --dismissed 9 --unresolved 6 --valid-defense 8 --defended 18 [--escalated 0] [--first-round 27]
 *   state.mjs transition <dir> <scoped|scanning|verifying|reported|closed> --reason "..."   # reported 自动交付 REPORT/SUMMARY
 *   state.mjs deliver <dir> [--out <dir>]   # 报告修订后重新交付，供人工评审
 *   state.mjs interruption <dir> --batch b12 --reason "..." --action "..."
 *   state.mjs show <dir>
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { auditDir, deliverArtifacts, makeReviewId, rel, workDir } from "./lib/layout.mjs";
import { atomicWrite } from "./lib/review-state.mjs";
import { generateTaskMd } from "./lib/task-plan.mjs";
import { syncForReview } from "./lib/ledger.mjs";
import {
  addLog, commitBatch, initReview, loadState, reconcile, saveState, updateState,
  appendProgress, computeCoverage, loadPlan, loadBatches
} from "./lib/review-state.mjs";

function fail(msg) { console.error(`state: ${msg}`); process.exit(1); }

/** reported 阶段就要交付给人工评审的成品；task.md 批准后才生成 */
const DELIVERED_AT_REPORTED = ["REPORT.md", "SUMMARY.md"];

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
    const mode = args.mode || (args.type === "impl" ? "delta" : "full");
    if (!["full", "delta"].includes(mode)) fail(`未知 --mode：${mode}（full|delta）`);
    if (mode === "delta" && !args.from) fail("增量模式必须给 --from <rev>（变更起点）");
    const spec = JSON.parse(readFileSync(resolve(args.plan), "utf8"));
    const state = initReview(reviewDir, {
      type: args.type,
      reviewId: id,
      root,
      mode,
      from: args.from || "",
      to: args.to || "HEAD",
      tier: args.tier || "standard",
      maxConcurrency: args["max-concurrency"] ? Number(args["max-concurrency"]) : 4,
      expected: spec.expected || {},
      steps: spec.steps || [],
      batches: spec.batches || [],
      planExtra: {
        ...(spec.coverage_floor_exempt ? { coverage_floor_exempt: true } : {}),
        ...(spec.scope_file ? { scope_file: spec.scope_file } : {})
      },
      scopeFile: spec.scope_file || "",
      commit: args.commit || "",
      designState: args["design-state"] || "",
      reopen: args.reopen ? Number(args.reopen) : 0,
      bench: args.bench || ""
    });
    console.log(JSON.stringify({ ok: true, review_id: id, mode, range: state.range || null, dir: reviewDir, audit: auditDir(root, id), batches: state.plan.total_batches }, null, 2));
    break;
  }
  case "recover": {
    const s = reconcile(dir);
    saveState(dir, s.state);
    appendProgress(dir, { batch: "-", status: "recovery", ts: new Date().toISOString(), done: s.done.length, pending: s.pending.length, discarded: s.discarded.length });
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
  case "partial": {
    if (!args.batch || !args.payload) fail("缺少 --batch / --payload");
    if (loadState(dir).state === "closed") fail("评审已 closed，拒绝写入");
    const payload = JSON.parse(readFileSync(resolve(args.payload), "utf8"));
    const filled = payload.filled_cells || [];
    const out = {
      batch: args.batch, group: payload.group || "", unit: payload.unit || "",
      filled_cells: filled, cells: payload.cells || [],
      partial_findings: payload.partial_findings || payload.findings || [],
      updated_at: new Date().toISOString()
    };
    atomicWrite(join(dir, "batches", `${args.batch}.partial.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`已记录 partial ${args.batch}：${filled.length} 格（下一格 #${filled.length + 1}）`);
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
        started: args.started || undefined,
        ended: args.ended || undefined,
        tokens: args.tokens ? Number(args.tokens) : undefined,
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
      const accusations = n("accusations");
      const defended = args.defended === undefined ? accusations : n("defended");
      const firstRound = args["first-round"] === undefined ? accusations : n("first-round");
      st.adversarial.stats = {
        accusations, upheld: n("upheld"), dismissed: n("dismissed"),
        unresolved: n("unresolved"), valid_defense: n("valid-defense"),
        defended, escalated: n("escalated"), first_round: firstRound
      };
      const t = accusations || 1;
      st.adversarial.rates = {
        uphold_rate: Number((st.adversarial.stats.upheld / t).toFixed(3)),
        unresolved_rate: Number((st.adversarial.stats.unresolved / t).toFixed(3)),
        escalation_rate: Number((st.adversarial.stats.escalated / (firstRound || 1)).toFixed(3)),
        valid_defense_rate: Number((st.adversarial.stats.valid_defense / (defended || 1)).toFixed(3))
      };
    });
    console.log(JSON.stringify(s.adversarial.stats));
    break;
  }
  case "transition": {
    const to = args._[1];
    if (!to) fail("缺少目标状态");
    if (!["scoped", "scanning", "verifying", "reported", "closed"].includes(to)) fail(`非法状态 ${to}`);
    const before = loadState(dir);
    const root = before.root ? resolve(before.root) : resolve(".");
    let delivered = null;
    if (to === "reported") {
      // 人工评审的对象是交付目录里的成品，进 reported 前必须先落盘
      for (const f of DELIVERED_AT_REPORTED) {
        const fp = join(dir, f);
        if (!existsSync(fp) || statSync(fp).size === 0) fail(`进入 reported 前必须写好 ${f}`);
      }
      const out = auditDir(root, before.review_id || basename(dir));
      const files = deliverArtifacts(dir, out, DELIVERED_AT_REPORTED);
      delivered = { dir: rel(root, out), files, at: new Date().toISOString() };
    }
    const s = updateState(dir, (st) => {
      addLog(st, to, args.reason || "");
      if (delivered) st.report = { dir: delivered.dir, files: delivered.files, delivered_at: delivered.at };
    });
    console.log(delivered
      ? `状态 -> ${s.state}；已交付 ${delivered.files.join(" / ")} 到 ${delivered.dir}`
      : `状态 -> ${s.state}`);
    break;
  }
  case "deliver": {
    // 人工评审提出疑问后报告可能被修订，重新交付保证交付目录与工作副本一致
    const st = loadState(dir);
    if (st.state === "closed") fail("评审已 closed，交付物已定稿，拒绝覆盖");
    for (const f of DELIVERED_AT_REPORTED) {
      const fp = join(dir, f);
      if (!existsSync(fp) || statSync(fp).size === 0) fail(`缺少或为空：${f}`);
    }
    const root = st.root ? resolve(st.root) : resolve(".");
    const out = args.out ? resolve(args.out) : auditDir(root, st.review_id || basename(dir));
    const files = deliverArtifacts(dir, out, DELIVERED_AT_REPORTED);
    updateState(dir, (s) => {
      s.report = { ...(s.report || {}), dir: rel(root, out), files, delivered_at: new Date().toISOString() };
    });
    console.log(`已交付 ${files.join(" / ")} 到 ${rel(root, out)}`);
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
    fail("promote 已由 approve 取代：node state.mjs approve <reviewDir> --reviewer \"<name>\"");
    break;
  }

  case "approve": {
    if (typeof args.reviewer !== "string" || !args.reviewer.trim()) fail("缺少 --reviewer（人工批准人）");
    const st = loadState(dir);
    if (st.state === "closed") fail("评审已 closed，无需重复 approve");
    if (st.state !== "reported") fail(`当前状态 ${st.state}，需先完成报告并进入 reported`);

    const gateFile = join(dir, "gate-result.md");
    if (!existsSync(gateFile)) fail("缺 gate-result.md，请先运行 gate.mjs");
    if (!/结论：通过/.test(readFileSync(gateFile, "utf8"))) fail("gate 未通过，拒绝批准");

    for (const f of ["REPORT.md", "SUMMARY.md"]) {
      const fp = join(dir, f);
      if (!existsSync(fp) || statSync(fp).size === 0) fail(`缺少或为空：${f}`);
    }

    const readJson = (name) => {
      const fp = join(dir, name);
      if (!existsSync(fp)) fail(`缺少 ${name}`);
      return JSON.parse(readFileSync(fp, "utf8"));
    };
    const findings = readJson("05-findings.json").findings || [];
    const verdict = readJson("08-verdict.json");
    const accusations = readJson("06-accusations.json").accusations || [];
    const taskPath = join(dir, "task.md");
    const existing = existsSync(taskPath) ? readFileSync(taskPath, "utf8") : "";

    const p0 = verdict.verdicts.filter((v) => v.decision === "upheld" && v.level === "P0").length;
    const p1 = verdict.verdicts.filter((v) => v.decision === "upheld" && v.level === "P1").length;
    const conclusion = args.conclusion || (p0 > 0 ? "不通过" : p1 > 0 ? "有条件通过" : "通过");

    const gen = generateTaskMd({
      reviewId: st.review_id || basename(dir),
      reviewType: st.review_type,
      reviewer: args.reviewer,
      at: new Date().toISOString(),
      conclusion,
      findings,
      verdicts: verdict.verdicts || [],
      accusations,
      includeP2: args["include-p2"] === true,
      existing
    });
    if (!gen.ok) fail(`任务生成失败：${gen.errors.join("；")}`);
    atomicWrite(taskPath, gen.markdown);

    const root = st.root ? resolve(st.root) : resolve(".");
    const ledgerRes = syncForReview(root, dir);
    // 复核交付：评审期间报告可能被修订，批准时三件一起重写，避免交付目录留下旧稿
    const out = args.out ? resolve(args.out) : auditDir(root, st.review_id || basename(dir));
    const files = [...DELIVERED_AT_REPORTED, "task.md"];
    const copied = deliverArtifacts(dir, out, files);
    if (copied.length !== files.length) fail(`交付不完整，缺：${files.filter((f) => !copied.includes(f)).join("、")}`);

    // 可读裁断表（工作产物，不进入交付三件套）
    const verdictJson = readJson("08-verdict.json");
    const lines = ["# 裁断表", "", "| 指控 | 裁定 | 最终级别 | 理由 |", "|---|---|---|---|"];
    for (const v of verdictJson.verdicts || []) lines.push(`| ${v.accusation_id} | ${v.decision} | ${v.level} | ${String(v.reason || "").replace(/\|/g, "/")} |`);
    atomicWrite(join(dir, "08-verdict.md"), lines.join("\n") + "\n");

    updateState(dir, (s) => {
      s.report = { dir: rel(root, out), files: copied, delivered_at: new Date().toISOString() };
      s.approval = { reviewer: args.reviewer, at: new Date().toISOString(), note: args.note || "" };
      addLog(s, "closed", `人工批准（${args.reviewer}），生成 task.md 并交付`);
    });
    console.log(JSON.stringify({ ok: true, audit: out, files: copied, tasks: gen.tasks.length, ledger: { created: ledgerRes.created, updated: ledgerRes.updated, total: ledgerRes.total }, task_md: join(out, "task.md") }, null, 2));
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
