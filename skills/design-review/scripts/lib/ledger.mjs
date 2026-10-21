/**
 * 跨次评审账本：.design-code-reviewer/ledger.yaml
 *
 * 只做三件事：并入本次发现（sync）、列出（list）、人工关闭（close）。
 * sync 不会把"本次未出现"自动标成 fixed——评审范围可能变小，自动关闭会造假。
 */

import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml, stringifyYaml } from "./yaml.mjs";
import { loadState, loadPlan, updateState } from "./review-state.mjs";
import { finalLevels } from "./task-plan.mjs";

export const LEDGER_REL = ".design-code-reviewer/ledger.yaml";
const STATUS = ["open", "fixed", "accepted", "false-positive"];

export function ledgerPath(root) { return join(resolve(root), LEDGER_REL); }

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/:\d+(?:-\d+)?/g, "")
    .replace(/[\s，。、；：（）()「」“”"'!?！？]/g, "");
}

export function fingerprint(type, title, location) {
  return createHash("md5").update(`${type}|${normalize(title)}|${normalize(location)}`).digest("hex").slice(0, 16);
}

export function loadLedger(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return { schema_version: 1, updated_at: "", entries: [] };
  const j = parseYaml(readFileSync(p, "utf8"));
  return { schema_version: j.schema_version || 1, updated_at: j.updated_at || "", entries: j.entries || [] };
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, "w");
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

export function saveLedger(root, ledger) {
  ledger.updated_at = new Date().toISOString();
  const dir = join(resolve(root), ".design-code-reviewer");
  if (!existsSync(dir)) throw new Error(`账本目录不存在：${dir}`);
  atomicWrite(ledgerPath(root), stringifyYaml(ledger));
}

export function syncLedger(root, reviewDir) {
  const dir = resolve(reviewDir);
  const st = loadState(dir);
  const plan = loadPlan(dir);
  const readJson = (n) => JSON.parse(readFileSync(join(dir, n), "utf8"));
  const findings = readJson("05-findings.json").findings || [];
  const verdicts = readJson("08-verdict.json").verdicts || [];
  const accusations = readJson("06-accusations.json").accusations || [];
  const scored = finalLevels(findings, verdicts, accusations);

  const ledger = loadLedger(root);
  const byFp = new Map(ledger.entries.map((e) => [e.fingerprint, e]));
  const at = new Date().toISOString();
  const reviewId = st.review_id || dir.split("/").pop();
  let created = 0;
  let updated = 0;

  for (const f of scored) {
    const fp = fingerprint(st.review_type || plan.review_type, f.title, f.location);
    const prev = byFp.get(fp);
    if (prev) {
      prev.title = f.title;
      prev.location = f.location;
      prev.level = f.finalLevel;
      prev.last_seen = { review_id: reviewId, at };
      prev.review_ids = [...new Set([...(prev.review_ids || []), reviewId])];
      updated++;
      continue;
    }
    const id = `L-${String(ledger.entries.length + 1).padStart(4, "0")}`;
    const entry = {
      id, fingerprint: fp, review_type: st.review_type || plan.review_type,
      title: f.title, location: f.location, level: f.finalLevel, status: "open",
      first_seen: { review_id: reviewId, at },
      last_seen: { review_id: reviewId, at },
      review_ids: [reviewId],
      history: [{ at, action: "open", reason: "首次发现" }]
    };
    ledger.entries.push(entry);
    byFp.set(fp, entry);
    created++;
  }
  saveLedger(root, ledger);
  return { ok: true, path: ledgerPath(root), total: ledger.entries.length, created, updated, review_id: reviewId };
}

export function closeEntry(root, idOrFp, status, reason) {
  if (!STATUS.includes(status)) throw new Error(`非法状态：${status}（允许 ${STATUS.join("/")}）`);
  const ledger = loadLedger(root);
  const e = ledger.entries.find((x) => x.id === idOrFp || x.fingerprint === idOrFp);
  if (!e) throw new Error(`账本条目不存在：${idOrFp}`);
  e.status = status;
  e.history = [...(e.history || []), { at: new Date().toISOString(), action: status, reason: reason || "" }];
  saveLedger(root, ledger);
  return e;
}

export function listEntries(root, status) {
  const ledger = loadLedger(root);
  const entries = status ? ledger.entries.filter((e) => e.status === status) : ledger.entries;
  return { path: ledgerPath(root), updated_at: ledger.updated_at, entries };
}

/** approve 用：sync 并写 state.ledger */
export function syncForReview(root, reviewDir) {
  const res = syncLedger(root, reviewDir);
  updateState(resolve(reviewDir), (s) => {
    s.ledger = { synced: true, path: LEDGER_REL, at: new Date().toISOString(), new: res.created, still: res.updated };
  });
  return res;
}
