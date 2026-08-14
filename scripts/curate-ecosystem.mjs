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
const pluginFirst = eligible.filter(isDshPlugin);
const rest = eligible.filter((e) => !isDshPlugin(e));
const selected = [...pluginFirst, ...rest].slice(0, limit);

console.log('收录 ' + selected.length + ' 条（stars 降序）：');
for (const e of selected) {
  console.log('  ' + e.stars + '★ ' + e.fullName + ' — ' + String(e.description || '').slice(0, 60));
}

// 拉取真实 license（未认证 GitHub API，60/h 限制）
async function licenseOf(fullName) {
  if (!fetchLicenses) return { spdx: 'UNKNOWN', file: null };
  try {
    const j = await (await fetch('https://api.github.com/repos/' + fullName, {
      headers: { 'user-agent': 'deepseek-forge-curator' },
    })).json();
    return { spdx: j.license?.spdx_id ?? 'NOASSERTION', file: null };
  } catch {
    return { spdx: 'UNKNOWN', file: null };
  }
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
  const lic = await licenseOf(e.fullName);
  const pkg = {
    schema: 'forge.package.v1',
    id: slug,
    name: e.name,
    type: 'plugin',
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
    entrypoint: { type: 'process', profile: null, command: null, config: {} },
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
