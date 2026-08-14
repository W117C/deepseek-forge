// yamllite：仅支持 AgentHub manifest 子集的迷你 YAML 解析器。
// 支持：注释、key: value、缩进 map、'- ' 列表、流式数组/映射（含未加引号标量）。
// 不支持（会显式报错，绝不静默）：锚点/别名、多行块标量、标签。
export function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  let i = 0;
  const err = (msg) => { throw new Error('yamllite: line ' + (i + 1) + ': ' + msg); };
  const scalar = (s) => {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return Number(s);
    try { return JSON.parse(s); } catch { /* 非 JSON 流式形式走下方 */ }
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map((p) => scalar(p));
    }
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1).trim();
      if (inner === '') return {};
      const obj = {};
      for (const pair of inner.split(',')) {
        const idx = pair.indexOf(':');
        if (idx < 0) throw new Error('yamllite: 非法流式映射项: ' + pair);
        obj[pair.slice(0, idx).trim()] = scalar(pair.slice(idx + 1));
      }
      return obj;
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    return s;
  };
  // stack 项：{ indent, node, parent, key }；parent/key 用于把 map 占位就地转成 list。
  const stack = [{ indent: -1, node: root, parent: null, key: null }];
  const top = () => stack[stack.length - 1];
  const popTo = (indent) => { while (stack.length > 1 && indent <= top().indent) stack.pop(); };
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    popTo(indent);
    const t = top();
    const content = line.trim();
    if (content.startsWith('- ')) {
      let arr = t.node;
      if (!Array.isArray(arr)) {
        if (t.parent === null) err('list item outside a list');
        arr = [];
        t.parent[t.key] = arr;
        t.node = arr;
      }
      const itemText = content.slice(2).trim();
      const m = /^([\w][\w.-]*)\s*:\s*(.*)$/.exec(itemText);
      if (m) {
        const item = {};
        arr.push(item);
        stack.push({ indent, node: item, parent: arr, key: arr.length - 1 });
        if (m[2].trim() !== '') item[m[1]] = scalar(m[2]);
        else { const child = {}; item[m[1]] = child; stack.push({ indent, node: child, parent: item, key: m[1] }); }
      } else {
        arr.push(scalar(itemText));
      }
      continue;
    }
    const m = /^([\w][\w.-]*)\s*:\s*(.*)$/.exec(content);
    if (!m) err('expected key: value');
    const key = m[1];
    const value = m[2].trim();
    if (Array.isArray(t.node)) err('key inside list without item map');
    if (value === '') {
      const child = {};
      t.node[key] = child;
      stack.push({ indent, node: child, parent: t.node, key });
    } else {
      t.node[key] = scalar(value);
    }
  }
  return root;
}
