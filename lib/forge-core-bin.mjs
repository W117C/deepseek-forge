// lib/forge-core-bin.mjs —— forge-core Rust 二进制的定位与调用封装（Node 委托桥）。
// 决策点 D1：npm 分发的跨平台二进制打包方案留待发布阶段；开发/CI 使用仓库内构建产物。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function publishedBin() {
  // D1 发布模式：npm 包依赖 @deepseek-forge/bin（可选依赖，CI 三平台构建产物）
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
  const exe = platform === 'windows' ? 'forge-core.exe' : 'forge-core';
  const candidates = [
    join(here, '..', 'node_modules', '@deepseek-forge', 'bin', platform, exe),
    join(here, '..', 'node_modules', '.bin', exe),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function forgeCoreBin() {
  if (process.env.FORGE_CORE_BIN && existsSync(process.env.FORGE_CORE_BIN)) return process.env.FORGE_CORE_BIN;
  // 开发模式：仓库内构建产物（release → debug）
  for (const profile of ['release', 'debug']) {
    const p = join(here, '..', 'crates', 'forge-core', 'target', profile, 'forge-core');
    if (existsSync(p)) return p;
  }
  // 发布模式：npm 安装的预构建二进制（D1）
  const pub = publishedBin();
  if (pub) return pub;
  const w = spawnSync('which', ['forge-core'], { encoding: 'utf8' });
  const found = (w.stdout || '').trim();
  if (w.status === 0 && found && existsSync(found)) return found;
  return null;
}

export function runForgeCore(args, { input, timeoutMs = 600000, env } = {}) {
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
    env: env ?? process.env,
  });
}

export function runForgeCoreJson(args, { input, env } = {}) {
  const r = runForgeCore(args, { input, env });
  if (r.status !== 0) {
    const raw = (r.stderr || '').trim() || (r.stdout || '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const err = new Error(
      ((parsed.human || raw) + ' (' + (parsed.code || 'FAILED') + ')' + (parsed.recovery ? ' ' + parsed.recovery : '')).trim()
    );
    err.code = parsed.code || null;
    err.steps = parsed.steps ?? [];
    err.rollbackError = parsed.rollbackError ?? null;
    throw err;
  }
  return JSON.parse(r.stdout);
}
