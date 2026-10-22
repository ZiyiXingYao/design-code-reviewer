/**
 * 评审目录的状态与批产物读写。
 *
 * 权威顺序：batches/*.json（内容） > progress.log（快速定位） > state.yaml（汇总缓存）。
 * 所有写入走原子路径：tmp -> fsync -> rename。
 */

import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  readdirSync, renameSync, rmSync, writeSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { parseYaml, stringifyYaml } from "./yaml.mjs";

export const SCHEMA_VERSION = 1;
export const COVER_KINDS = ["dimension", "completeness", "scenario", "lens", "promise", "requirement", "constraint"];
export const BATCH_STATUS = ["done", "skipped", "partial", "failed"];

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function atomicWrite(file, text) {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

export function atomicWriteJson(file, obj) {
  atomicWrite(file, JSON.stringify(obj, null, 2) + "\n");
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "batches"), { recursive: true });
}

export function planPath(dir) { return join(dir, "plan.json"); }
export function statePath(dir) { return join(dir, "state.yaml"); }
export function progressPath(dir) { return join(dir, "progress.log"); }

export function loadPlan(dir) {
  const p = planPath(dir);
  if (!existsSync(p)) throw new Error(`缺少 plan.json：${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

export function loadState(dir) {
  const p = statePath(dir);
  if (!existsSync(p)) throw new Error(`缺少 state.yaml：${p}`);
  return parseYaml(readFileSync(p, "utf8"));
}

export function saveState(dir, state) {
  atomicWrite(statePath(dir), stringifyYaml(state));
}

export function appendProgress(dir, entry) {
  const line = JSON.stringify(entry) + "\n";
  const fd = openSync(progressPath(dir), "a");
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function readProgress(dir) {
  const p = progressPath(dir);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

export function listBatchFiles(dir) {
  const d = join(dir, "batches");
  if (!existsSync(d)) return [];
  return readdirSync(d).sort();
}

export function loadBatches(dir) {
  const out = [];
  for (const name of listBatchFiles(dir)) {
    if (!name.endsWith(".json")) continue;
    const payload = JSON.parse(readFileSync(join(dir, "batches", name), "utf8"));
    out.push({ file: name, payload });
  }
  return out;
}

export function planBatchById(plan, id) {
  return (plan.batches || []).find((b) => b.id === id) || null;
}

/** 允许子代理用简写 covers（"D10" / "F3" / "FP1#7" / "12"），统一归一化 */
export function normalizeCovers(payload) {
  if (!payload || !Array.isArray(payload.covers)) return payload;
  payload.covers = payload.covers.map((c) => {
    if (typeof c !== "string") return c;
    const m = c.trim().match(/^(FP\d+#\d+|D\d+|F\d+|C\d+|V\d+|O\d+|S\d+)/);
    const id = m ? m[1] : c.trim();
    if (/^D\d+$/.test(id)) return { kind: "dimension", id };
    if (/^FP\d+#\d+$/.test(id)) return { kind: "completeness", id };
    if (/^(F|C|V|O|S)\d+$/.test(id)) return { kind: "scenario", id };
    if (/^\d+$/.test(id)) return { kind: "lens", id };
    return { kind: "dimension", id };
  });
  return payload;
}

export function validateBatchPayload(payload, planned) {
  const errs = [];
  if (!payload || typeof payload !== "object") return ["批产物不是对象"];
  if (!payload.batch) errs.push("缺少 batch");
  if (planned && payload.batch !== planned.id) errs.push(`batch 字段 ${payload.batch} 与计划 ${planned.id} 不一致`);
  if (planned && payload.group && payload.group !== planned.group) errs.push(`group 与计划不一致：${payload.group} != ${planned.group}`);
  if (!planned && !payload.group) errs.push("缺少 group");
  if (!payload.unit) errs.push("缺少 unit");
  if (!BATCH_STATUS.includes(payload.status)) errs.push(`status 非法：${payload.status}`);
  if (payload.status === "skipped" && !payload.reason) errs.push("skipped 必须带 reason");
  if (!Array.isArray(payload.covers)) errs.push("covers 必须是数组");
  else {
    for (const c of payload.covers) {
      if (!c || !COVER_KINDS.includes(c.kind) || !c.id) errs.push(`covers 项非法：${JSON.stringify(c)}`);
    }
  }
  if (!Array.isArray(payload.findings)) errs.push("findings 必须是数组");
  if (payload.status === "done" && !payload.coverage_note && !payload.group?.startsWith("s")) {
    errs.push("done 批必须带 coverage_note 或属于扫描组");
  }
  return errs;
}

/** 写一批：校验 -> tmp -> fsync -> rename -> 日志 -> 汇总 */
export function commitBatch(dir, { payload, agent = "", ms = 0 }) {
  const current = loadState(dir);
  if (current.state === "closed") throw new Error("评审已 closed，拒绝写入；要修结论请开新一轮");
  const plan = loadPlan(dir);
  const planned = planBatchById(plan, payload.batch);
  if (!planned) throw new Error(`批 ${payload.batch} 不在 plan.json 中；开跑后不允许新增批次`);
  normalizeCovers(payload);
  const errs = validateBatchPayload(payload, planned);
  if (errs.length) throw new Error(`批产物不合格：${errs.join("；")}`);

  const target = join(dir, "batches", `${payload.batch}.json`);
  atomicWriteJson(target, payload);
  const partialFile = join(dir, "batches", `${payload.batch}.partial.json`);
  if (existsSync(partialFile)) rmSync(partialFile, { force: true });

  appendProgress(dir, {
    batch: payload.batch, group: payload.group, status: payload.status,
    findings: payload.findings.length, sha256: sha256File(target),
    agent, ms, ts: new Date().toISOString()
  });

  const summary = reconcile(dir);
  saveState(dir, summary.state);
  return summary;
}

/** 对账：产物 > 日志 > state */
export function reconcile(dir) {
  const plan = loadPlan(dir);
  const planned = plan.batches || [];
  const files = listBatchFiles(dir);
  const tmps = files.filter((n) => n.endsWith(".tmp"));
  for (const t of tmps) rmSync(join(dir, "batches", t), { force: true });

  const present = new Map();
  const partial = [];
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    if (name.includes(".partial.")) continue;
    try {
      const payload = JSON.parse(readFileSync(join(dir, "batches", name), "utf8"));
      present.set(payload.batch, payload);
    } catch {
      // 解析失败视同无产物
    }
  }
  const partialDetails = [];
  for (const name of files) {
    if (!name.endsWith(".partial.json")) continue;
    partial.push(name);
    try {
      const j = JSON.parse(readFileSync(join(dir, "batches", name), "utf8"));
      const filled = j.filled_cells || [];
      partialDetails.push({
        batch: j.batch || name.replace(".partial.json", ""),
        filled: filled.length,
        next_cell: `#${filled.length + 1}`,
        partial_findings: (j.partial_findings || []).length
      });
    } catch { /* 损坏的 partial 只列出文件名 */ }
  }

  const entries = readProgress(dir);
  // 任何日志痕迹（含心跳 running）都算"该批启动过"；产物缺失即判丢弃重跑
  const logged = new Set(entries.map((e) => e.batch).filter(Boolean));
  const loggedDone = new Set(entries.filter((e) => e.status === "done").map((e) => e.batch));

  // 心跳超时（3 个周期 = 180s）与单批超时（10 分钟）
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 3 * 60 * 1000;
  const BATCH_TIMEOUT = 10 * 60 * 1000;
  const lastBeat = new Map();
  const firstSeen = new Map();
  for (const e of entries) {
    if (!e.batch || !e.ts) continue;
    const t = Date.parse(e.ts);
    if (Number.isNaN(t)) continue;
    if (!firstSeen.has(e.batch)) firstSeen.set(e.batch, t);
    lastBeat.set(e.batch, Math.max(lastBeat.get(e.batch) || 0, t));
  }
  const stalled = new Set();
  for (const [id, t] of lastBeat) {
    if (present.has(id)) continue;
    const age = now - t;
    const total = now - (firstSeen.get(id) || t);
    if (age > HEARTBEAT_TIMEOUT || total > BATCH_TIMEOUT) stalled.add(id);
  }

  // 产物被改动（progress.log 的 sha256 与实际文件不符）
  const tampered = new Set();
  const shaByBatch = new Map(entries.filter((e) => e.sha256).map((e) => [e.batch, e.sha256]));
  for (const [id] of present) {
    const expected = shaByBatch.get(id);
    if (!expected) continue;
    const file = join(dir, "batches", `${id}.json`);
    if (existsSync(file) && sha256File(file) !== expected) tampered.add(id);
  }

  const done = [];
  const pending = [];
  const discarded = [];
  const skipped = [];
  for (const b of planned) {
    const p = present.get(b.id);
    if (tampered.has(b.id)) {
      discarded.push(b.id);
      present.delete(b.id);
    } else if (p && (p.status === "done" || p.status === "skipped")) {
      done.push(b.id);
      if (p.status === "skipped") skipped.push(b.id);
    } else if (p && p.status === "failed") {
      discarded.push(b.id);
      present.delete(b.id);
    } else {
      pending.push(b.id);
    }
  }
  for (const id of present.keys()) {
    if (!planned.some((b) => b.id === id)) discarded.push(id);
  }
  for (const id of logged) {
    if (!present.has(id) && planned.some((b) => b.id === id)) {
      if (!discarded.includes(id)) discarded.push(id);
    }
  }
  for (const id of stalled) {
    if (planned.some((b) => b.id === id) && !discarded.includes(id)) discarded.push(id);
  }

  const coverage = computeCoverage(plan, [...present.values()]);
  const state = buildState(dir, plan, {
    done, pending, discarded, skipped, coverage, partial, partialDetails,
    stalled: [...stalled], tampered: [...tampered],
    progressMissing: done.filter((id) => !loggedDone.has(id))
  });
  return state;
}

export function computeCoverage(plan, payloads) {
  const totals = plan.expected || {};
  const seen = {};
  for (const kind of COVER_KINDS) seen[kind] = new Set();
  for (const p of payloads) {
    if (p.status !== "done" && p.status !== "partial") continue;
    for (const c of p.covers || []) {
      if (!seen[c.kind]) seen[c.kind] = new Set();
      seen[c.kind].add(c.id);
    }
  }
  const out = {};
  for (const [kind, total] of Object.entries(totals)) {
    const got = seen[kind] ? seen[kind].size : 0;
    out[kind] = { done: got, total };
  }
  return out;
}

function buildState(dir, plan, extra) {
  const now = new Date().toISOString();
  const prev = existsSync(statePath(dir)) ? parseYaml(readFileSync(statePath(dir), "utf8")) : {};
  const batches = (plan.batches || []).map((b) => {
    const payload = existsSync(join(dir, "batches", `${b.id}.json`))
      ? JSON.parse(readFileSync(join(dir, "batches", `${b.id}.json`), "utf8"))
      : null;
    return {
      id: b.id, group: b.group, unit: b.unit, kind: b.kind,
      status: payload ? payload.status : (extra.discarded.includes(b.id) ? "failed" : "pending"),
      findings: payload?.findings?.length ?? 0
    };
  });
  const state = {
    schema_version: SCHEMA_VERSION,
    review_type: plan.review_type,
    mode: plan.mode,
    ...(plan.range ? { range: plan.range } : {}),
    review_id: prev.review_id || basename(dir),
    root: prev.root || "",
    tier: plan.tier,
    dir,
    baseline: prev.baseline || {},
    plan: {
      file: "plan.json",
      sha256: sha256File(planPath(dir)),
      total_batches: (plan.batches || []).length,
      max_concurrency: plan.max_concurrency || 4
    },
    state: prev.state || "scoped",
    steps: prev.steps || {},
    coverage: extra.coverage,
    report: prev.report || { dir: "", files: [] },
    adversarial: prev.adversarial || { rounds: 0, agents: [] },
    interruptions: prev.interruptions || [],
    recovery: {
      last_run: now,
      done: extra.done.length,
      pending: extra.pending.length,
      discarded: extra.discarded.length,
      skipped: extra.skipped.length,
      partial: extra.partial,
      partial_batches: extra.partialDetails || [],
      stalled: extra.stalled || [],
      tampered: extra.tampered || [],
      progress_missing: extra.progressMissing
    },
    batches,
    log: prev.log || []
  };
  return { state, done: extra.done, pending: extra.pending, discarded: extra.discarded, skipped: extra.skipped, coverage: extra.coverage, partial: extra.partialDetails || [] };
}

export function initReview(dir, opts) {
  ensureDir(dir);
  const mode = opts.mode || (opts.type === "impl" ? "delta" : "full");
  if (!["full", "delta"].includes(mode)) throw new Error(`未知评审模式：${mode}`);
  const range = mode === "delta" ? { from: opts.from || "", to: opts.to || "HEAD" } : null;
  if (mode === "delta" && !range.from) throw new Error("增量模式必须给 --from <rev>（变更起点）");
  const plan = {
    review_type: opts.type,
    mode,
    ...(range ? { range } : {}),
    tier: opts.tier || "standard",
    max_concurrency: opts.maxConcurrency || 4,
    created_at: new Date().toISOString(),
    expected: opts.expected || {},
    steps: opts.steps || [],
    batches: opts.batches || [],
    ...(opts.planExtra || {}),
    ...(opts.scopeFile ? { scope_file: opts.scopeFile } : {})
  };
  if (!plan.batches.length) throw new Error("plan 必须至少包含一个批次");
  for (const b of plan.batches) {
    if (!b.id || !b.group || !b.unit || !b.kind) throw new Error(`批次字段不全：${JSON.stringify(b)}`);
  }
  if (!existsSync(planPath(dir))) atomicWriteJson(planPath(dir), plan);
  else {
    const existing = loadPlan(dir);
    const sameIds = JSON.stringify((existing.batches || []).map((b) => b.id)) === JSON.stringify(plan.batches.map((b) => b.id));
    const sameExpected = JSON.stringify(existing.expected || {}) === JSON.stringify(plan.expected);
    if (!sameIds || !sameExpected) throw new Error("plan.json 已存在且批次/覆盖基数不同；开跑后不允许改批次计划");
  }
  if (!existsSync(progressPath(dir))) atomicWrite(progressPath(dir), "");
  const state = {
    schema_version: SCHEMA_VERSION,
    review_type: opts.type,
    mode,
    ...(range ? { range } : {}),
    review_id: opts.reviewId || basename(dir),
    root: opts.root || "",
    tier: plan.tier,
    dir,
    baseline: {
      commit: opts.commit || "",
      design_state: opts.designState || "",
      reopen_count: opts.reopen ?? 0,
      bench: opts.bench || ""
    },
    plan: { file: "plan.json", sha256: sha256File(planPath(dir)), total_batches: plan.batches.length, max_concurrency: plan.max_concurrency },
    state: "scoped",
    steps: {},
    coverage: Object.fromEntries(Object.entries(plan.expected).map(([k, v]) => [k, { done: 0, total: v }])),
    adversarial: { rounds: 0, agents: [], stats: { accusations: 0, upheld: 0, dismissed: 0, unresolved: 0, valid_defense: 0, escalated: 0 } },
    interruptions: [],
    recovery: { last_run: new Date().toISOString(), done: 0, pending: plan.batches.length, discarded: 0, skipped: 0, partial: [], progress_missing: [] },
    report: { dir: "", files: [] },
    batches: plan.batches.map((b) => ({ id: b.id, group: b.group, unit: b.unit, kind: b.kind, status: "pending", findings: 0 })),
    log: [{ at: new Date().toISOString(), from: "", to: "scoped", reason: "init" }]
  };
  saveState(dir, state);
  return state;
}

export function updateState(dir, mutator) {
  const state = loadState(dir);
  mutator(state);
  saveState(dir, state);
  return state;
}

export function addLog(state, to, reason) {
  const from = state.state;
  state.state = to;
  state.log = [...(state.log || []), { at: new Date().toISOString(), from, to, reason }];
}
