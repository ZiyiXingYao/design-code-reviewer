#!/usr/bin/env node
/**
 * 出报告前的强制闸门。不通过 -> 退出码 1，报告只能标 DRAFT。
 *
 *   node scripts/gate.mjs <reviewDir> [--json]
 *
 * 校验对象：plan.json / batches/*.json / state.yaml / 06-accusations.json /
 *           07-defense.json / 08-verdict.json / REPORT.md / SUMMARY.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPlan, loadState, listBatchFiles, loadBatches, computeCoverage } from "./lib/review-state.mjs";
import { checkFloor } from "./lib/plan-floor.mjs";

const dir = process.argv[2];
if (!dir) { console.error("用法: node gate.mjs <reviewDir> [--json]"); process.exit(2); }
const asJson = process.argv.includes("--json");
const allowPartialCoverage = process.argv.includes("--allow-partial-coverage");

const results = [];
function check(id, ok, detail, blocking = true) {
  results.push({ id, ok, detail, blocking });
}
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };

let plan, state, batches;
try {
  plan = loadPlan(dir);
  state = loadState(dir);
  batches = loadBatches(dir).map((b) => b.payload);
} catch (err) {
  console.error(`gate: 无法读取评审目录：${err.message}`);
  process.exit(2);
}

// G1 步骤完整性
{
  const expected = plan.steps || [];
  const missing = [];
  const bad = [];
  for (const id of expected) {
    const s = state.steps?.[id];
    if (!s) missing.push(id);
    else if (s.status !== "done" && s.status !== "skipped") bad.push(`${id}:${s.status}`);
    else if (s.status === "skipped" && !s.reason) bad.push(`${id}:skipped 无 reason`);
  }
  check("G1 步骤完整性", missing.length === 0 && bad.length === 0,
    missing.length || bad.length ? `缺 ${missing.join(",") || "-"}；未完成 ${bad.join(",") || "-"}` : `${expected.length} 步全部终态`);
}

// G2 批产物完整 + 原子性痕迹
{
  const files = listBatchFiles(dir);
  const tmps = files.filter((n) => n.endsWith(".tmp"));
  const partials = files.filter((n) => n.endsWith(".partial.json"));
  const byId = new Map(batches.map((b) => [b.batch, b]));
  const missing = (plan.batches || []).filter((b) => !byId.has(b.id)).map((b) => b.id);
  const unfinished = (plan.batches || []).filter((b) => {
    const p = byId.get(b.id);
    return p && !["done", "skipped"].includes(p.status);
  }).map((b) => `${b.id}:${byId.get(b.id).status}`);
  const extra = batches.filter((b) => !(plan.batches || []).some((x) => x.id === b.batch)).map((b) => b.batch);
  const skippedNoReason = batches.filter((b) => b.status === "skipped" && !b.reason).map((b) => b.batch);
  check("G2 批产物完整", !missing.length && !unfinished.length && !extra.length && !skippedNoReason.length && !tmps.length && !partials.length,
    `缺 ${missing.join(",") || "-"}；未终态 ${unfinished.join(",") || "-"}；计划外 ${extra.join(",") || "-"}；tmp ${tmps.length}；partial ${partials.length}`);
}

// G3 覆盖度
{
  const cov = computeCoverage(plan, batches);
  const fails = [];
  for (const [kind, v] of Object.entries(plan.expected || {})) {
    const got = cov[kind]?.done ?? 0;
    if (got < v) fails.push(`${kind} ${got}/${v}`);
  }
  check("G3 覆盖度", fails.length === 0, fails.length ? fails.join("；") : JSON.stringify(cov));
}

// 发现质量 + 收集最终级别（有去重产物时以 05-findings.json 为权威）
const merged = readJson(join(dir, "05-findings.json"));
const findings = merged?.findings?.length
  ? merged.findings.map((f) => ({ ...f, batch: f.sources?.[0]?.batch || "merged" }))
  : batches.flatMap((b) => (b.findings || []).map((f) => ({ ...f, batch: b.batch })));
{
  const bad = [];
  for (const f of findings) {
    if (!f.id) bad.push(`${f.batch}:缺 id`);
    if (!/^P[0-3]$/.test(f.level || "")) bad.push(`${f.id || f.batch}:级别非法 ${f.level}`);
    if (!f.location) bad.push(`${f.id}:缺 location`);
    if (!f.mechanism) bad.push(`${f.id}:缺 mechanism`);
    if (plan.review_type === "design" && !f.counterexample) bad.push(`${f.id}:设计侧必须有反例`);
    if (plan.review_type === "impl" && !f.trigger) bad.push(`${f.id}:代码侧必须有触发条件`);
  }
  check("G4 发现质量", bad.length === 0, bad.length ? bad.slice(0, 10).join("；") : `${findings.length} 条均含位置/机制/反例或触发条件`);
}

// G5 对抗完整性 + G6 无折中
const acc = readJson(join(dir, "06-accusations.json"));
const def = readJson(join(dir, "07-defense.json"));
const verdict = readJson(join(dir, "08-verdict.json"));
{
  const problems = [];
  if (!acc || !Array.isArray(acc.accusations)) problems.push("06-accusations.json 缺失或格式错误");
  if (!def || !Array.isArray(def.defenses)) problems.push("07-defense.json 缺失或格式错误");
  if (!verdict || !Array.isArray(verdict.verdicts)) problems.push("08-verdict.json 缺失或格式错误");
  if (!problems.length) {
    const accById = new Map(acc.accusations.map((a) => [a.id, a]));
    const finalLevel = new Map();
    for (const v of verdict.verdicts) {
      if (!["upheld", "dismissed", "unresolved"].includes(v.decision)) problems.push(`${v.accusation_id}:非法裁断 ${v.decision}`);
      if (/部分成立|有一定道理|综合意见|折中/.test(v.reason || "")) problems.push(`${v.accusation_id}:出现折中结论`);
      const a = accById.get(v.accusation_id);
      if (!a) problems.push(`${v.accusation_id}:裁断无对应指控`);
      else for (const fid of a.source_findings || []) finalLevel.set(fid, v);
    }
    for (const f of findings.filter((x) => x.level === "P0" || x.level === "P1")) {
      const v = finalLevel.get(f.id);
      if (!v) { problems.push(`${f.id}(${f.level}) 未经红-蓝-裁`); continue; }
      if (v.decision === "dismissed" && ["P0", "P1"].includes(v.level)) problems.push(`${f.id}:已驳回却仍定 ${v.level}`);
      if (v.decision === "upheld" && !["P0", "P1"].includes(v.level)) problems.push(`${f.id}:成立却定 ${v.level}`);
    }
  }
  check("G5 对抗完整性", problems.length === 0, problems.slice(0, 10).join("；") || "所有 P0/P1 均有裁断，无折中");
}

// G7 基准等级标注
{
  const report = read(join(dir, "REPORT.md"));
  const summary = read(join(dir, "SUMMARY.md"));
  if (plan.review_type !== "impl") {
    check("G7 基准等级标注", true, "设计侧不适用", false);
  } else {
    const problems = [];
    if (!report) problems.push("缺 REPORT.md");
    else {
      const m = report.match(/基准[:：]\s*(L[012])/);
      if (!m) problems.push("REPORT.md 未见「基准: L0/L1/L2」");
      if (m && m[1] === "L0" && /符合设计/.test(report)) problems.push("L0 报告出现「符合设计」");
      if (m && m[1] === "L0" && summary && /符合设计/.test(summary)) problems.push("L0 的 SUMMARY 出现「符合设计」");
    }
    if (!summary) problems.push("缺 SUMMARY.md");
    else if (!/L[012]/.test(summary.split("\n").slice(0, 8).join("\n"))) problems.push("SUMMARY.md 首段未标基准等级");
    check("G7 基准等级标注", problems.length === 0, problems.join("；") || "等级已标注");
  }
}

// G8 可追溯
{
  const report = read(join(dir, "REPORT.md"));
  const problems = [];
  if (!report) problems.push("缺 REPORT.md");
  else {
    const ids = [...report.matchAll(/\b(F|I)-\d{3}\b/g)].map((m) => m[0]);
    const known = new Set(findings.map((f) => f.id));
    const unknown = [...new Set(ids)].filter((id) => !known.has(id));
    if (unknown.length) problems.push(`报告引用了批产物中不存在的条目：${unknown.slice(0, 8).join(",")}`);
    if (!ids.length) problems.push("报告未引用任何发现编号");
  }
  check("G8 报告可追溯", problems.length === 0, problems.join("；") || "报告中发现编号均可回溯到批产物");
}

// G16 覆盖下限
{
  const floor = checkFloor(plan);
  const exempt = allowPartialCoverage || plan.coverage_floor_exempt === true;
  check("G16 覆盖下限", floor.ok || exempt,
    (floor.problems.join("；") || "满足下限") + (exempt && !floor.ok ? "（已显式豁免）" : ""),
    !exempt);
}

// G17 批量/子代理上限
{
  const problems = [];
  for (const b of batches) {
    if ((b.findings || []).length > 15) problems.push(`${b.batch} findings ${b.findings.length} > 15`);
    if ((b.cells || []).length > 25) problems.push(`${b.batch} cells ${b.cells.length} > 25`);
  }
  const agents = state.adversarial?.agents || [];
  if (agents.length > 14) problems.push(`子代理 ${agents.length} > 14`);
  check("G17 批量上限", problems.length === 0, problems.join("；") || "未超限");
}

// G15 账本（closed 时）
{
  if (state.state !== "closed") check("G15 账本", true, "未 closed，跳过", false);
  else {
    const ok = state.ledger?.synced === true;
    check("G15 账本", ok, ok ? `已同步（新增 ${state.ledger.new} / 仍存在 ${state.ledger.still}）` : "closed 但未同步账本");
  }
}

// G13 顺序：去重必须先于对抗
{
  const pairs = plan.review_type === "design" ? [["A4.5", "A5a"]] : [["B6.5", "B7a"]];
  const problems = [];
  for (const [pre, post] of pairs) {
    const a = state.steps?.[pre];
    const b = state.steps?.[post];
    if (a?.status === "done" && b?.status === "done" && a.at && b.at && a.at > b.at) {
      problems.push(`${pre} 完成时间晚于 ${post}：去重未先于对抗`);
    }
  }
  check("G13 步骤顺序", problems.length === 0, problems.join("；") || "去重先于对抗", false);
}

// G9 收口完整（SUMMARY 六节 + design 交接块）
{
  const summary = read(join(dir, "SUMMARY.md"));
  const report = read(join(dir, "REPORT.md"));
  const need = ["一句话结论", "最该关心的三件事", "必办清单", "已接受的风险", "数字概览", "本次没看什么"];
  const missing = summary ? need.filter((h) => !new RegExp(`^##+ .*${h}`, "m").test(summary)) : need;
  const problems = [];
  if (missing.length) problems.push(`SUMMARY 缺节：${missing.join(",")}`);
  if (plan.review_type === "design" && report && !/##\s*交接块/.test(report)) problems.push("设计报告缺交接块");

  // 重复发现（同标题 + 同位置）
  const seen = new Map();
  for (const f of findings) {
    const key = `${String(f.title).replace(/\s+/g, "")}|${String(f.location).replace(/:\d+(?:-\d+)?/g, "")}`;
    if (seen.has(key)) problems.push(`重复发现：${seen.get(key)} 与 ${f.id}`);
    else seen.set(key, f.id);
  }
  check("G9 收口完整", problems.length === 0, problems.join("；") || "SUMMARY 六节齐全，交接块存在，无重复发现");

  // P0/P1 的 depends_on：只在缺失时提示，不阻断
  const noDep = findings.filter((f) => ["P0", "P1"].includes(f.level) && !Array.isArray(f.depends_on)).map((f) => f.id);
  check("G9b depends_on", noDep.length === 0, noDep.length ? `缺少 depends_on：${noDep.slice(0, 8).join(",")}` : "P0/P1 均声明依赖", false);
}

// G10 扫描组完整
{
  const agents = state.adversarial?.agents || [];
  const tier = plan.tier;
  const required = tier === "quick" ? ["s3", "s5"] : ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
  const problems = [];
  for (const g of required) {
    const a = agents.find((x) => x.role === `scout-${g}`);
    if (!a) { problems.push(`缺 scout-${g}`); continue; }
    const batch = batches.find((b) => b.group === g);
    const note = a.coverage_note || batch?.coverage_note;
    const hintsDeclared = Array.isArray(a.cross_hints) || Array.isArray(batch?.cross_hints);
    if (!note || !hintsDeclared) problems.push(`scout-${g} 缺 ${!note ? "coverage_note" : ""}${!note && !hintsDeclared ? " 与 " : ""}${!hintsDeclared ? "cross_hints" : ""}`);
  }
  check("G10 扫描组完整", problems.length === 0, problems.join("；") || `${required.length} 组齐全`);
}

// G11 对抗子代理合规
{
  const agents = state.adversarial?.agents || [];
  const problems = [];
  if (plan.tier !== "quick") {
    for (const role of ["red", "blue", "judge"]) {
      const a = agents.find((x) => x.role === role);
      if (!a) problems.push(`缺 ${role}`);
      else {
        if (a.failed) problems.push(`${role} 标记 failed`);
        if ((a.retries ?? 0) > 2) problems.push(`${role} 重试 ${a.retries} > 2`);
      }
    }
    const red = agents.find((x) => x.role === "red");
    if (red && !red.coverage_note) problems.push("红队缺 coverage_note");
  } else {
    problems.push("");
  }
  check("G11 对抗子代理合规", problems.filter(Boolean).length === 0, problems.filter(Boolean).join("；") || "红/蓝/裁齐全且无 failed");
}

// G12 指标由 stats 计算且已披露
{
  const report = read(join(dir, "REPORT.md"));
  const problems = [];
  if (plan.tier !== "quick") {
    if (!verdict?.stats) problems.push("08-verdict.json 缺 stats");
    else {
      const defenses = def?.defenses || [];
      const recomputed = {
        accusations: acc?.accusations?.length ?? 0,
        upheld: (verdict.verdicts || []).filter((v) => v.decision === "upheld").length,
        dismissed: (verdict.verdicts || []).filter((v) => v.decision === "dismissed").length,
        unresolved: (verdict.verdicts || []).filter((v) => v.decision === "unresolved").length,
        defended: defenses.length,
        valid_defense: defenses.filter((d) => d.claim === "valid_defense").length
      };
      for (const [k, v] of Object.entries(recomputed)) {
        if (verdict.stats[k] !== v) problems.push(`stats.${k}=${verdict.stats[k]} 与实际 ${v} 不符`);
      }
      if (typeof verdict.stats.defended !== "number") problems.push("stats 缺 defended（有效辩护率分母）");
    }
    if (report) {
      for (const k of ["成立率", "有效辩护率", "升级率", "未决率"]) if (!report.includes(k)) problems.push(`报告未披露 ${k}`);
    } else problems.push("缺 REPORT.md");
  }
  check("G12 对抗指标", problems.length === 0, problems.join("；") || "四指标由 stats 计算并已披露");
}

// G14 交付物（reported 起就交付 2 件成品供人工评审；closed 要求 3 件齐全且与工作副本一致）
{
  const st = state.state;
  if (st !== "reported" && st !== "closed") {
    check("G14 交付物", true, "未到 reported，跳过", false);
  } else {
    const rep = state.report || {};
    const root = state.root ? state.root : ".";
    const rootDir = resolve(root);
    const files = rep.files || [];
    const want = st === "closed" ? ["REPORT.md", "SUMMARY.md", "task.md"] : ["REPORT.md", "SUMMARY.md"];
    const problems = [];
    if (!rep.dir) problems.push("state.report.dir 为空，报告未交付");
    for (const f of want) {
      if (!files.includes(f)) problems.push(`state.report.files 缺 ${f}`);
      const p = join(rootDir, rep.dir || "", f);
      if (!existsSync(p)) problems.push(`缺交付文件：${p}`);
      else if (existsSync(join(dir, f)) && readFileSync(join(dir, f), "utf8") !== readFileSync(p, "utf8")) {
        problems.push(`交付目录的 ${f} 与工作目录不一致，需重新 deliver`);
      }
    }
    // reported 阶段只是提醒（历史流程可能在 reported 后补交付）；closed 必须一致
    check("G14 交付物", problems.length === 0, problems.join("；") || `${want.length} 份成品已交付（${rep.dir}）`, st === "closed");
  }
}

// G18 结论一致性：写"通过/有条件通过"但仍有 P0，即结论与数据矛盾
{
  const report = read(join(dir, "REPORT.md")) || "";
  const m = report.match(/Gate\s*[DI]\s*结论[：:]\s*(通过|有条件通过|不通过)/);
  const p0 = (verdict?.verdicts || []).filter((v) => v.decision === "upheld" && v.level === "P0").length;
  if (!m) check("G18 结论一致性", true, "未找到 Gate 结论，跳过", false);
  else check("G18 结论一致性", m[1] === "不通过" || p0 === 0,
    m[1] === "不通过" ? "结论为不通过" : p0 === 0 ? `结论 ${m[1]}，P0=0` : `结论 ${m[1]} 但 P0=${p0}`);
}

// G19 子模块体检（impl）
{
  if (plan.review_type !== "impl") check("G19 子模块体检", true, "设计侧不适用", false);
  else {
    const pf = readJson(join(dir, "preflight.json"));
    if (!pf) check("G19 子模块体检", true, "无 preflight.json，跳过", false);
    else {
      const failed = (pf.failures || []).length;
      const declared = Boolean(state.declared_impact);
      check("G19 子模块体检", failed === 0 || declared,
        failed ? `${failed} 项体检失败${declared ? "（已声明影响）" : "，且未声明影响"}` : "子模块均检出");
    }
  }
}

// 汇总
const blocking = results.filter((r) => r.blocking);
const passed = blocking.every((r) => r.ok);
const lines = [
  "# gate 校验结果",
  "",
  `- 评审目录：${dir}`,
  `- 时间：${new Date().toISOString()}`,
  `- 结论：${passed ? "通过" : "不通过"}`,
  "",
  "| 检查项 | 结果 | 说明 |",
  "|---|---|---|",
  ...results.map((r) => `| ${r.id} | ${r.ok ? "通过" : r.blocking ? "**不通过**" : "提示"} | ${String(r.detail).replace(/\|/g, "\\|")} |`)
];
writeFileSync(join(dir, "gate-result.md"), lines.join("\n") + "\n");

if (asJson) console.log(JSON.stringify({ passed, results }, null, 2));
else {
  for (const r of results) console.log(`${r.ok ? "PASS" : r.blocking ? "FAIL" : "WARN"}  ${r.id}  ${r.detail}`);
  console.log(passed ? "\ngate 通过" : "\ngate 不通过：报告只能标 DRAFT");
}
process.exit(passed ? 0 : 1);
