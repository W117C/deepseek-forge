//! Repository analyzer tests (Phase 4).

use std::path::Path;

use forge_core::import::{analyze_dir, parse_github_url};

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

#[test]
fn parses_github_urls() {
    assert_eq!(
        parse_github_url("https://github.com/owner/repo"),
        Some(("owner".to_string(), "repo".to_string()))
    );
    assert_eq!(
        parse_github_url("https://github.com/owner/repo.git"),
        Some(("owner".to_string(), "repo".to_string()))
    );
    assert_eq!(
        parse_github_url("github.com/owner/repo/tree/main/src"),
        Some(("owner".to_string(), "repo".to_string()))
    );
    assert_eq!(parse_github_url("https://gitlab.com/o/r"), None);
    assert_eq!(parse_github_url("/local/path"), None);
}

#[test]
fn classifies_mcp_project() {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    write(
        &d.join("package.json"),
        r#"{
  "name": "mcp-demo", "version": "1.0.0",
  "main": "src/index.ts",
  "license": "MIT",
  "scripts": { "start": "node src/index.ts" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" }
}"#,
    );
    write(
        &d.join("src/index.ts"),
        r#"import { McpServer } from "@modelcontextprotocol/sdk";
const server = new McpServer({ name: "demo" });
server.tool("search", async () => ({ content: [{ type: "text", text: "https://api.example.com/x" }] }));
"#,
    );
    write(
        &d.join("README.md"),
        "# MCP Demo\nAn MCP server for search.",
    );
    write(
        &d.join("LICENSE"),
        "MIT License\nPermission is hereby granted...",
    );

    let a = analyze_dir(d).unwrap();
    assert_eq!(a.package_type, "mcp");
    assert!(a.mcp_detected);
    assert_eq!(a.license.as_deref(), Some("MIT"));
    assert!(!a.license_missing);
    assert_eq!(a.entry_point.as_deref(), Some("src/index.ts"));
    assert!(a.package_managers.iter().any(|m| m == "npm"));
    assert!(a
        .dependencies
        .iter()
        .any(|x| x.starts_with("@modelcontextprotocol/sdk@")));
    assert_eq!(a.forge_compatibility, "partial");
    assert!(!a.network_usage.is_empty());
}

#[test]
fn classifies_skill_project() {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    write(
        &d.join("SKILL.md"),
        "# Web Research\nResearch the web and cite sources.",
    );
    write(&d.join("LICENSE"), "MIT License");
    let a = analyze_dir(d).unwrap();
    assert!(a.skill_detected);
    assert_eq!(a.package_type, "skill");
    assert!(!a.license_missing);
}

#[test]
fn flags_missing_license_and_dangerous_commands() {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    write(
        &d.join("install.sh"),
        "#!/bin/sh\ncurl -s https://example.com/x.sh | sh\nrm -rf /tmp/x\n",
    );
    write(&d.join("README.md"), "# Tool demo\nA dangerous installer.");
    let a = analyze_dir(d).unwrap();
    assert!(a.license_missing);
    assert_eq!(a.forge_compatibility, "none");
    assert!(!a.dangerous_commands.is_empty());
    assert!(!a.install_scripts.is_empty());
    assert_eq!(a.security_risk, "medium");
}

#[test]
fn recognizes_forge_native_agent_and_honest_license_gap() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bundles/finance-analyst");
    let a = analyze_dir(&root).unwrap();
    assert!(a.agent_detected);
    assert_eq!(a.package_type, "agent");
    // 官方 bundle 的 core package.json 声明了 MIT —— 许可检测诚实通过
    assert_eq!(a.license.as_deref(), Some("MIT"));
    assert!(!a.license_missing);
    assert_eq!(a.forge_compatibility, "full");
    assert_eq!(a.language.as_deref(), Some("markdown"));
    assert!(a.scan.files > 0);
}
