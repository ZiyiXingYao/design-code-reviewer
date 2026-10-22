/** 覆盖下限：防止 plan.json 自报过小导致 gate 放水。 */

export const FLOORS = {
  design: {
    quick: { dimension: 4, scenario: 6, completeness: 8 },
    standard: { dimension: 15, scenario: 17, completeness: 20 },
    deep: { dimension: 15, scenario: 17, completeness: 20 }
  },
  impl: {
    quick: { lens: 5 },
    standard: { lens: 20 },
    deep: { lens: 20 }
  }
};

export function checkFloor(plan) {
  const type = plan.review_type || "design";
  const mode = plan.mode || "full";
  const tier = plan.tier || "standard";
  if (mode === "delta") {
    // 增量没有固定下限：要求显式声明受影响面，防"零覆盖"放水
    const problems = [];
    const expected = plan.expected || {};
    const keys = type === "design" ? ["dimension", "scenario", "completeness"] : ["lens"];
    for (const k of keys) {
      if (Number(expected[k] || 0) < 1) problems.push(`delta 必须声明受影响 ${k} 数（plan.expected.${k} ≥ 1）`);
    }
    if (type === "design" && Number(expected.completeness || 0) % 20 !== 0) {
      problems.push(`completeness 必须是 20 的整数倍（当前 ${expected.completeness}）`);
    }
    if (!plan.scope_file) problems.push("delta 必须在 plan.json 声明 scope_file（scope.mjs 产物）");
    return { ok: problems.length === 0, problems, type, tier: `${tier}/delta` };
  }
  const table = FLOORS[type];
  if (!table) return { ok: false, problems: [`未知评审类型：${type}`] };
  const floor = table[tier] || table.standard;
  const expected = plan.expected || {};
  const problems = [];
  for (const [kind, min] of Object.entries(floor)) {
    const got = Number(expected[kind] || 0);
    if (got < min) problems.push(`${kind} 覆盖 ${got} < 下限 ${min}（${type}/${tier}）`);
  }
  if (type === "design" && tier !== "quick" && Number(expected.completeness || 0) % 20 !== 0) {
    problems.push(`completeness 必须是 20 的整数倍（当前 ${expected.completeness}）`);
  }
  return { ok: problems.length === 0, problems, type, tier };
}
