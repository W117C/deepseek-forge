// 远端安装客户端：拉取元数据+制品 → 验签 → 验哈希 → 解包到 fetch 目录。
// 任何校验失败都阻断安装（安全边界）。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sha256hex, verifyPayload, canonicalPayload } from './signing.mjs';

export async function fetchAgent(registryUrl, id, destDir, version) {
  const base = registryUrl.replace(/\/$/, '');
  const detailRes = await fetch(base + '/v1/agents/' + encodeURIComponent(id));
  if (detailRes.status !== 200) throw new Error('registry: ' + detailRes.status + ' ' + (await detailRes.text()));
  const detail = await detailRes.json();
  // 信任/状态门禁：blocked 与 yanked 直接拒绝安装
  if (detail.trust === 'blocked' || detail.status === 'blocked') {
    throw new Error('安全校验失败：该 Agent 被 Registry 标记为 blocked（服务端扫描发现高危）——安装已阻断');
  }
  if (detail.status === 'yanked') {
    throw new Error('安装已阻断：该版本已被 Registry 撤回（yanked）');
  }

  // 目标版本：默认最新；--version 时从 versions 端点取该版本的 manifest+signature+签名 URL
  let target = { manifest: detail.manifest, signature: detail.signature, sha256: detail.sha256, artifactUrl: detail.artifactUrl };
  if (version) {
    const vsRes = await fetch(base + '/v1/agents/' + encodeURIComponent(id) + '/versions');
    const vs = await vsRes.json();
    const v = vs.find((x) => x.version === version);
    if (!v) throw new Error('registry: 无此版本 ' + version + '（可用：' + vs.map((x) => x.version).join(', ') + '）');
    target = { manifest: v.manifest, signature: v.signature, sha256: v.sha256, artifactUrl: v.artifactUrl };
  }
  const tv = target.manifest?.version;
  if (!tv) throw new Error('registry: 无版本信息');

  const artifactPath = target.artifactUrl ?? '/v1/agents/' + encodeURIComponent(id) + '/' + encodeURIComponent(tv) + '/artifact';
  const artRes = await fetch(base + artifactPath);
  if (artRes.status !== 200) throw new Error('artifact: ' + artRes.status + ' ' + (await artRes.text()));
  const artifact = Buffer.from(await artRes.arrayBuffer());

  // 1. 哈希校验（防传输/存储损坏或篡改）
  const expectedSha = artRes.headers.get('x-agenthub-sha256');
  const actualSha = sha256hex(artifact);
  if (!expectedSha || expectedSha !== actualSha) {
    throw new Error('安全校验失败：制品哈希不匹配（声明 ' + expectedSha + '，实际 ' + actualSha + '）——安装已阻断');
  }
  // 2. 签名校验（防发布者身份伪造）
  const payload = canonicalPayload(target.manifest, expectedSha);
  if (!detail.publicKey || !target.signature || !verifyPayload(detail.publicKey, payload, target.signature)) {
    throw new Error('安全校验失败：发布者签名无效——安装已阻断');
  }

  // 3. 解包到版本化目录（不同版本绝不共享目录，避免旧链接被新内容污染）
  const versioned = join(destDir, tv);
  rmSync(versioned, { recursive: true, force: true });
  mkdirSync(versioned, { recursive: true });
  const tgz = join(destDir, id + '-' + tv + '.tgz');
  writeFileSync(tgz, artifact);
  // tar-slip 防护：先列条目，拒绝绝对路径与含 .. 的条目，再解包
  const list = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (list.status !== 0 || (list.stdout || '').split('\n').some((e) => {
    const t = e.trim();
    return t && (t.startsWith('/') || t.split('/').includes('..'));
  })) {
    rmSync(tgz, { force: true });
    throw new Error('安全校验失败：制品包含不安全路径条目（tar-slip）——安装已阻断');
  }
  const r = spawnSync('tar', ['-xzf', tgz, '-C', versioned], { encoding: 'utf8' });
  rmSync(tgz, { force: true });
  if (r.status !== 0) throw new Error('解包失败: ' + (r.stderr || ''));
  return { destDir: versioned, detail, version: tv, sha256: actualSha };
}
