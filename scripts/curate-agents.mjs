#!/usr/bin/env node
// 把官方 Agent bundles（bundles/ 下非 test-fixtures 目录）收录为 curated-registry 的
// forge.package.v1 agent 类型包（type: agent / entrypoint: harness-profile / runtime.components）。
// 产物 = forge-core registry import（Rust 归一化）生成的平面 package.json，与本地 registry 读取一致。
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forgeCoreBin } from '../lib/forge-core-bin.mjs';

function copyRecursive(src, dest) {
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const bundlesDir = join(root, 'bundles');
const outRoot = join(root, 'curated-registry');

const core = forgeCoreBin();
if (!core) { console.error('forge-core 二进制未找到'); process.exit(1); }

const dirs = readdirSync(bundlesDir, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      d.name !== 'test-fixtures' &&
      existsSync(join(bundlesDir, d.name, 'agenthub.yaml')),
  )
  .map((d) => d.name);

if (dirs.length === 0) { console.error('bundles/ 下未找到 agent 目录'); process.exit(1); }
console.log('agent bundles: ' + dirs.join(', '));

const tmp = join(root, '.curate-agents-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

for (const name of dirs) {
  execFileSync(core, ['registry', 'import', join(bundlesDir, name), '--registry', tmp], { stdio: 'pipe' });
  const srcPkg = join(tmp, 'packages', name);
  if (!existsSync(join(srcPkg, 'package.json'))) { console.error('import 失败: ' + name); continue; }
  // 复制完整包结构：平面 package.json + versions/<v>/（manifest/artifact/security/compatibility）
  // 这样桌面 install-from-registry 能取到真实制品并走十步安装管线。
  const dest = join(outRoot, 'packages', name);
  mkdirSync(dest, { recursive: true });
  copyRecursive(srcPkg, dest);
  const p = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
  const presets = (p.runtime?.components?.presets ?? []).map((x) => x.id).join(',');
  console.log(`✓ ${p.id} type=${p.type} entrypoint=${p.entrypoint?.type} presets=${presets || '—'}`);
}
// 复制 cache/（artifact tgz 与 sha 校验）
const srcCache = join(tmp, 'cache');
if (existsSync(srcCache)) {
  const dstCache = join(outRoot, 'cache');
  mkdirSync(dstCache, { recursive: true });
  copyRecursive(srcCache, dstCache);
}
rmSync(tmp, { recursive: true, force: true });

const metaPath = join(outRoot, 'registry.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
meta.updatedAt = new Date().toISOString();
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log('updated curated-registry/registry.json → ' + meta.updatedAt);
