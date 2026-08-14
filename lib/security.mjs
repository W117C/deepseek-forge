// 静态字符串级安全扫描（M1 版）：先于安装执行，高危阻断、低危提示。
// 说明：这是"字符串模式"级扫描，不是 AST/沙箱级分析；完整版在 M2+ 发布流水线中实现。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  { id: 'js-expr', level: 'high', weight: 25, re: /!!js\s/, label: 'cordis 配置含 !!js 表达式（任意代码求值）' },
  { id: 'shell', level: 'high', weight: 25, re: /child_process|execSync|spawnSync|spawn\(|exec\(/g, label: '疑似 shell/子进程调用' },
  { id: 'eval', level: 'high', weight: 25, re: /\beval\(|new Function/, label: '动态代码求值（eval/new Function）' },
  { id: 'network', level: 'medium', weight: 10, re: /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/g, label: '含外网 URL（本机回环除外）' },
  { id: 'fs-write', level: 'medium', weight: 10, re: /writeFileSync|createWriteStream|unlinkSync|rmSync/, label: '文件写入/删除调用' },
  { id: 'secret', level: 'high', weight: 25, re: /sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|password\s*[:=]/, label: '疑似硬编码密钥/口令' },
  { id: 'env', level: 'low', weight: 2, re: /process\.env/, label: '读取环境变量' },
];

// 官方 preset/bundle 中的规范平台判断（与 dsh 自带 standard preset 逐字相同的两种形式），
// 视为已白名单：只计低危提示，不计高危。
const CANONICAL_PLATFORM_CHECK = /!!js\s+process\.platform\s+[!=]==?\s*'win32'/g;

export function scanText(text, label) {
  const findings = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    let count = m.length;
    if (r.id === 'js-expr') {
      const canonical = (text.match(CANONICAL_PLATFORM_CHECK) || []).length;
      count = m.length - canonical;
      if (canonical > 0) findings.push({ rule: 'js-expr-canonical', level: 'low', weight: 1, label: '官方平台判断惯用法（已白名单）', count: canonical, file: label });
    }
    if (count > 0) findings.push({ rule: r.id, level: r.level, weight: r.weight, label: r.label, count, file: label });
  }
  return findings;
}

export function scanAgentDir(dir, { trust = 'community' } = {}) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (name !== 'node_modules') walk(p); }
      else if (/\.(ya?ml|json|md|mjs|js|ts)$/.test(name)) files.push(p);
    }
  };
  walk(dir);
  const findings = [];
  for (const f of files) {
    const rel = f.slice(dir.length + 1);
    findings.push(...scanText(readFileSync(f, 'utf8'), rel));
  }
  let score = 100;
  const high = findings.filter((f) => f.level === 'high');
  const medium = findings.filter((f) => f.level === 'medium');
  const low = findings.filter((f) => f.level === 'low');
  for (const f of high) score -= f.weight;
  for (const f of medium) score -= f.weight;
  for (const f of low) score -= f.weight;
  score = Math.max(0, score);
  const verdict =
    high.length > 0 && trust !== 'official' && trust !== 'verified'
      ? 'block'
      : high.length > 0 ? 'warn' : 'pass';
  return { score, verdict, findings, high: high.length, medium: medium.length, low: low.length, files: files.length };
}
