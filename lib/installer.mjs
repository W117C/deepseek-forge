// lib/installer.mjs —— 安装器委托桥（唯一实现 = forge-core Rust 引擎，crates/forge-core）。
// 导出与返回形状保持与原 Node 实现一致：18 套 e2e 断言一行不改，
// 现在经本桥实际驱动 Rust 安装引擎（十步管线/快照/自动回滚全部在 Rust 侧）。
import { runForgeCoreJson } from './forge-core-bin.mjs';

export function install({ agentDir, home, bin, profileName, yes = false, smoke = false, trust }) {
  const args = ['install', agentDir, '--home', home, '--bin', bin, '--profile', profileName, '--yes'];
  if (smoke) args.push('--smoke');
  if (trust) args.push('--trust', trust);
  let result;
  try {
    result = runForgeCoreJson(args);
  } catch (err) {
    const e = new Error(err.message);
    e.installedSteps = err.steps ?? [];
    e.rollbackError = err.rollbackError ?? null;
    throw e;
  }
  result.scan = result.scan ?? {};
  result.scan.trust = trust || result.scan.trust || 'community';
  return result;
}

export function rollback(home, agentId) {
  return runForgeCoreJson(['rollback', agentId, '--home', home]);
}

export function installCatalogPlugin({ name, source, home, bin, profileName }) {
  const args = [
    'catalog-plugin', name,
    '--source', source,
    '--home', home,
    '--bin', bin,
    '--profile', profileName || 'plugins',
  ];
  try {
    return runForgeCoreJson(args);
  } catch (err) {
    const e = new Error(err.message);
    e.rollbackError = err.rollbackError ?? null;
    throw e;
  }
}
