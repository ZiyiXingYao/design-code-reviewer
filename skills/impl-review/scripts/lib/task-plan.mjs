/**
 * 由评审发现生成修复任务清单（task.md）。
 *
 * 规则参照 brainstorming-archify 的 task.md：
 *   - 一条任务一个复选框 + 概要 + 依赖 + 四段式 AI 提示词
 *   - 执行顺序编号 T-01…；依赖必须指向前序任务
 *   - 同文件任务必须显式排序；依赖成环则拒绝生成
 *   - 已有 task.md 且有未勾选项：只追加，不覆盖；全部勾选：整份重写
 */

const LEVEL_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const FILE_RE = /([\w./-]+\.(?:md|h|hpp|c|cc|cpp|mjs|js|ts|json|ya?ml|sql|proto))/;

export function finalLevels(findings, verdicts, accusations) {
  const byAcc = new Map(verdicts.map((v) => [v.accusation_id, v]));
  const map = new Map();
  for (const a of accusations) {
    const v = byAcc.get(a.id);
    if (!v) continue;
    for (const fid of a.source_findings || []) map.set(fid, { level: v.level, decision: v.decision, accusation: a.id });
  }
  return findings.map((f) => ({
    ...f,
    finalLevel: map.get(f.id)?.level || f.level,
    decision: map.get(f.id)?.decision || null
  }));
}

function primaryFile(location) {
  const m = String(location || "").match(FILE_RE);
  return m ? m[1] : String(location || "").split(/[;；]/)[0].trim();
}

function moduleOf(f) {
  const file = primaryFile(f.location);
  const base = file.split("/").pop().replace(/\.(md|h|hpp|c|cc|cpp|mjs|js|ts|json|ya?ml|sql|proto)$/, "");
  return base.replace(/^\d+-/, "").replace(/-模块$/, "") || "全局";
}

function isDesign(reviewType) { return reviewType !== "impl"; }

function promptFor(f, reviewType) {
  const design = isDesign(reviewType);
  const target = design ? "设计文档" : "代码";
  const verify = design
    ? `反例不再成立：${f.counterexample || "（原反例缺失）"}；对应维度/场景复查通过；重跑 gate`
    : `触发条件不再复现：${f.trigger || f.counterexample || "（原触发条件缺失）"}；相关测试与复跑通过`;
  return [
    `    - [实现的功能] 修复 ${f.id}：${f.title}`,
    `    - [任务实现的要求] 修改 ${target} ${f.location}：${f.suggestion || f.mechanism}；消除机制「${f.mechanism}」`,
    `    - [实现的约束] 只改「涉及」列出的位置；不得改动其他任务的文件；不得改变设计/契约已定的其他行为`,
    `    - [验收标准] ${verify}`
  ].join("\n");
}

function taskBlock(t, reviewType) {
  const deps = t.dependsOn.length ? t.dependsOn.join("、") : "无";
  return [
    `- [ ] **${t.id} [${t.level}] ${t.finding.title}**（${t.finding.id}）`,
    `  - 问题：${t.finding.mechanism}`,
    `  - 怎么改：${t.finding.suggestion || "按发现描述修复"}`,
    `  - 涉及：${t.finding.location}`,
    `  - 依赖：${deps}`,
    "  - AI 提示词：",
    promptFor(t.finding, reviewType)
  ].join("\n");
}

function parseExisting(text) {
  const tasks = [];
  const map = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^- \[( |x)\] \*\*(T-\d+) .*?\*\*（(F-\d+)）/);
    if (m) {
      tasks.push({ checked: m[1] === "x", id: m[2], findingId: m[3] });
      map.set(m[3], m[2]);
    }
  }
  return { tasks, map, maxId: tasks.reduce((n, t) => Math.max(n, Number(t.id.slice(2))), 0) };
}

function topo(tasks, errors) {
  const byFid = new Map(tasks.map((t) => [t.finding.id, t]));
  const state = new Map();
  const order = [];
  const visit = (t, stack) => {
    if (state.get(t.finding.id) === 2) return;
    if (state.get(t.finding.id) === 1) {
      errors.push(`依赖成环：${[...stack, t.finding.id].join(" → ")}`);
      return;
    }
    state.set(t.finding.id, 1);
    for (const dep of t.dependsOnFindings) {
      const d = byFid.get(dep);
      if (d) visit(d, [...stack, t.finding.id]);
    }
    state.set(t.finding.id, 2);
    order.push(t);
  };
  for (const t of tasks) visit(t, []);
  return order;
}

/**
 * @returns {{ok:boolean, errors:string[], markdown?:string, tasks?:object[]}}
 */
export function generateTaskMd({
  reviewId, reviewType, reviewer, at, conclusion,
  findings, verdicts, accusations, includeP2 = false, existing = ""
}) {
  const errors = [];
  const scored = finalLevels(findings, verdicts, accusations)
    .filter((f) => ["P0", "P1", "P2"].includes(f.finalLevel))
    .filter((f) => includeP2 || f.finalLevel !== "P2");

  const prior = existing ? parseExisting(existing) : { tasks: [], map: new Map(), maxId: 0 };
  const hasUnchecked = prior.tasks.some((t) => !t.checked);
  const append = Boolean(existing) && hasUnchecked;

  const fresh = append ? scored.filter((f) => !prior.map.has(f.id)) : scored;

  const tasks = fresh.map((f) => ({
    finding: f,
    level: f.finalLevel,
    module: moduleOf(f),
    file: primaryFile(f.location),
    shared: (f.sources || []).length >= 2,
    dependsOnFindings: Array.isArray(f.depends_on) ? f.depends_on : [],
    dependsOn: []
  }));

  // 全局顺序：共用（多来源系统性问题）优先 → 级别 → id
  tasks.sort((a, b) => (Number(b.shared) - Number(a.shared)) || (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) || a.finding.id.localeCompare(b.finding.id));

  // 同文件强制顺序：共用优先 → 级别 → id
  const groups = new Map();
  for (const t of tasks) {
    if (!groups.has(t.file)) groups.set(t.file, []);
    groups.get(t.file).push(t);
  }
  for (const [file, list] of groups) {
    list.sort((a, b) => (Number(b.shared) - Number(a.shared)) || (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) || a.finding.id.localeCompare(b.finding.id));
    for (let i = 1; i < list.length; i++) {
      list[i].dependsOnFindings.push(list[i - 1].finding.id);
      list[i].fileOrderFrom = file;
    }
  }

  const ordered = topo(tasks, errors);
  if (errors.length) return { ok: false, errors };

  // 编号：追加时续号，且依赖可能指向已有任务
  let seq = append ? prior.maxId : 0;
  for (const t of ordered) {
    t.id = `T-${String(++seq).padStart(2, "0")}`;
    t.dependsOn = t.dependsOnFindings
      .map((fid) => ordered.find((x) => x.finding.id === fid)?.id || prior.map.get(fid))
      .filter(Boolean);
  }

  const body = ordered.map((t) => taskBlock(t, reviewType)).join("\n\n");
  const depLines = [];
  depLines.push("- 环检测：无");
  const sameFile = [...groups.entries()].filter(([, l]) => l.length > 1);
  if (sameFile.length) {
    for (const [file, list] of sameFile) {
      const ids = list.map((t) => t.id).join(" → ");
      depLines.push(`- 同文件顺序：${ids}（${file}）`);
    }
  } else depLines.push("- 同文件顺序：无（各任务文件不重叠）");
  const noDep = ordered.filter((t) => !t.dependsOn.length).map((t) => t.id);
  depLines.push(`- 无依赖任务：${noDep.length ? noDep.join("、") : "无"}`);
  if (append) depLines.push(`- 追加模式：沿用既有任务 ${prior.tasks.length} 条，本次新增 ${ordered.length} 条`);

  let markdown;
  if (append) {
    const idx = existing.indexOf("## 依赖校验");
    const head = idx >= 0 ? existing.slice(0, idx).trimEnd() : existing.trimEnd();
    markdown = `${head}\n\n${body}\n\n## 依赖校验\n\n${depLines.join("\n")}\n`;
  } else {
    markdown = `# 修复任务（评审 ${reviewId}）

- 评审结论：${conclusion}
- 评审类型：${reviewType}
- 批准人：${reviewer}（${at}）
- 说明：复选框勾上表示已完成；本文件是实现方交接物，不要删除未完成任务

## 任务

${body || "- （无 P0/P1 待修任务）"}

## 依赖校验

${depLines.join("\n")}
`;
  }
  return { ok: true, errors: [], markdown, tasks: ordered };
}
