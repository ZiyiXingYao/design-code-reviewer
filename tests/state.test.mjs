import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scaffold, tmpReviewDir, putBatch, heartbeat } from "./helpers.mjs";
import { reconcile, loadState } from "../skills/design-review/scripts/lib/review-state.mjs";

const payload = (id, extra = {}) => ({
  batch: id, group: "s1", unit: "维度D1", kind: "discrete", status: "done",
  covers: [{ kind: "dimension", id: "D1" }], findings: [], coverage_note: "检查完毕", ...extra
});

test("批次落盘后 state 与产物一致，且不留 tmp", () => {
  const dir = tmpReviewDir();
  scaffold(dir);
  putBatch(dir, payload("b01"));
  assert.ok(existsSync(join(dir, "batches", "b01.json")));
  assert.ok(!existsSync(join(dir, "batches", "b01.json.tmp")));
  const st = loadState(dir);
  assert.equal(st.recovery.done, 1);
  assert.equal(st.coverage.dimension.done, 1);
});

test("日志有产物无：该批必须重跑，不得计入完成", () => {
  const dir = tmpReviewDir();
  scaffold(dir, {
    expected: { dimension: 2 },
    batches: [
      { id: "b01", group: "s1", unit: "D1", kind: "discrete" },
      { id: "b02", group: "s1", unit: "D2", kind: "discrete" }
    ]
  });
  putBatch(dir, payload("b01"));
  heartbeat(dir, "b02");
  const s = reconcile(dir);
  assert.deepEqual(s.pending, ["b02"]);
  assert.ok(s.discarded.includes("b02"));
});

test("产物在日志缺：以产物为准，并记 progress_missing", () => {
  const dir = tmpReviewDir();
  scaffold(dir);
  putBatch(dir, payload("b01"));
  writeFileSync(join(dir, "progress.log"), "");
  const s = reconcile(dir);
  assert.deepEqual(s.done, ["b01"]);
  assert.deepEqual(s.state.recovery.progress_missing, ["b01"]);
});

test("残留 tmp 在恢复时被清理", () => {
  const dir = tmpReviewDir();
  scaffold(dir);
  writeFileSync(join(dir, "batches", "b09.json.tmp"), "{}");
  reconcile(dir);
  assert.ok(!existsSync(join(dir, "batches", "b09.json.tmp")));
});

test("计划外批次拒绝落盘", () => {
  const dir = tmpReviewDir();
  scaffold(dir);
  assert.throws(() => putBatch(dir, payload("b99")), /不在 plan\.json/);
});
