// lib/security.mjs —— 静态安全扫描（委托 forge-core Rust 引擎，单源实现）。
// 导出与行为保持与原 Node 实现一致。
import { runForgeCore, runForgeCoreJson } from './forge-core-bin.mjs';

export function scanText(text, label) {
  const r = runForgeCore(['scan', '--stdin', '--label', label, '--trust', 'community'], {
    input: text,
  });
  if (r.status !== 0) {
    throw new Error('scan 失败：' + ((r.stderr || '').trim() || 'forge-core 不可用'));
  }
  return JSON.parse(r.stdout).findings;
}

export function scanAgentDir(dir, { trust = 'community' } = {}) {
  return runForgeCoreJson(['scan', dir, '--trust', trust]);
}
