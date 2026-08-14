// 生成 web/snapshot.json：从 bundles/*/agenthub.yaml 提取只读市场快照。
// 零依赖、确定性输出（不含时间戳）——CI 校验“快照与 manifest 同步”。
// Vercel 静态展示页（web/index.html）消费这份快照；真实 Registry 数据源不变。
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentManifest } from '../lib/manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlesDir = join(root, 'bundles');
const outDir = join(root, 'web');
const outFile = join(outDir, 'snapshot.json');

const agents = [];
for (const entry of readdirSync(bundlesDir).sort()) {
  const dir = join(bundlesDir, entry);
  if (!existsSync(join(dir, 'agenthub.yaml'))) continue;
  const m = loadAgentManifest(dir);
  agents.push({
    id: m.id,
    name: m.name,
    category: m.category ?? '其他领域',
    version: m.version,
    description: m.description ?? '',
    publisher: m.publisher?.name ?? m.publisher?.id ?? '—',
    trust: m.trust ?? 'community',
    compatibility: m.compatibility ?? {},
    platform: m.platform ?? [],
    components: {
      bundles: (m.components.bundles ?? []).map((b) => b.package),
      presets: (m.components.presets ?? []).map((p) => p.id),
      skills: m.components.skills ?? [],
    },
    profile: { name: m.profile?.name ?? m.id },
    permissions: m.permissions ?? { network: [], env: [] },
    install: `agenthub install ${m.id} --registry <Registry 地址> --yes`,
  });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify({ agents }, null, 2) + '\n');
console.log(`快照已生成: ${outFile}（${agents.length} 个 Agent）`);
