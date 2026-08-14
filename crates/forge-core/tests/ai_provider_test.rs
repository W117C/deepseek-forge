//! AI provider resolution tests (increment ②). No HTTP is exercised:
//! without FORGE_AI_ENDPOINT/FORGE_AI_KEY the generator must stay "rules".

use forge_core::adapter::{propose, provider_from_env};
use forge_core::import::analyze_dir;

fn write(path: &std::path::Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

#[test]
fn provider_requires_both_endpoint_and_key() {
    assert!(provider_from_env(None, None).is_none());
    assert!(provider_from_env(Some("https://x"), None).is_none());
    assert!(provider_from_env(None, Some("k")).is_none());
    assert!(provider_from_env(Some("  "), Some("k")).is_none());
    let p = provider_from_env(Some(" https://x.example/v1 "), Some(" key ")).unwrap();
    assert_eq!(p.endpoint, "https://x.example/v1");
    assert_eq!(p.api_key, "key");
}

#[test]
fn rules_mode_is_explicit_without_provider() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("package.json"),
        r#"{"name":"x","version":"1.0.0","license":"MIT","main":"index.js"}"#,
    );
    write(&tmp.path().join("index.js"), "console.log(1)");
    write(&tmp.path().join("LICENSE"), "MIT License");
    let analysis = analyze_dir(tmp.path()).unwrap();
    let proposal = propose(&analysis).unwrap();
    // 无 AI 供应商环境：绝不伪造 AI，必须明示 rules
    assert_eq!(proposal.generator, "rules");
}
