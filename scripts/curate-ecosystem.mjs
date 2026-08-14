#!/usr/bin/env node
// STEP 3: curate-ecosystem —— 从 https://deepseekdocs.com/ecosystem 内嵌 JSON 提取真实条目，
// 经 GitHub API 拉取真实 license，写入 Local Registry（forge.package.v1）。
// 用法：node scripts/curate-ecosystem.mjs [--limit N] [--registry PATH] [--no-fetch]
// 真实性：name/description/repo/owner/category/stars 全部来自生态页数据；license 来自 GitHub API。
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function flag(args, name, def) {
  const i = args.indexOf('--' + name);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  return def;
}

const limit = Number(flag(process.argv.slice(2), 'limit', '24'));
const mcpQuota = Number(flag(process.argv.slice(2), 'mcp', '8'));
const skillQuota = Number(flag(process.argv.slice(2), 'skill', '8'));
const toolQuota = Number(flag(process.argv.slice(2), 'tool', '8'));
const registryPath = resolve(root, flag(process.argv.slice(2), 'registry', join(root, '.deepseek-forge-registry')));
const fetchLicenses = !process.argv.includes('--no-fetch');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'deepseek-forge-curator' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.text();
}

const html = await fetchText('https://deepseekdocs.com/ecosystem');
// 内嵌 JSON：形如 [{... "url":"https://github.com/..." ...}, ...]
const m = html.match(/\[(\{[\s\S]*?"url":"https:\/\/github\.com\/[^"]+"[\s\S]*?\})\]/);
if (!m) { console.error('未找到内嵌数据集'); process.exit(1); }
let entries;
try { entries = JSON.parse(m[0]); } catch { console.error('JSON 解析失败'); process.exit(1); }
console.log('生态条目总数：' + entries.length);

// 选样：真实 dsh 插件优先（topics 含 dsh-plugin 或名字 dsh- 前缀），
// 排除 harness 本体与 awesome 索引列表；不足则用高星条目补齐。全部为生态页真实数据。
const isDshPlugin = (e) =>
  (e.topics ?? []).some((t) => String(t).includes('dsh')) ||
  String(e.name).startsWith('dsh-') ||
  String(e.name).toLowerCase().includes('deepseek-harness');
const isList = (e) => String(e.name).startsWith('awesome') || /-awesome-|awesome-/.test(String(e.name));
const eligible = entries
  .filter((e) => e && e.name && e.url && e.url.startsWith('https://github.com/'))
  .filter((e) => e.fullName !== 'deepseek-ai/deepseek-harness')
  .filter((e) => !isList(e))
  .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
// 类型分类（全部来自生态页真实 topics，绝不臆造）：mcp / skill / tool / plugin
const typeOf = (e) => {
  const t = (e.topics ?? []).map((x) => String(x).toLowerCase());
  if (t.some((x) => x === 'mcp' || x === 'mcp-server' || x.startsWith('mcp-'))) return 'mcp';
  if (t.some((x) => x.includes('skill'))) return 'skill';
  if (t.some((x) => x === 'agent-tools' || x.includes('developer-tools') || (x.includes('tool') && !x.includes('toolkit-rust')))) return 'tool';
  return 'plugin';
};
// 分类优先于 dsh 判断：mcp/skill/tool 话题优先归类为对应类型（真实 topics），其余归 plugin。
const typed = eligible.map((e) => ({ e, ty: typeOf(e) }));
const mcpPick = typed.filter((x) => x.ty === 'mcp').map((x) => x.e).slice(0, mcpQuota);
const skillPick = typed.filter((x) => x.ty === 'skill').map((x) => x.e).slice(0, skillQuota);
const toolPick = typed.filter((x) => x.ty === 'tool').map((x) => x.e).slice(0, toolQuota);
const pluginPool = typed.filter((x) => x.ty === 'plugin').map((x) => x.e);
const pluginFirst = pluginPool.filter(isDshPlugin);
const restPlugin = pluginPool.filter((e) => !isDshPlugin(e));
const pluginPick = [...pluginFirst, ...restPlugin].slice(0, limit);
const seen = new Set();
const selected = [];
for (const e of [...pluginPick, ...mcpPick, ...skillPick, ...toolPick]) {
  if (seen.has(e.fullName)) continue;
  seen.add(e.fullName);
  selected.push(e);
}

console.log('收录 ' + selected.length + ' 条（stars 降序）：');
for (const e of selected) {
  console.log('  ' + e.stars + '★ ' + e.fullName + ' — ' + String(e.description || '').slice(0, 60));
}

// 拉取真实 license：优先 raw.githubusercontent（无 API 限流）文本识别；
// 失败再走 GitHub API；再失败保留已有真实 license，否则诚实标 NOASSERTION。
const SPDX_PATTERNS = [
  [/Mozilla Public License Version 2\.0/i, 'MPL-2.0'],
  [/Apache License,? Version 2\.0/i, 'Apache-2.0'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/i, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 2/i, 'GPL-2.0'],
  [/MIT License/i, 'MIT'],
  [/BSD 3-Clause|Redistribution and use in source and binary forms[\s\S]{0,400}neither the name/i, 'BSD-3-Clause'],
  [/BSD 2-Clause|Redistribution and use in source and binary forms[\s\S]{0,300}THIS SOFTWARE IS PROVIDED/i, 'BSD-2-Clause'],
  [/ISC License|Permission to use, copy, modify, and\/or distribute this software/i, 'ISC'],
  [/The Unlicense|public domain/i, 'Unlicense'],
];
function spdxFromText(text) {
  for (const [re, spdx] of SPDX_PATTERNS) {
    if (re.test(text)) return spdx;
  }
  return null;
}
async function licenseOf(fullName, existingSpdx) {
  if (!fetchLicenses) return { spdx: existingSpdx ?? 'UNKNOWN', file: null };
  try {
    for (const name of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENSE-MIT', 'LICENSE.AGPL', 'license', 'COPYING']) {
      const raw = await fetch('https://raw.githubusercontent.com/' + fullName + '/HEAD/' + name, {
        headers: { 'user-agent': 'deepseek-forge-curator' },
      });
      if (raw.ok) {
        const text = await raw.text();
        const spdx = spdxFromText(text);
        if (spdx) return { spdx, file: null };
      }
    }
  } catch { /* raw 失败 → API */ }
  try {
    const j = await (await fetch('https://api.github.com/repos/' + fullName, {
      headers: { 'user-agent': 'deepseek-forge-curator' },
    })).json();
    if (j.license?.spdx_id && j.license.spdx_id !== 'NOASSERTION') {
      return { spdx: j.license.spdx_id, file: null };
    }
  } catch { /* API 失败 → 保留已有 */ }
  return { spdx: existingSpdx ?? 'NOASSERTION', file: null };
}

mkdirSync(join(registryPath, 'registry.json') && dirname(join(registryPath, 'registry.json')), { recursive: true });
if (!existsSync(join(registryPath, 'registry.json'))) {
  writeFileSync(join(registryPath, 'registry.json'), JSON.stringify({
    schemaVersion: 1, id: 'curated', name: 'DeepSeek Forge Curated Registry',
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n');
}

let written = 0;
for (const e of selected) {
  const slug = String(e.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const existing = existsSync(join(registryPath, 'packages', slug, 'package.json'))
    ? JSON.parse(readFileSync(join(registryPath, 'packages', slug, 'package.json'), 'utf8'))
    : null;
  // 保护官方/非 github 来源包：绝不覆盖
  if (existing && existing.source && existing.source.type !== 'github') {
    continue;
  }
  const lic = await licenseOf(e.fullName, existing?.license?.spdx && existing.license.spdx !== 'UNKNOWN' && existing.license.spdx !== 'NOASSERTION' ? existing.license.spdx : undefined);
  const pkg = {
    schema: 'forge.package.v1',
    id: slug,
    name: e.name,
    type: typeOf(e),
    version: '0.1.0',
    description: String(e.description || '').slice(0, 400),
    category: e.category || '',
    tags: e.topics ?? [],
    publisher: { id: e.owner || 'community', name: e.owner || 'Community' },
    source: { type: 'github', repository: e.url, ref: null, commit: null },
    upstream: {
      repository: e.url, author: e.owner, license: lic.spdx, version: null,
      url: e.url, adapterVersion: '0.1.0',
    },
    license: { spdx: lic.spdx, file: null },
    compatibility: { forge: '>=0.4.0', dsh: { min: null, tested: [] }, node: null, platform: [] },
    capabilities: [],
    permissions: { network: [], env: [] },
    security: { scan: 'required', status: 'UNKNOWN', scannedAt: null, findings: [] },
    artifact: { filename: '', sha256: null, signature: null, signatureAlgorithm: 'ed25519', publisherKeyId: null },
    entrypoint: { type: typeOf(e) === 'mcp' ? 'mcp-server' : 'process', profile: null, command: null, config: {} },
    dependencies: [],
    runtime: { engine: 'deepseek-harness', profile: { name: slug, bundles: [], patch: null }, components: { bundles: [], presets: [], skills: [] }, health: [] },
    extra: { stars: e.stars ?? 0, language: e.language ?? null, pushedAt: e.pushedAt ?? null, topics: e.topics ?? [], fullName: e.fullName },
  };
  const dir = join(registryPath, 'packages', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  written++;
}
console.log('写入 ' + written + ' 个包 → ' + join(registryPath, 'packages'));
