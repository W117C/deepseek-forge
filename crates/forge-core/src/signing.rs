//! ed25519 + SHA-256 signing primitives, byte-compatible with lib/signing.mjs (Node).
//!
//! PEM output matches Node's `crypto.generateKeyPairSync('ed25519')` SPKI/PKCS8
//! format exactly (64-column base64 armor). Ed25519 SPKI/PKCS8 encodings are
//! fixed-length (RFC 8410), so PEM <-> key conversion uses the canonical
//! 44/48-byte DER structures directly.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::errors::ForgeError;

/// Public/private key pair; PEM strings matching Node's output.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Keypair {
    pub public_key: String,
    pub private_key: String,
}

// RFC 8410 fixed DER prefixes:
//   SPKI:  302a 3005 0603 2b6570 0321 00 <32-byte public key>
//   PKCS8: 302e 0201 00 3005 0603 2b6570 0422 0420 <32-byte seed>
const SPKI_PREFIX: [u8; 12] = [
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];
const PKCS8_PREFIX: [u8; 16] = [
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
];

fn pem_error(msg: impl Into<String>) -> ForgeError {
    ForgeError::InvalidManifest(msg.into())
}

fn pem_wrap(label: &str, der: &[u8]) -> String {
    let b64 = B64.encode(der);
    let mut out = String::with_capacity(b64.len() + 64);
    out.push_str("-----BEGIN ");
    out.push_str(label);
    out.push_str("-----\n");
    for chunk in b64.as_bytes().chunks(64) {
        out.push_str(std::str::from_utf8(chunk).expect("base64 is ascii"));
        out.push('\n');
    }
    out.push_str("-----END ");
    out.push_str(label);
    out.push_str("-----\n");
    out
}

fn pem_unwrap(pem: &str) -> Result<Vec<u8>, ForgeError> {
    let body: String = pem.lines().filter(|l| !l.starts_with("-----")).collect();
    B64.decode(body.trim())
        .map_err(|e| pem_error(format!("invalid PEM: {e}")))
}

fn seed_from_pem(private_key_pem: &str) -> Result<[u8; 32], ForgeError> {
    let der = pem_unwrap(private_key_pem)?;
    if der.len() < 32 || !der.starts_with(&PKCS8_PREFIX) {
        return Err(pem_error("not a PKCS8 ed25519 private key"));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&der[der.len() - 32..]);
    Ok(seed)
}

fn public_from_pem(public_key_pem: &str) -> Result<[u8; 32], ForgeError> {
    let der = pem_unwrap(public_key_pem)?;
    if der.len() < 32 || !der.starts_with(&SPKI_PREFIX) {
        return Err(pem_error("not an SPKI ed25519 public key"));
    }
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&der[der.len() - 32..]);
    Ok(pk)
}

/// Generate a fresh ed25519 keypair (Node `keygen()` equivalent).
pub fn keygen() -> Keypair {
    let signing = SigningKey::generate(&mut OsRng);
    let seed = signing.to_bytes();
    let public = signing.verifying_key().to_bytes();

    let mut priv_der = Vec::with_capacity(48);
    priv_der.extend_from_slice(&PKCS8_PREFIX);
    priv_der.extend_from_slice(&seed);

    let mut pub_der = Vec::with_capacity(44);
    pub_der.extend_from_slice(&SPKI_PREFIX);
    pub_der.extend_from_slice(&public);

    Keypair {
        private_key: pem_wrap("PRIVATE KEY", &priv_der),
        public_key: pem_wrap("PUBLIC KEY", &pub_der),
    }
}

/// Lowercase hex SHA-256 of the given bytes (Node `sha256hex` equivalent).
pub fn sha256hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Canonical payload: the manifest JSON text verbatim + '\n' + artifact SHA-256.
pub fn canonical_payload(manifest_json: &str, artifact_sha256: &str) -> String {
    format!("{manifest_json}\n{artifact_sha256}")
}

/// Sign a payload with a PKCS8 PEM private key; returns a base64 signature.
pub fn sign_payload(private_key_pem: &str, payload: &str) -> Result<String, ForgeError> {
    let seed = seed_from_pem(private_key_pem)?;
    let signing = SigningKey::from_bytes(&seed);
    Ok(B64.encode(signing.sign(payload.as_bytes()).to_bytes()))
}

/// Verify a base64 signature against an SPKI PEM public key. Never panics.
pub fn verify_payload(public_key_pem: &str, payload: &str, signature_b64: &str) -> bool {
    let Ok(pk) = public_from_pem(public_key_pem) else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&pk) else {
        return false;
    };
    let Ok(sig_bytes) = B64.decode(signature_b64) else {
        return false;
    };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else {
        return false;
    };
    vk.verify_strict(payload.as_bytes(), &sig).is_ok()
}
