// ed25519 签名与哈希（node:crypto，零依赖）。
// 规范负载：canonicalPayload = JSON.stringify(manifest) + '\n' + sha256hex(artifact)。
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';

export function keygen() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function sha256hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalPayload(manifest, artifactSha256) {
  return JSON.stringify(manifest) + '\n' + artifactSha256;
}

export function signPayload(privateKeyPem, payload) {
  return sign(null, Buffer.from(payload, 'utf8'), privateKeyPem).toString('base64');
}

export function verifyPayload(publicKeyPem, payload, signatureB64) {
  try {
    return verify(null, Buffer.from(payload, 'utf8'), publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
