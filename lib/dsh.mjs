// dsh-adapter：唯一接触 DeepSeek Harness 的薄适配层（M1 零依赖实现）。
// 所有 DSH 版本相关假设集中于此，随上游演进单独修订。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';

export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml';

// 官方 PROFILE_PATCH_TEMPLATE / PROFILE_PNPM_WORKSPACE（dsh-app-boot/lib/index.js 原文）
export const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`;
export const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`;

export function dshHome({ home } = {}) {
  return home || process.env.DSH_HOME || join(homedir(), '.dsh');
}

export function locateDsh() {
  const candidates = [];
  if (process.env.AGENTHUB_DSH_BIN) candidates.push(process.env.AGENTHUB_DSH_BIN);
  const npxRoot = join(homedir(), '.npm/_npx');
  if (existsSync(npxRoot)) {
    for (const id of readdirSync(npxRoot)) {
      candidates.push(join(npxRoot, id, 'node_modules', '.bin', 'dsh'));
    }
  }
  const w = spawnSync('which', ['dsh'], { encoding: 'utf8' });
  if (w.status === 0 && w.stdout.trim()) candidates.push(w.stdout.trim());
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function hasPnpm() {
  try {
    const r = spawnSync('pnpm', ['-v'], { encoding: 'utf8', timeout: 15000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function dshVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (r.status === 0) return (r.stdout.trim() || r.stderr.trim()).split('\n')[0];
  return null;
}

export function runDsh(bin, args, { cwd, home, timeoutMs = 60000 } = {}) {
  return spawnSync(bin, args, {
    encoding: 'utf8',
    cwd,
    timeout: timeoutMs,
    env: { ...process.env, DSH_HOME: home ?? process.env.DSH_HOME },
  });
}

export function dshConfigDir(bin) {
  const real = realpathSync(bin); // node_modules/@deepseek-ai/dsh/lib/bin.js
  return join(dirname(dirname(real)), 'config');
}

export function systemPresetsDir(bin) {
  return join(dshConfigDir(bin), 'agent-presets');
}

export function profileDir(home, name) {
  return join(home, 'profiles', name);
}

export function presetDir(home, id) {
  return join(home, '.agent-presets', id);
}

export function skillsDir(home, name) {
  return join(home, 'skills', name);
}

export function agenthubStore(home) {
  return join(home, '.agenthub');
}

// 与官方 initProfile 字节级一致的初始化（只写缺失文件，不覆盖已有）。
export function initProfile(dir, bundles) {
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) {
    const manifest = {
      name: `dsh-profile-${basename(dir)}`,
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...bundles] } },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n');
  }
  const patchPath = join(dir, PROFILE_PATCH_FILENAME);
  if (!existsSync(patchPath)) writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE);
  const workspacePath = join(dir, 'pnpm-workspace.yaml');
  if (!existsSync(workspacePath)) writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE);
  return dir;
}

export function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

export function writeManifest(dir, manifest) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n');
}
