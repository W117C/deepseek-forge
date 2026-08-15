#!/usr/bin/env node
// 非 DSH 开源 skill 适配器：把 Anthropic / awesome-claude-skills / 任意开源 SKILL.md
// 转换成 DeepSeek Harness 可用的 DSH skill（frontmatter 校验 + kebab-case 清洗 + 包装落盘）。
// 设计依据：docs/combination-design.md §3（拉取 → 校验 → 包装 → 验证）。
//
// 用法：
//   单源：node scripts/adapt-skill.mjs <github-url|本地目录> --out <dir> [--name <覆盖名>]
//   批量：node scripts/adapt-skill.mjs --batch <json文件|'[{...}]'> --out <dir>
//         批量 JSON 形如 [{"name":"docx","source":"https://github.com/anthropics/skills/blob/main/document-skills/docx/SKILL.md"}, ...]
//   内置热门源：--batch hot（Anthropic 官方 skills 等，网络可用时拉取）
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const outDir = flag('out', join(root, 'combos', 'skills'));
const batchSpec = flag('batch', null);
const nameOverride = flag('name', null);

// 内置热门 skill 源（Anthropic 官方 skills 仓库，blob URL 自动转 raw）
// 真实结构（2026-08 核实）：https://github.com/anthropics/skills/tree/main/skills/<name>/SKILL.md
const HOT_SKILLS = [
  { name: 'docx', source: 'https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md' },
  { name: 'xlsx', source: 'https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md' },
  { name: 'pptx', source: 'https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md' },
  { name: 'pdf', source: 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md' },
  { name: 'mcp-builder', source: 'https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md' },
  { name: 'webapp-testing', source: 'https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md' },
  { name: 'brand-guidelines', source: 'https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md' },
  { name: 'canvas-design', source: 'https://github.com/anthropics/skills/blob/main/skills/canvas-design/SKILL.md' },
  { name: 'frontend-design', source: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md' },
  { name: 'slack-gif-creator', source: 'https://github.com/anthropics/skills/blob/main/skills/slack-gif-creator/SKILL.md' },
  { name: 'skill-creator', source: 'https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md' },
  { name: 'theme-factory', source: 'https://github.com/anthropics/skills/blob/main/skills/theme-factory/SKILL.md' },
];

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

// 单个 skill 适配：校验/转换 frontmatter → 写入 outDir/<name>/SKILL.md
// 导出供 curate-combos.mjs 复用（组合生成时优先拉取真实 skill 内容）。
export async function adaptOne(source, outDirParam = null, nameHint = null) {
  const targetRoot = outDirParam || outDir;
  const { text, origin } = await fetchSkillText(source);
  const { meta, body } = parseFrontmatter(text);
  if (!body.trim()) throw new Error('SKILL.md 正文为空: ' + origin);

  // name：--name 覆盖 > frontmatter name > 源目录名 > fallback
  const name = toKebab(nameOverride || nameHint || meta.name || dirname(origin).split('/').pop() || 'imported-skill');
  let description = meta.description || meta.Description || '';
  if (!description) {
    description = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))?.slice(0, 200) || '';
  }
  if (!description) {
    console.log('  ⚠ 跳过（无 description）：' + origin);
    return null;
  }

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

  const targetDir = join(targetRoot, name);
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, 'SKILL.md');
  writeFileSync(target, wrapped);
  console.log('✓ 已适配：' + origin);
  console.log('  name: ' + name);
  console.log('  description: ' + description.slice(0, 80) + (description.length > 80 ? '…' : ''));
  console.log('  → ' + target);
  return target;
}

async function main() {
  if (batchSpec) {
    // 批量模式：--batch hot | <json文件> | '<json 字符串>'
    let items;
    if (batchSpec === 'hot') {
      items = HOT_SKILLS;
      console.log('批量适配 ' + items.length + ' 个热门开源 skill（Anthropic 官方 skills）…');
    } else if (existsSync(batchSpec)) {
      items = JSON.parse(readFileSync(batchSpec, 'utf8'));
    } else {
      items = JSON.parse(batchSpec);
    }
    if (!Array.isArray(items)) throw new Error('--batch 需要 JSON 数组 [{name, source}]');
    let ok = 0;
    for (const item of items) {
      if (!item || !item.source) { console.log('  ⚠ 跳过无效条目：' + JSON.stringify(item)); continue; }
      try {
        const r = await adaptOne(item.source, item.name);
        if (r) ok++;
      } catch (err) {
        console.log('  ✗ 适配失败：' + (item.name || item.source) + ' — ' + err.message);
      }
    }
    console.log(`批量适配完成：成功 ${ok}/${items.length}`);
    return;
  }

  // 单源模式
  const source = args[0];
  if (!source) {
    console.error('用法: node scripts/adapt-skill.mjs <github-url|本地目录> --out <dir> [--name <覆盖名>]');
    console.error('  或: node scripts/adapt-skill.mjs --batch hot|文件|JSON --out <dir>');
    process.exit(2);
  }
  await adaptOne(source);
}

// 入口保护：仅当直接执行（node scripts/adapt-skill.mjs）时才运行 main，
// 被 curate-combos.mjs import 复用 adaptOne 时不得连带执行/退出。
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === _require.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => { console.error('✗ 适配失败：' + err.message); process.exit(1); });
}
