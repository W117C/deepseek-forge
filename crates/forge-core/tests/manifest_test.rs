use std::path::{Path, PathBuf};

use forge_core::errors::ForgeError;
use forge_core::manifest::{load_legacy_agent_dir, parse_package_json};
use forge_core::model::{Package, PackageType};

/// The reduced finance-analyst example from target-state §6.
const EXAMPLE: &str = r#"{
  "schema": "forge.package.v1",
  "id": "finance-analyst",
  "name": "Finance Analyst",
  "type": "agent",
  "version": "0.1.0",
  "description": "把 DeepSeek Harness 变成金融研究与决策支持 Agent。",
  "category": "finance",
  "tags": [],
  "publisher": { "id": "agenthub", "name": "AgentHub" },
  "source": { "type": "forge", "repository": "https://github.com/W117C/deepseek-forge", "ref": "v0.3.0", "commit": null },
  "upstream": { "repository": null, "author": "AgentHub", "license": "MIT", "version": null, "url": null, "adapterVersion": "0.1.0" },
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "compatibility": { "forge": ">=0.4.0", "dsh": { "min": "0.1.0-rc.6", "tested": ["0.1.0-rc.6"] }, "node": ">=22", "platform": ["darwin", "linux"] },
  "capabilities": ["network.http", "environment.read"],
  "permissions": { "network": ["localhost:3111"], "env": [] },
  "security": { "scan": "required", "status": "PASS", "scannedAt": null, "findings": [] },
  "artifact": { "filename": "finance-analyst-0.1.0.tar.gz", "sha256": null, "signature": null, "signatureAlgorithm": "ed25519", "publisherKeyId": "agenthub" },
  "entrypoint": { "type": "harness-profile", "profile": "finance", "command": null, "config": {} },
  "dependencies": [{ "package": "@agenthub/finance-core", "version": "0.1.0", "required": true }],
  "runtime": {
    "engine": "deepseek-harness",
    "profile": { "name": "finance", "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@agenthub/finance-core"], "patch": "./profile.patch.yml" },
    "components": {
      "bundles": [{ "package": "@agenthub/finance-core", "version": "0.1.0" }],
      "presets": [{ "id": "finance-analyst", "base": "standard" }],
      "skills": ["financial-analysis", "company-research"]
    },
    "health": [{ "kind": "dump-config", "expect-rows": ["mcp-market-data", "schedule"] }]
  }
}"#;

fn fixture_dir(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../bundles")
        .join(name)
}

#[test]
fn parses_forge_package_v1_example() {
    let package = parse_package_json(EXAMPLE).unwrap();
    assert_eq!(package.r#type, PackageType::Agent);
    assert!(package.capabilities.iter().any(|c| c == "network.http"));
    assert_eq!(package.runtime.components.skills.len(), 2);
    assert_eq!(package.publisher.id, "agenthub");
}

#[test]
fn normalizes_both_real_fixtures() {
    for id in ["finance-analyst", "academic-researcher"] {
        let package = load_legacy_agent_dir(&fixture_dir(id)).unwrap();
        assert_eq!(package.r#type, PackageType::Agent, "type for {}", id);
        assert_eq!(package.id, id);
        assert!(
            package.capabilities.iter().any(|c| c == "network.http"),
            "capabilities for {}",
            id
        );
        assert!(!package.runtime.components.skills.is_empty());
        assert!(
            package.extra.contains_key("trust"),
            "extra trust for {}",
            id
        );
        assert_eq!(package.license.spdx, "NOASSERTION");
    }
}

#[test]
fn wrong_schema_is_invalid() {
    let text = EXAMPLE.replace("\"forge.package.v1\"", "\"forge.package.v9\"");
    let err = parse_package_json(&text).unwrap_err();
    assert_eq!(err.code(), "INVALID_SCHEMA");
}

#[test]
fn bad_semver_is_invalid() {
    let text = EXAMPLE.replace("\"version\": \"0.1.0\"", "\"version\": \"not-a-version\"");
    let err = parse_package_json(&text).unwrap_err();
    assert_eq!(err.code(), "INVALID_MANIFEST");
}

#[test]
fn round_trips_normalized_package() {
    let package = load_legacy_agent_dir(&fixture_dir("finance-analyst")).unwrap();
    let json = serde_json::to_string(&package).unwrap();
    let parsed: Package = serde_json::from_str(&json).unwrap();
    assert_eq!(package, parsed);
}

#[test]
fn round_trips_forge_package_v1_example() {
    let package = parse_package_json(EXAMPLE).unwrap();
    let json = serde_json::to_string(&package).unwrap();
    let parsed: Package = serde_json::from_str(&json).unwrap();
    assert_eq!(package, parsed);
}
