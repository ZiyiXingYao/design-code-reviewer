/**
 * 极简 YAML 子集读写：只覆盖本技能 state.yaml 用到的形态。
 *
 * 支持：块状 map、块状 list（标量或单层 map）、双引号字符串、数字、布尔、null、[] 空数组。
 * 不支持：锚点、折叠、多行字符串、流式 map。遇到不支持形态直接抛错，避免静默错读。
 */

const INDENT = 2;

function parseScalar(raw, lineNo) {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "[]") return [];
  if (s === "{}") return {};
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new Error(`第 ${lineNo} 行：行内数组未闭合`);
    try { return JSON.parse(s); } catch { throw new Error(`第 ${lineNo} 行：行内数组只支持 JSON 形态（双引号字符串）`); }
  }
  if (s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`第 ${lineNo} 行：双引号字符串未闭合或转义非法`);
    }
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new Error(`第 ${lineNo} 行：单引号字符串未闭合`);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith("{") || s.startsWith("[")) {
    throw new Error(`第 ${lineNo} 行：不支持流式集合，请用块状写法`);
  }
  return s;
}

export function parseYaml(text) {
  const lines = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*#/.test(raw)) return;
    if (!raw.trim()) return;
    const indent = raw.match(/^ */)[0].length;
    if (indent % INDENT !== 0) throw new Error(`第 ${i + 1} 行：缩进必须是 ${INDENT} 的倍数`);
    lines.push({ indent, text: raw.trim(), no: i + 1 });
  });

  let pos = 0;

  function parseBlock(indent) {
    if (pos >= lines.length) return null;
    if (lines[pos].text.startsWith("- ")) return parseList(indent);
    return parseMap(indent);
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`第 ${line.no} 行：列表缩进不合法`);
      if (!line.text.startsWith("- ")) break;
      const rest = line.text.slice(2).trim();
      pos++;
      const kv = rest.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
      if (kv) {
        const item = {};
        if (kv[2] !== "") item[kv[1]] = parseScalar(kv[2], line.no);
        else {
          const child = parseBlock(indent + INDENT);
          item[kv[1]] = child === null ? {} : child;
        }
        while (pos < lines.length && lines[pos].indent === indent + INDENT) {
          const l = lines[pos];
          if (l.text.startsWith("- ")) break;
          const m = l.text.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
          if (!m) throw new Error(`第 ${l.no} 行：列表项内只允许 key: value`);
          pos++;
          if (m[2] !== "") item[m[1]] = parseScalar(m[2], l.no);
          else {
            const child = parseBlock(indent + INDENT * 2);
            item[m[1]] = child === null ? {} : child;
          }
        }
        arr.push(item);
      } else {
        arr.push(parseScalar(rest, line.no));
      }
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`第 ${line.no} 行：map 缩进不合法`);
      if (line.text.startsWith("- ")) break;
      const m = line.text.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
      if (!m) throw new Error(`第 ${line.no} 行：不是 key: value 形式`);
      pos++;
      if (m[2] !== "") obj[m[1]] = parseScalar(m[2], line.no);
      else {
        const next = lines[pos];
        if (!next || next.indent <= indent) obj[m[1]] = null;
        else obj[m[1]] = parseBlock(next.indent);
      }
    }
    return obj;
  }

  if (!lines.length) return {};
  const out = parseBlock(lines[0].indent);
  if (pos < lines.length) throw new Error(`第 ${lines[pos].no} 行：无法解析的多余内容`);
  return out;
}

function scalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    throw new Error("数组必须由调用方按块状输出");
  }
  return JSON.stringify(String(v));
}

function emit(obj, indent, out) {
  const pad = " ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) { out.push(`${pad}${k}: []`); continue; }
      out.push(`${pad}${k}:`);
      for (const item of v) {
        if (item !== null && typeof item === "object") {
          const entries = Object.entries(item).filter(([, x]) => x !== undefined);
          if (!entries.length) { out.push(`${pad}  - {}`); continue; }
          entries.forEach(([ik, iv], idx) => {
            const prefix = idx === 0 ? `${pad}  - ` : `${pad}    `;
            if (iv !== null && typeof iv === "object" && !Array.isArray(iv)) {
              out.push(`${prefix}${ik}:`);
              emit(iv, indent + 6, out);
            } else if (Array.isArray(iv)) {
              if (iv.length === 0) out.push(`${prefix}${ik}: []`);
              else {
                out.push(`${prefix}${ik}:`);
                for (const x of iv) {
                  if (x !== null && typeof x === "object") {
                    const es = Object.entries(x).filter(([, v]) => v !== undefined);
                    es.forEach(([k2, v2], i2) => {
                      const pfx = i2 === 0 ? `${pad}      - ` : `${pad}        `;
                      if (v2 !== null && typeof v2 === "object" && !Array.isArray(v2)) {
                        out.push(`${pfx}${k2}:`);
                        emit(v2, indent + 10, out);
                      } else if (Array.isArray(v2)) {
                        out.push(`${pfx}${k2}: []`);
                      } else out.push(`${pfx}${k2}: ${scalar(v2)}`);
                    });
                  } else out.push(`${pad}      - ${scalar(x)}`);
                }
              }
            } else out.push(`${prefix}${ik}: ${scalar(iv)}`);
          });
        } else {
          out.push(`${pad}  - ${scalar(item)}`);
        }
      }
      continue;
    }
    if (v !== null && typeof v === "object") {
      if (!Object.keys(v).length) { out.push(`${pad}${k}: {}`); continue; }
      out.push(`${pad}${k}:`);
      emit(v, indent + INDENT, out);
      continue;
    }
    out.push(`${pad}${k}: ${scalar(v)}`);
  }
}

export function stringifyYaml(obj) {
  const out = ["# 本文件只允许由对应脚本编辑（state.mjs / ledger.mjs），手工修改视为无效"];
  emit(obj, 0, out);
  return out.join("\n") + "\n";
}
