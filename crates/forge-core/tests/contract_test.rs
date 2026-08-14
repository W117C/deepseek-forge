//! Contract tests for the Phase 3a primitives.
//! Golden vectors were generated from the Node implementation (lib/signing.mjs):
//!   node -e "import('./lib/signing.mjs').then(s => { const k = s.keygen();
//!     const m = JSON.stringify({id:'golden-vector',name:'Golden',version:'1.0.0'});
//!     const sha = s.sha256hex(Buffer.from('hello-forge'));
//!     const payload = s.canonicalPayload(m, sha);
//!     const sig = s.signPayload(k.privateKey, payload);
//!     console.log(JSON.stringify({pub:k.publicKey,priv:k.privateKey,m,sha,sig,payload})); })"

use std::path::Path;

use forge_core::dsh::{
    init_profile, read_manifest, PROFILE_PATCH_TEMPLATE, PROFILE_PNPM_WORKSPACE,
};
use forge_core::security::{scan_agent_dir, scan_text};
use forge_core::signing::{canonical_payload, keygen, sha256hex, sign_payload, verify_payload};
use forge_core::snapshot::{restore_snapshot, snapshot};
use forge_core::state::{load_state, save_state};

const GOLDEN_PUB: &str = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPfdGTie+MSHgH0mPGm0B+4WFFOycekjwzu9dd6K+rcs=\n-----END PUBLIC KEY-----\n";
const GOLDEN_PRIV: &str = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIIvktQgrGIttcGohTxvP5qBid5fol4PHwfJRaroiKJlM\n-----END PRIVATE KEY-----\n";
const GOLDEN_M: &str = "{\"id\":\"golden-vector\",\"name\":\"Golden\",\"version\":\"1.0.0\"}";
const GOLDEN_SHA: &str = "5da6ccbd1533ed9022dc20838c04c0bde56a17877ca0ca6e4e1b13375a8cb461";
const GOLDEN_SIG: &str =
    "ZTSwqAcGbkOr8kLfCFX6Bh/MS7soH2wkEBQBMGCzx1xfetCbKwzGdOpFdZks3qs3GNf7n2JZo90aPmDFwBItAg==";

fn bundles_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bundles")
}

// ---- signing golden vectors ----

#[test]
fn sha256_matches_node_golden() {
    assert_eq!(sha256hex(b"hello-forge"), GOLDEN_SHA);
}

#[test]
fn canonical_payload_matches_node_golden() {
    assert_eq!(
        canonical_payload(GOLDEN_M, GOLDEN_SHA),
        format!("{GOLDEN_M}\n{GOLDEN_SHA}")
    );
}

#[test]
fn signature_is_deterministic_and_matches_node() {
    let payload = canonical_payload(GOLDEN_M, GOLDEN_SHA);
    let sig = sign_payload(GOLDEN_PRIV, &payload).unwrap();
    assert_eq!(sig, GOLDEN_SIG, "ed25519 is deterministic; must match Node");
}

#[test]
fn verify_accepts_node_signature() {
    let payload = canonical_payload(GOLDEN_M, GOLDEN_SHA);
    assert!(verify_payload(GOLDEN_PUB, &payload, GOLDEN_SIG));
}

#[test]
fn verify_rejects_tampering() {
    let payload = canonical_payload(GOLDEN_M, GOLDEN_SHA);
    assert!(!verify_payload(
        GOLDEN_PUB,
        &format!("{payload}x"),
        GOLDEN_SIG
    ));
    assert!(!verify_payload(
        GOLDEN_PUB,
        &payload,
        &format!("{GOLDEN_SIG}x")
    ));
    // wrong key
    let other = keygen();
    assert!(!verify_payload(&other.public_key, &payload, GOLDEN_SIG));
    // garbage inputs never panic
    assert!(!verify_payload("not a pem", &payload, GOLDEN_SIG));
    assert!(!verify_payload(GOLDEN_PUB, &payload, "not-base64!"));
}

#[test]
fn keygen_roundtrips_and_pem_format_matches_node() {
    let kp = keygen();
    assert!(kp.public_key.starts_with("-----BEGIN PUBLIC KEY-----\n"));
    assert!(kp.public_key.ends_with("-----END PUBLIC KEY-----\n"));
    assert!(kp.private_key.starts_with("-----BEGIN PRIVATE KEY-----\n"));
    assert!(kp.private_key.ends_with("-----END PRIVATE KEY-----\n"));
    let sig = sign_payload(&kp.private_key, "payload-1").unwrap();
    assert!(verify_payload(&kp.public_key, "payload-1", &sig));
    assert!(!verify_payload(&kp.public_key, "payload-2", &sig));
    // cross-key
    let kp2 = keygen();
    assert!(!verify_payload(&kp2.public_key, "payload-1", &sig));
    // parse of a Node-format private key must fail loudly on wrong structure
    assert!(sign_payload("not a pem", "x").is_err());
}

// ---- security ----

#[test]
fn scans_official_bundle_without_blocking() {
    let report = scan_agent_dir(&bundles_dir().join("finance-analyst"), "official").unwrap();
    assert_ne!(report.verdict, "block");
    assert!(report.score >= 90, "score {}", report.score);
    assert!(report.files >= 5);
}

#[test]
fn blocks_high_risk_fixture_for_community_trust() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join("bad.yaml"), "!!js\neval(1)\n").unwrap();
    let report = scan_agent_dir(tmp.path(), "community").unwrap();
    assert_eq!(report.verdict, "block");
    assert!(report.high >= 1);
    // official trust downgrades the same content to warn
    let report = scan_agent_dir(tmp.path(), "official").unwrap();
    assert_eq!(report.verdict, "warn");
}

#[test]
fn canonical_platform_check_is_whitelisted() {
    let findings = scan_text("!!js process.platform !== 'win32'", "f.yaml");
    assert!(
        findings.iter().any(|f| f.rule == "js-expr-canonical"),
        "expected whitelisted canonical finding"
    );
    assert!(
        !findings
            .iter()
            .any(|f| f.rule == "js-expr" && f.level == "high"),
        "canonical idiom must not count as high"
    );
}

#[test]
fn loopback_urls_are_excluded_from_network_rule() {
    let findings = scan_text(
        "http://localhost:3000 and https://example.com/api",
        "f.yaml",
    );
    let network: Vec<_> = findings.iter().filter(|f| f.rule == "network").collect();
    assert_eq!(network.len(), 1, "{:?}", findings);
    assert_eq!(network[0].count, 1);
}

// ---- dsh templates byte parity ----

#[test]
fn profile_templates_match_node_bytes() {
    assert_eq!(
        PROFILE_PATCH_TEMPLATE,
        "# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; \x60!!js\x60 expressions allowed).\n[]\n"
    );
    assert_eq!(
        PROFILE_PNPM_WORKSPACE,
        "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n"
    );
}

#[test]
fn init_profile_writes_official_shape() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("finance");
    init_profile(&dir, &["@deepseek-ai/dsh-base".to_string()]).unwrap();
    let m = read_manifest(&dir).unwrap();
    assert_eq!(m["private"], true);
    assert_eq!(m["dsh"]["profile"]["bundles"][0], "@deepseek-ai/dsh-base");
    let patch = std::fs::read_to_string(dir.join("cordis.patch.yml")).unwrap();
    assert_eq!(patch, PROFILE_PATCH_TEMPLATE);
    let ws = std::fs::read_to_string(dir.join("pnpm-workspace.yaml")).unwrap();
    assert_eq!(ws, PROFILE_PNPM_WORKSPACE);
    // idempotent: second call must not overwrite user changes
    std::fs::write(dir.join("cordis.patch.yml"), "# user edit\n").unwrap();
    init_profile(&dir, &["@deepseek-ai/dsh-base".to_string()]).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join("cordis.patch.yml")).unwrap(),
        "# user edit\n"
    );
}

// ---- state ----

#[test]
fn state_load_defaults_and_roundtrips() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path();
    assert_eq!(load_state(home), serde_json::json!({ "agents": {} }));
    let state = serde_json::json!({
        "agents": { "demo": { "version": "1.0.0", "profile": "demo" } }
    });
    save_state(home, &state).unwrap();
    assert_eq!(load_state(home), state);
    // corrupt file never crashes
    std::fs::write(home.join(".agenthub/state.json"), "{not json").unwrap();
    assert_eq!(load_state(home), serde_json::json!({ "agents": {} }));
}

// ---- snapshot / restore ----

#[test]
fn snapshot_and_restore_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path();

    // profile with two files
    let pdir = home.join("profiles/fin");
    std::fs::create_dir_all(&pdir).unwrap();
    std::fs::write(pdir.join("package.json"), "{\"original\":true}\n").unwrap();
    std::fs::write(pdir.join("cordis.patch.yml"), "# original patch\n").unwrap();
    // preset + skill
    let preset = home.join(".agent-presets/p1");
    std::fs::create_dir_all(&preset).unwrap();
    std::fs::write(preset.join("agent.cordis.yml"), "a: 1\n").unwrap();
    let skill = home.join("skills/s1");
    std::fs::create_dir_all(&skill).unwrap();
    std::fs::write(skill.join("SKILL.md"), "# skill\n").unwrap();

    let snap = snapshot(
        home,
        "agent-x",
        "fin",
        &["p1".to_string()],
        &["s1".to_string()],
    )
    .unwrap();
    assert!(snap.snap_dir.exists());
    assert!(snap.snap_dir.join("profile/package.json").exists());
    assert!(snap.snap_dir.join("preset-p1/agent.cordis.yml").exists());
    assert!(snap.snap_dir.join("skill-s1/SKILL.md").exists());

    // mutate
    std::fs::write(pdir.join("package.json"), "{\"mutated\":true}\n").unwrap();
    std::fs::remove_file(skill.join("SKILL.md")).unwrap();
    std::fs::write(preset.join("agent.cordis.yml"), "a: 2\n").unwrap();

    restore_snapshot(
        home,
        "agent-x",
        &snap.ts,
        "fin",
        &["p1".to_string()],
        &["s1".to_string()],
    )
    .unwrap();

    assert_eq!(
        std::fs::read_to_string(pdir.join("package.json")).unwrap(),
        "{\"original\":true}\n"
    );
    assert_eq!(
        std::fs::read_to_string(pdir.join("cordis.patch.yml")).unwrap(),
        "# original patch\n"
    );
    assert_eq!(
        std::fs::read_to_string(preset.join("agent.cordis.yml")).unwrap(),
        "a: 1\n"
    );
    assert!(skill.join("SKILL.md").exists());
    // state untouched for unknown agent
    assert!(load_state(home)["agents"].get("agent-x").is_none());
}

#[test]
fn snapshot_profile_missing_restore_removes_profile() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path();
    let snap = snapshot(home, "agent-y", "ghost", &[], &[]).unwrap();
    assert!(snap.snap_dir.join(".profile-missing").exists());
    let pdir = home.join("profiles/ghost");
    std::fs::create_dir_all(&pdir).unwrap();
    std::fs::write(pdir.join("package.json"), "{}").unwrap();
    restore_snapshot(home, "agent-y", &snap.ts, "ghost", &[], &[]).unwrap();
    assert!(!pdir.exists());
}

#[test]
fn invalid_pem_is_loud() {
    let err = sign_payload(
        "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
        "x",
    );
    assert!(err.is_err());
    assert_eq!(err.unwrap_err().code(), "INVALID_MANIFEST");
}
