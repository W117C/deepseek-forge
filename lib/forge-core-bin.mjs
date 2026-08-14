// lib/forge-core-bin.mjs —— forge-core Rust 二进制的定位与调用封装（Node 委托桥）。
// 决策点 D1：npm 分发的跨平台二进制打包方案留待发布阶段；开发/CI 使用仓库内构建产物。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function forgeCoreBin() {
  if (process.env.FORGE_CORE_BIN && existsSync(process.env.FORGE_CORE_BIN)) return process.env.FORGE_CORE_BIN;
  for (const profile of ['release', 'debug']) {
    const p = join(here, '..', 'crates', 'forge-core', 'target', profile, 'forge-core');
    if (existsSync(p)) return p;
  }
  const w = spawnSync('which', ['forge-core'], { encoding: 'utf8' });
  const found = (w.stdout || '').trim();
  if (w.status === 0 && found && existsSync(found)) return found;
  return null;
}

export function runForgeCore(args, { input, timeoutMs = 600000 } = {}) {
  const bin = forgeCoreBin();
  if (!bin) {
    throw new Error(
      'forge-core 二进制不可用：请先执行 cargo build --release --manifest-path crates/forge-core/Cargo.toml，' +
        '或设置 FORGE_CORE_BIN 指向 forge-core（npm 分发方案见 docs/architecture/migration-plan.md 决策点 D1）'
    );
  }
  return spawnSync(bin, args, {
    encoding: 'utf8',
    input: input ?? undefined,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function runForgeCoreJson(args, { input } = {}) {
  const r = runForgeCore(args, { input });
  if (r.status !== 0) {
    const raw = (r.stderr || '').trim() || (r.stdout || '').trim();
    let env = {};
    try {
      env = JSON.parse(raw);
    } catch {
      env = {};
    }
    const err = new Error(
      ((env.human || raw) + ' (' + (env.code || 'FAILED') + ')' + (env.recovery ? ' ' + env.recovery : '')).trim()
    );
    err.code = env.code || null;
    err.steps = env.steps ?? [];
    err.rollbackError = env.rollbackError ?? null;
    throw err;
  }
  return JSON.parse(r.stdout);
}
