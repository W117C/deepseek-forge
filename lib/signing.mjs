// lib/signing.mjs —— ed25519 签名与哈希（委托 forge-core Rust 引擎，单源实现）。
// 导出与行为保持与原 Node 实现一致；canonicalPayload 的 manifest 参数接受对象或 JSON 文本。
import { runForgeCore, runForgeCoreJson } from './forge-core-bin.mjs';

export function keygen() {
  return runForgeCoreJson(['sign', 'keygen', '--stdout-only']);
}

export function sha256hex(data) {
  const r = runForgeCore(['sign', 'sha256', '--stdin'], { input: data });
  if (r.status !== 0) {
    throw new Error('sha256 失败：' + ((r.stderr || '').trim() || 'forge-core 不可用'));
  }
  return JSON.parse(r.stdout).sha256;
}

export function canonicalPayload(manifest, artifactSha256) {
  // Node 契约：JSON.stringify(manifest) + '\n' + sha256hex(artifact)。
  const text = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  return runForgeCoreJson(['sign', 'canonical', '--manifest-json', text, '--sha256', artifactSha256])
    .payload;
}

export function signPayload(privateKeyPem, payload) {
  return runForgeCoreJson(['sign', 'raw', '--key', privateKeyPem, '--payload-stdin'], {
    input: payload,
  }).signature;
}

export function verifyPayload(publicKeyPem, payload, signatureB64) {
  // 契约：任何失败返回 false，不抛异常（与 Node 原实现一致）
  try {
    const r = runForgeCore(
      ['sign', 'verify', '--public-key', publicKeyPem, '--signature', signatureB64, '--payload-stdin'],
      { input: payload }
    );
    if (r.status !== 0) return false;
    return JSON.parse(r.stdout).valid === true;
  } catch {
    return false;
  }
}
