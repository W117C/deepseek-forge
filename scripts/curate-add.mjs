#!/usr/bin/env node
// 自动增量收录：从 awesome-dsh-plugin 的 README（真实数据源）拉取插件列表，
// 解析 → 去重 → 分类映射 → 生成 forge.package.v1 → 可选扫描，写入 curated-registry。
// 数据源说明：awesome-dsh-plugin 仓库已无 data/repositories.json，官方脚本
// （probe-stars.mjs）直接用正则从 README 提取插件 URL——本脚本跟随该模式。
//
// 用法：
//   node scripts/curate-add.mjs                          # 拉取 README 增量收录（无 token 时 GitHub 元数据留空）
//   GITHUB_TOKEN=... node scripts/curate-add.mjs          # 有 token 时探测 stars/license/topics 补全元数据
//   node scripts/curate-add.mjs --readme-en FILE --readme-zh FILE   # 用本地缓存 README（离线/测试）
//   node scripts/curate-add.mjs --scan                   # 生成后调用 forge-core scan 写回 security 字段
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outRoots = [
  join(root, 'curated-registry'),
  join(process.env.HOME || '', '.deepseek-forge', 'registry'),
];

// README 分类 → 我们 curated 包的中文 category（与旧 SELECT 分类体系对齐）
const CAT_OF_EN = {
  'UI Enhancements': '界面与体验',
  'Themes & Appearance': '界面与体验',
  'Models & Providers': '模型与接入',
  'Sessions & Messages': '会话与消息',
  'Memory': '记忆与知识',
  'Tools & Capabilities': '工具与能力',
  'Skills': '技能包',
  'Workflow & Automation': '工作流与自动化',
  'Notifications & Integrations': '通知与集成',
  'Development & Runtime': '开发与运行时',
  'Plugin Markets & Managers': '插件市场与管理',
  'Just for Fun': '趣味与娱乐',
};

// 人工精调覆盖：fullName -> { type, category }（README 无 type 字段，启发式不可靠；
// 未覆盖的条目 type 默认 plugin，category 取 README 分类映射）
const OVERRIDES = {
  'xyTom/coding-tools-mcp': { type: 'mcp', category: '工具与能力' },
  'wink-run/tokenbank': { type: 'tool', category: '生态与资源' },
  'labring/sealos-skills': { type: 'skill', category: '开发与运行时' },
  'Anionex/dsh-turn-rewind': { type: 'plugin', category: '开发与运行时' },
  'openguardrails/openguardrails': { type: 'plugin', category: '安全与隐私' },
  'kuangre123/iosdev': { type: 'skill', category: '实用工具与其他' },
};

function slugOf(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

// 解析 README：`### 分类` 分节，每行 `- [name](url) - desc`（兼容 `—` 分隔）
function parseReadme(text) {
  const out = [];
  let cat = '';
  for (const line of text.split('\n')) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { cat = h[1].replace(/^[^\x00-\x7F]+\s*/, ''); continue; } // 去 emoji 前缀
    const m = line.match(/^- \[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)\s+[-—]\s+(.+)$/);
    if (m) {
      const url = m[2].replace(/\/$/, '');
      const fullName = url.replace('https://github.com/', '');
      out.push({ category: cat, name: m[1], fullName, url, desc: m[3].trim() });
    }
  }
  return out;
}

function catOf(entry) {
  const ov = OVERRIDES[entry.fullName];
  if (ov && ov.category) return ov.category;
  return CAT_OF_EN[entry.category] || '实用工具与其他';
}

function typeOf(entry) {
  const ov = OVERRIDES[entry.fullName];
  if (ov && ov.type) return ov.type;
  return 'plugin';
}

async function probeRepo(fullName) {
  // 可选 GitHub API 探测：stars/license/topics/language/pushedAt
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'user-agent': 'forge-curate-add',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const r = await res.json();
    return {
      stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : null,
      license: r.license && r.license.spdx_id ? r.license.spdx_id : null,
      topics: Array.isArray(r.topics) ? r.topics : [],
      language: r.language || null,
      pushedAt: r.pushed_at || null,
    };
  } catch {
    return null;
  }
}

// README 的 name 形如 `owner/repo`（如 `Ricketts-Guo/dsh-shortcuts`），
// 与现有 curated 包 id（repo 短名，如 `dsh-shortcuts`）一致：统一取 repo 短名做 id。
function repoName(fullName) {
  return String(fullName).split('/')[1] || String(fullName);
}

function makePkg(entry, probe) {
  const repo = repoName(entry.fullName);
  const spdx = (probe && probe.license) || 'NOASSERTION';
  return {
    schema: 'forge.package.v1',
    id: slugOf(repo),
    name: entry.name || repo,
    type: typeOf(entry),
    version: '0.1.0',
    description: entry.desc.slice(0, 400),
    category: catOf(entry),
    tags: (probe && probe.topics) || [],
    publisher: { id: entry.fullName.split('/')[0], name: entry.fullName.split('/')[0] },
    source: { type: 'github', repository: entry.url, ref: null, commit: null },
    upstream: {
      repository: entry.url, author: entry.fullName.split('/')[0], license: spdx,
      version: null, url: entry.url, adapterVersion: '0.1.0',
    },
    license: { spdx, file: null },
    compatibility: { forge: '>=0.4.0', dsh: { min: null, tested: [] }, node: null, platform: [] },
    capabilities: [],
    permissions: { network: [], env: [] },
    security: { scan: 'required', status: 'UNKNOWN', scannedAt: null, findings: [] },
    artifact: { filename: '', sha256: null, signature: null, signatureAlgorithm: 'ed25519', publisherKeyId: null },
    entrypoint: { type: typeOf(entry) === 'mcp' ? 'mcp-server' : 'process', profile: null, command: null, config: {} },
    dependencies: [],
    runtime: {
      engine: 'deepseek-harness',
      profile: { name: slugOf(repo), bundles: [], patch: null },
      components: { bundles: [], presets: [], skills: [] },
      health: [],
    },
    extra: {
      stars: (probe && probe.stars) || 0,
      language: (probe && probe.language) || null,
      pushedAt: (probe && probe.pushedAt) || null,
      topics: (probe && probe.topics) || [],
      fullName: entry.fullName,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf('--' + name);
    return i < 0 ? def : args[i + 1] || true;
  };
  const readmeEnFile = flag('readme-en', null);
  const readmeZhFile = flag('readme-zh', null);
  const doScan = args.includes('--scan');

  // 1. 拉取数据源（README 即数据源；无 token 也能拿到列表，元数据留空）
  let enText, zhText;
  if (readmeEnFile) {
    enText = readFileSync(readmeEnFile, 'utf8');
    zhText = readmeZhFile ? readFileSync(readmeZhFile, 'utf8') : '';
  } else {
    const base = 'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/';
    const [en, zh] = await Promise.all([
      fetch(base + 'README.md', { signal: AbortSignal.timeout(15000) }).then((r) => r.text()),
      fetch(base + 'README.zh.md', { signal: AbortSignal.timeout(15000) }).then((r) => r.text()),
    ]);
    enText = en; zhText = zh;
  }
  const entries = parseReadme(enText);
  // 中文描述覆盖（README.zh 的 desc 更贴合中文用户；按 fullName 对齐）
  const zhByFull = new Map(parseReadme(zhText).map((e) => [e.fullName, e.desc]));
  for (const e of entries) if (zhByFull.has(e.fullName)) e.desc = zhByFull.get(e.fullName);
  console.log(`README 解析：${entries.length} 个插件条目`);

  // 2. 去重：跳过已收录（以 curated-registry/packages 现有 id 为准，repo 短名匹配）
  const existing = new Set(readdirSync(join(outRoots[0], 'packages')));
  const fresh = entries.filter((e) => !existing.has(slugOf(repoName(e.fullName))));
  console.log(`增量收录：${fresh.length} 个新插件（已收录 ${entries.length - fresh.length} 个跳过）`);

  // 3. 可选：GitHub 探测补全元数据（并发 5）
  const probed = new Map();
  if (process.env.GITHUB_TOKEN) {
    for (let i = 0; i < fresh.length; i += 5) {
      const batch = fresh.slice(i, i + 5);
      const results = await Promise.all(batch.map((e) => probeRepo(e.fullName)));
      batch.forEach((e, j) => { if (results[j]) probed.set(e.fullName, results[j]); });
      console.log(`  probed ${Math.min(i + 5, fresh.length)}/${fresh.length}`);
    }
  }

  // 4. 生成并写入两个 registry
  let written = 0;
  for (const e of fresh) {
    const pkg = makePkg(e, probed.get(e.fullName) || null);
    for (const rootDir of outRoots) {
      const dir = join(rootDir, 'packages', pkg.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    }
    written++;
  }
  for (const rootDir of outRoots) {
    const metaPath = join(rootDir, 'registry.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      meta.updatedAt = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    }
  }
  console.log(`写入 ${written} 个新包 → curated-registry + ~/.deepseek-forge/registry`);

  // 5. 可选扫描（forge-core scan 对本地包目录静态扫描，写回 security 字段）
  if (doScan) {
    const bin = join(root, 'crates', 'forge-core', 'target', 'release', 'forge-core');
    for (const e of fresh) {
      const id = slugOf(repoName(e.fullName)); // 与 makePkg 的 id 一致（repo 短名）
      const pkgPath = join(outRoots[0], 'packages', id);
      try {
        const out = execFileSync(bin, ['scan', pkgPath, '--trust', 'community'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const report = JSON.parse(out);
        const pj = join(pkgPath, 'package.json');
        const pkg = JSON.parse(readFileSync(pj, 'utf8'));
        pkg.security = {
          scan: 'required',
          status: report.verdict === 'block' ? 'BLOCKED' : report.verdict === 'warn' ? 'WARNING' : 'PASS',
          scannedAt: new Date().toISOString(),
          findings: report.findings || [],
        };
        writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`  scan ${id}: ${pkg.security.status}`);
      } catch (err) {
        console.log(`  scan ${id}: SKIP（${String(err).slice(0, 80)}）`);
      }
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
