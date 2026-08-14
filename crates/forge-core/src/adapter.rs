//! Phase 5: rule-based Adapter generator with a mandatory human gate.
//!
//! No AI is faked: when no model provider is configured the generator runs in
//! deterministic "rules" mode and every proposal is explicitly marked as such.
//! High-risk or license-less repositories are refused before generation
//! (Principle 5 / §39-9).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::errors::ForgeError;
use crate::import::RepositoryAnalysis;
use crate::snapshot::iso_utc_colon;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdapterProposal {
    pub package_type: String,
    pub risk: String,
    pub generator: String, // "rules" —— 无 AI 供应商时明示规则型生成
    pub requires_human_review: bool,
    pub manifest: serde_json::Value,
}

fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() {
        "imported-package".to_string()
    } else {
        out
    }
}

/// Build a forge.package.v1 manifest proposal from a repository analysis.
pub fn propose(analysis: &RepositoryAnalysis) -> Result<AdapterProposal, ForgeError> {
    if analysis.license_missing {
        return Err(ForgeError::SecurityBlocked(
            "拒绝生成 Adapter：仓库无许可证。按 Principle 5，Forge 不打包无明确许可证的代码。"
                .to_string(),
        ));
    }

    let id = analysis
        .repo
        .clone()
        .map(|r| slugify(&r))
        .unwrap_or_else(|| slugify(&analysis.source.rsplit('/').next().unwrap_or("imported")));
    let name = analysis.repo.clone().unwrap_or_else(|| id.clone());

    let mut capabilities: Vec<String> = Vec::new();
    if !analysis.network_usage.is_empty() {
        capabilities.push("network.http".to_string());
    }
    if !analysis.filesystem_usage.is_empty() {
        capabilities.push("filesystem.write".to_string());
    }
    if !analysis.env_vars.is_empty() {
        capabilities.push("environment.read".to_string());
    }
    if !analysis.dangerous_commands.is_empty() {
        capabilities.push("shell.execute".to_string());
    }

    let scan_status = match analysis.scan.verdict.as_str() {
        "block" => "BLOCKED",
        "warn" => "WARNING",
        _ => "PASS",
    };

    let requires_human_review = analysis.security_risk != "low"
        || !analysis.dangerous_commands.is_empty()
        || capabilities.contains(&"shell.execute".to_string());

    let artifact_filename = format!("{id}-0.1.0.tar.gz");
    let manifest = serde_json::json!({
        "schema": "forge.package.v1",
        "id": &id,
        "name": &name,
        "type": analysis.package_type,
        "version": "0.1.0",
        "description": format!("{name} —— 由规则型 Adapter 生成器生成（待人工补充描述）"),
        "category": "",
        "tags": [],
        "publisher": { "id": "upstream", "name": null },
        "source": {
            "type": if analysis.owner.is_some() { "github" } else { "local" },
            "repository": analysis.source,
            "ref": null,
            "commit": null
        },
        "upstream": {
            "repository": analysis.source,
            "author": analysis.owner,
            "license": analysis.license,
            "version": null,
            "url": analysis.source,
            "adapterVersion": "0.1.0"
        },
        "license": { "spdx": analysis.license, "file": null },
        "compatibility": {
            "forge": ">=0.4.0",
            "dsh": { "min": null, "tested": [] },
            "node": null,
            "platform": []
        },
        "capabilities": capabilities,
        "permissions": { "network": [], "env": [] },
        "security": {
            "scan": "required",
            "status": scan_status,
            "scannedAt": iso_utc_colon(),
            "findings": analysis.scan.findings
        },
        "artifact": {
            "filename": artifact_filename,
            "sha256": null,
            "signature": null,
            "signatureAlgorithm": "ed25519",
            "publisherKeyId": "upstream"
        },
        "entrypoint": {
            "type": if analysis.package_type == "agent" { "harness-profile" } else { "process" },
            "profile": null,
            "command": analysis.entry_point,
            "config": {}
        },
        "dependencies": [],
        "runtime": {
            "engine": if analysis.package_type == "agent" { "deepseek-harness" } else { "external" },
            "profile": { "name": &id, "bundles": [], "patch": null },
            "components": { "bundles": [], "presets": [], "skills": [] },
            "health": []
        }
    });

    Ok(AdapterProposal {
        package_type: analysis.package_type.clone(),
        risk: analysis.security_risk.clone(),
        generator: "rules".to_string(),
        requires_human_review,
        manifest,
    })
}

/// Write the proposal as a forge.manifest.json plus an adapter/ skeleton.
/// The skeleton is honest: install/configure/healthcheck are stubs for the
/// human to fill after review — nothing is executed automatically.
pub fn generate(analysis: &RepositoryAnalysis, out_dir: &Path) -> Result<PathBuf, ForgeError> {
    let proposal = propose(analysis)?;
    let id = proposal
        .manifest
        .get("id")
        .and_then(|i| i.as_str())
        .unwrap_or("imported-package");
    let pkg_dir = out_dir.join(id);
    fs::create_dir_all(pkg_dir.join("adapter")).map_err(ForgeError::Io)?;

    let manifest_text =
        serde_json::to_string_pretty(&proposal.manifest).map_err(ForgeError::Json)?;
    fs::write(
        pkg_dir.join("forge.manifest.json"),
        format!(
            "{manifest_text}
"
        ),
    )
    .map_err(ForgeError::Io)?;

    let adapter_manifest = serde_json::json!({
        "adapterVersion": "0.1.0",
        "upstream": analysis.source,
        "packageType": analysis.package_type,
        "generator": "rules",
        "requiresHumanReview": proposal.requires_human_review,
        "note": "规则型生成器（非 AI）产出。install/configure/healthcheck/uninstall/runtime 为待人工补充的骨架，禁止未审阅即执行。"
    });
    fs::write(
        pkg_dir.join("adapter/manifest.json"),
        serde_json::to_string_pretty(&adapter_manifest).map_err(ForgeError::Json)?
            + "
",
    )
    .map_err(ForgeError::Io)?;

    for file in [
        "install.md",
        "configure.md",
        "healthcheck.md",
        "uninstall.md",
        "runtime.md",
    ] {
        fs::write(
            pkg_dir.join("adapter").join(file),
            format!(
                "# {file}（骨架，待人工审阅后补充）

上游：{}
",
                analysis.source
            ),
        )
        .map_err(ForgeError::Io)?;
    }

    Ok(pkg_dir)
}
