#!/usr/bin/env node
// 生成 29 个精选插件的 forge.package.v1 包，写入 curated-registry 与桌面端本地 registry。
// 数据源：bruc3van/awesome-dsh-plugin data/repositories.json（权威 API 字段）
//        + deepseekdocs.com/ecosystem 内嵌数据集（中文描述/中文分类）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const bruc = JSON.parse(readFileSync('/tmp/forge-curate/bruc-repos.json', 'utf8')).repositories;
const eco = JSON.parse(
  readFileSync('/tmp/forge-curate/ecosystem.html', 'utf8').match(
    /\[(\{[\s\S]*?"url":"https:\/\/github\.com\/[^"]+"[\s\S]*?\})\]/
  )[0]
);
const brucMap = Object.fromEntries(bruc.map((r) => [r.full_name.toLowerCase(), r]));
const ecoMap = Object.fromEntries(eco.filter((e) => e.fullName).map((e) => [e.fullName.toLowerCase(), e]));

// 精选名单：fullName -> { type, category }（type/category 依据 topics 与用途人工判定）
const SELECT = {
  'nexu-io/open-design': { type: 'plugin', category: '界面与体验' },
  'tt-a1i/archify': { type: 'skill', category: '视觉与图像' },
  'crafter-station/petdex': { type: 'plugin', category: '趣味与娱乐' },
  'foryourhealth111-pixel/vibe-skills': { type: 'skill', category: 'Agent 与自动化' },
  'hyhmrright/brooks-lint': { type: 'skill', category: '开发与工程' },
  'anywhere-labs/deepseek-harness-desktop': { type: 'plugin', category: '桌面客户端' },
  'picgo/picgo-core': { type: 'tool', category: '视觉与图像' },
  'xyTom/coding-tools-mcp': { type: 'mcp', category: 'Agent 与自动化' },
  'mnemon-dev/mnemon': { type: 'tool', category: '研究与知识' },
  'drewnekota/cetus': { type: 'plugin', category: '桌面客户端' },
  'tencentcloud/tencentmeeting-cli': { type: 'tool', category: '实用工具与其他' },
  'ariestar/sivtr': { type: 'tool', category: '研究与知识' },
  'wink-run/tokenbank': { type: 'tool', category: '生态与资源' },
  'labring/sealos-skills': null, // 无 license，拒绝
  'hikariming/dshfind': null, // 文档站，非可安装插件
  'xiaobright/dsh-anchored-standard': null, // license NOASSERTION
  'icetomoyo/dsh_workflow': { type: 'plugin', category: 'Agent 与自动化' },
  'omdsh-dev/dsh-open-in-vscode': { type: 'plugin', category: '开发与工程' },
  'omdsh-dev/dsh-notification': { type: 'plugin', category: '消息与通知' },
  'Lum1104/dsh-browser': { type: 'plugin', category: '浏览器与远程' },
  'ysr666/dsh-vision-router': { type: 'plugin', category: '视觉与图像' },
  'Jayden-X-L/forkprobe': { type: 'skill', category: '研究与知识' },
  'ChisaAlter/Deepseek-Harness-Desktop': null, // slug 与 anywhere-labs/deepseek-harness-desktop 冲突，且与 wess09 桌面壳重复，舍弃
  'Anionex/dsh-turn-rewind': { type: 'plugin', category: '开发与工程' },
  'csyangwen/dsh-memory-evolve': { type: 'plugin', category: '研究与知识' },
  'titanwings/dsh-automation': { type: 'plugin', category: 'Agent 与自动化' },
  'openguardrails/openguardrails': { type: 'plugin', category: '安全与隐私' },
  'zenx0x/allinluna': { type: 'plugin', category: 'Agent 与自动化' },
  'Chinesezjc/dsh-interconnect': { type: 'plugin', category: '集成与分享' },
  'omdsh-dev/dsh-custom-tool': { type: 'plugin', category: '开发与工程' },
  'kuangre123/iosdev': { type: 'skill', category: '实用工具与其他' },
  'dancingmemory/dskin': { type: 'plugin', category: '界面与体验' },
};

const CAT = {
  'Agent、自动化与工作流': 'Agent 与自动化',
  '界面与体验': '界面与体验',
  '知识与研究': '研究与知识',
  '设计、媒体与视觉': '视觉与图像',
  '网页与浏览器': '浏览器与远程',
  '集成与分享': '集成与分享',
  '生态与资源': '生态与资源',
  '开发者工具': '开发与工程',
  '实用工具与其他': '实用工具与其他',
};
const catOf = (b) => CAT[b.category_zh] || b.category_zh || '';

function slugOf(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function makePkg(fullName, sel) {
  const b = brucMap[fullName.toLowerCase()];
  const e = ecoMap[fullName.toLowerCase()];
  if (!b) throw new Error('missing bruc entry: ' + fullName);
  const name = b.name || fullName.split('/')[1];
  const repo = b.html_url;
  const owner = b.full_name.split('/')[0];
  const rawLic = b.license;
  const spdx = typeof rawLic === 'string' ? rawLic : (rawLic && rawLic.spdx_id) || 'NOASSERTION';
  // 描述：生态页（中文更全）优先，缺则用 bruc 描述
  const desc = (e && e.description) || b.description || '';
  const category = sel.category || catOf(b);
  const topics = b.topics || [];
  return {
    schema: 'forge.package.v1',
    id: slugOf(name),
    name,
    type: sel.type,
    version: '0.1.0',
    description: String(desc).slice(0, 400),
    category,
    tags: topics,
    publisher: { id: owner, name: owner },
    source: { type: 'github', repository: repo, ref: null, commit: null },
    upstream: {
      repository: repo, author: owner, license: spdx, version: null,
      url: repo, adapterVersion: '0.1.0',
    },
    license: { spdx, file: null },
    compatibility: { forge: '>=0.4.0', dsh: { min: null, tested: [] }, node: null, platform: [] },
    capabilities: [],
    permissions: { network: [], env: [] },
    security: { scan: 'required', status: 'UNKNOWN', scannedAt: null, findings: [] },
    artifact: { filename: '', sha256: null, signature: null, signatureAlgorithm: 'ed25519', publisherKeyId: null },
    entrypoint: { type: sel.type === 'mcp' ? 'mcp-server' : 'process', profile: null, command: null, config: {} },
    dependencies: [],
    runtime: {
      engine: 'deepseek-harness',
      profile: { name: slugOf(name), bundles: [], patch: null },
      components: { bundles: [], presets: [], skills: [] },
      health: [],
    },
    extra: {
      stars: b.stargazers_count ?? 0,
      language: b.language ?? null,
      pushedAt: b.pushed_at ?? null,
      topics,
      fullName: b.full_name,
    },
  };
}

const picked = [];
for (const [fn, sel] of Object.entries(SELECT)) {
  if (!sel) { console.log('skip: ' + fn); continue; }
  picked.push(makePkg(fn, sel));
}
console.log('picked ' + picked.length + ' packages');

const dirs = [
  '/Users/ze/Downloads/插件商店/deepseek-forge/curated-registry',
  '/Users/ze/.deepseek-forge/registry',
];
for (const root of dirs) {
  for (const p of picked) {
    const dir = join(root, 'packages', p.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(p, null, 2) + '\n');
  }
  const metaPath = join(root, 'registry.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.updatedAt = new Date().toISOString();
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log('wrote ' + picked.length + ' → ' + root);
}
