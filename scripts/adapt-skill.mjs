#!/usr/bin/env node
// 非 DSH 开源 skill 适配器：把 Anthropic / awesome-claude-skills / 任意开源 SKILL.md
// 转换成 DeepSeek Harness 可用的 DSH skill（frontmatter 校验 + kebab-case 清洗 + 包装落盘）。
// 设计依据：docs/combination-design.md §3（拉取 → 校验 → 包装 → 验证）。
//
// 用法：
//   node scripts/adapt-skill.mjs <github-url-或-本地目录> --out <组合包 skills 目录> [--name <覆盖名>]
//   例：node scripts/adapt-skill.mjs https://github.com/anthropics/skills/blob/main/.../SKILL.md --out combos/deep-research-combo/skills
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const source = args[0];
const outDir = flag('out', join(root, 'combos', 'skills'));
const nameOverride = flag('name', null);
if (!source) {
  console.error('用法: node scripts/adapt-skill.mjs <github-url|本地目录> --out <dir> [--name <覆盖名>]');
  process.exit(2);
}

// kebab-case 清洗：仅保留小写字母数字与连字符（DSH skill name 要求）
function toKebab(s) {
  const out = String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'imported-skill';
}

// 解析 frontmatter（--- 分隔的 YAML 头，兼容 Anthropic/awesome skills 格式）
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[1].length + 8) };
}

// 拉取：GitHub blob URL / raw URL / 本地目录 / 本地文件
async function fetchSkillText(source) {
  if (source.startsWith('http')) {
    let url = source;
    // github.com/owner/repo/blob/... → raw.githubusercontent.com/owner/repo/...
    const blob = source.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
    if (blob) {
      url = 'https://raw.githubusercontent.com/' + blob[1] + '/' + blob[2];
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('拉取失败 HTTP ' + res.status + ': ' + url);
    return { text: await res.text(), origin: source };
  }
  // 本地：目录（取 SKILL.md）或文件
  const p = source.endsWith('SKILL.md') ? source : join(source, 'SKILL.md');
  if (!existsSync(p)) throw new Error('本地 skill 不存在: ' + p);
  return { text: readFileSync(p, 'utf8'), origin: p };
}

async function main() {
  const { text, origin } = await fetchSkillText(source);
  const { meta, body } = parseFrontmatter(text);
  if (!body.trim()) throw new Error('SKILL.md 正文为空: ' + origin);

  // 校验/转换：name（kebab-case）+ description 必填；缺则从源推导
  const name = toKebab(nameOverride || meta.name || dirname(origin).split('/').pop() || 'imported-skill');
  let description = meta.description || meta.Description || '';
  if (!description) {
    // 从正文首段非空行补全（诚实，不臆造）
    description = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))?.slice(0, 200) || '';
  }
  if (!description) {
    console.error('警告：' + origin + ' 无 description，已跳过（DSH 要求必填）');
    process.exit(0);
  }

  // 保留原 frontmatter 中 DSH 支持的扩展字段
  const extras = ['whenToUse', 'disable-model-invocation', 'user-invocable']
    .filter((k) => meta[k] !== undefined)
    .map((k) => `${k}: ${meta[k]}`)
    .join('\n');

  const wrapped = [
    '---',
    'name: ' + name,
    'description: ' + description,
    ...(extras ? [extras] : []),
    '---',
    '',
    '> 适配来源：' + origin + '（非 DSH 原生 skill，已按 DSH frontmatter 规范包装）',
    '',
    body.trim(),
    '',
  ].join('\n');

  const targetDir = join(outDir, name);
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, 'SKILL.md');
  writeFileSync(target, wrapped);
  console.log('✓ 已适配：' + origin);
  console.log('  name: ' + name);
  console.log('  description: ' + description.slice(0, 80) + (description.length > 80 ? '…' : ''));
  console.log('  → ' + target);
}

main().catch((err) => { console.error('✗ 适配失败：' + err.message); process.exit(1); });
