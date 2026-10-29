/**
 * patch-parse.mjs — 读 cordis.patch.yml，并按 **DSH 自己的规则**把补丁应用到入口列表上。
 *
 * 为什么要自己实现：宿主里这段逻辑在 `@deepseek-ai/dsh-app-boot` 的 `applyEntryPatches`
 * （本机 app.asar 里 `lib/index.js:61`）。它没有把「补丁怎么解释」暴露成公共 API，
 * 而插件作者最需要的恰恰是这一点。所以这里按源码逐行搬了一份，语义与宿主一致，
 * 连出错信息都一样——**解析器是本地实现的 YAML 子集（无第三方依赖）**。
 *
 * 宿主数据模型（`EntryOptions`，见 `cordis-plugin-loader/src/config/entry.ts`）：
 *   一条入口 = { id, name, config?, group?, disabled?, inject? }
 * 一条补丁 = { id?, insert?, name?, ...要覆盖的字段 }
 *   · 有 insert 且有 id  → 目标必须是 group，插进它的 config 数组
 *   · 有 insert 且无 id  → 追加到根入口列表（本插件用这条）
 *   · 无 insert          → 必须有 id；目标必须存在；给了 name 还必须与目标一致；然后覆盖其余字段
 */

/** YAML 子集解析：块序列 / 块映射 / 内联 [..] 与 {..} / 引号 / 布尔数字 null。 */
export function parsePatchYaml(text) {
  const lines = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const cleaned = stripComment(raw);
    if (!cleaned.trim()) continue;
    lines.push({ indent: cleaned.match(/^ */)[0].length, text: cleaned.trim() });
  }
  if (!lines.length) return [];
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return Array.isArray(value) ? value : [value];
}

/** 去掉行尾注释，但引号里的 `#` 不算注释。 */
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function isSeq(line) { return line.text.startsWith('- ') || line.text === '-'; }

/** 在给定缩进上解析一个块（序列或映射），返回 [value, nextIndex]。 */
function parseBlock(lines, i, indent) {
  if (i >= lines.length) return [null, i];
  return isSeq(lines[i]) ? parseSeq(lines, i, indent) : parseMap(lines, i, indent);
}

function parseSeq(lines, i, indent) {
  const out = [];
  while (i < lines.length && lines[i].indent === indent && isSeq(lines[i])) {
    const rest = lines[i].text.replace(/^-\s*/, '');
    if (!rest) {
      const child = lines[i + 1];
      if (child && child.indent > indent) {
        const [v, ni] = parseBlock(lines, i + 1, child.indent);
        out.push(v); i = ni;
      } else { out.push(null); i++; }
      continue;
    }
    // `- key: value` → 先当映射的起始行，后续同缩进的键并入同一个对象
    const m = rest.match(/^([^\s:]+)\s*:\s*([\s\S]*)$/);
    if (m) {
      const obj = {};
      const [v0, ni0] = parseValueOrBlock(lines, i, indent, m[2], i + 1);
      obj[m[1]] = v0;
      i = ni0;
      const [more, ni1] = parseMapTail(lines, i, indent + 2);
      Object.assign(obj, more);
      i = ni1;
      out.push(obj);
    } else {
      out.push(parseScalar(rest)); i++;
    }
  }
  return [out, i];
}

function parseMap(lines, i, indent) {
  const [obj, next] = parseMapTail(lines, i, indent);
  return [obj, next];
}

/** 连续的 `key: value` / `key:` + 子块，直到缩进低于 indent。 */
function parseMapTail(lines, i, indent) {
  const obj = {};
  while (i < lines.length && lines[i].indent === indent && !isSeq(lines[i])) {
    const m = lines[i].text.match(/^([^\s:]+)\s*:\s*([\s\S]*)$/);
    if (!m) { i++; continue; }
    const [v, ni] = parseValueOrBlock(lines, i, indent, m[2], i + 1);
    obj[m[1]] = v;
    i = ni;
  }
  return [obj, i];
}

/**
 * 处理 `key: <value>` 的值部分。
 * 值为空 → 看下一行是否更深：更深就解析子块，否则 null。
 */
function parseValueOrBlock(lines, lineIndex, indent, rawValue, nextIndex) {
  const rest = String(rawValue ?? '').trim();
  if (rest) return [parseScalar(rest), nextIndex];
  const child = lines[nextIndex];
  if (child && child.indent > indent) {
    const [v, ni] = parseBlock(lines, nextIndex, child.indent);
    return [v, ni];
  }
  return [null, nextIndex];
}

/** 标量：引号字符串 / 内联列表 / 内联映射 / 布尔 / null / 数字 / 普通字符串。 */
export function parseScalar(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  if (t.startsWith('[') && t.endsWith(']')) {
    const body = t.slice(1, -1).trim();
    if (!body) return [];
    return splitTopLevel(body).map((s) => parseScalar(s));
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    const body = t.slice(1, -1).trim();
    const obj = {};
    if (!body) return obj;
    for (const part of splitTopLevel(body)) {
      const m = part.match(/^([^:]+):\s*([\s\S]*)$/);
      if (m) obj[m[1].trim().replace(/^['"]|['"]$/g, '')] = parseScalar(m[2]);
    }
    return obj;
  }
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (/^(null|Null|NULL|~)$/.test(t)) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0, q = null, buf = '';
  for (const ch of s) {
    if (q) { if (ch === q) q = null; buf += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * 逐行对应 `@deepseek-ai/dsh-app-boot` 的 `applyEntryPatches(data, patches, warn)`。
 * 唯一差异：宿主用 `%C` 占位符走它自己的 logger，这里直接拼成字符串。
 */
export function applyEntryPatches(data, patches, warn = () => {}) {
  if (!patches?.length) return [...data];
  data = structuredClone(data);
  const entryMap = new Map();
  const buildMap = (entries) => {
    for (const entry of entries) {
      if (entry?.id) entryMap.set(entry.id, entry);
      if (entry?.group && Array.isArray(entry.config)) buildMap(entry.config);
    }
  };
  buildMap(data);

  for (const patch of patches) {
    const { id, insert, name, ...overrides } = patch ?? {};
    if (insert) {
      if (id) {
        const target = entryMap.get(id);
        if (!target) { warn(`patch insert: entry ${id} not found`); continue; }
        if (!target.group) { warn(`patch insert: entry ${id} is not a group`); continue; }
        if (!Array.isArray(target.config)) target.config = [];
        target.config.push(...insert);
      } else {
        data.push(...insert);
      }
      buildMap(insert);
      continue;
    }
    if (!id) { warn('patch: id is required for non-insert patches'); continue; }
    const target = entryMap.get(id);
    if (!target) { warn(`patch: entry ${id} not found`); continue; }
    if (name && name !== target.name) {
      warn(`patch: name mismatch for ${id} (expected ${target.name}, got ${name}), skipping`);
      continue;
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'id') continue;
      target[key] = value;
    }
  }
  return data;
}

/** 组合多层补丁 = 宿主 `composeEntries(layers)`：把每层的行摊平，按顺序打一遍。 */
export function composeEntries(layers) {
  const warnings = [];
  const entries = applyEntryPatches([], (layers ?? []).flat(), (m) => warnings.push(m));
  return { entries, warnings };
}
