//! Unified Package model for DeepSeek Forge (target-state §5).
//!
//! A single typed [Package] represents all seven package kinds. Unknown or
//! legacy fields are retained losslessly in [Package::extra] via
//! `#[serde(flatten)]`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The seven package types of the Forge platform.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackageType {
    Agent,
    Skill,
    Tool,
    Mcp,
    Plugin,
    Workflow,
    Bundle,
}

/// Where a package originates from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SourceType {
    Github,
    Forge,
    Local,
}

/// Whether a security scan is required before install.
/// "completed" = the scan already ran at curation/import time and its
/// verdict is recorded in the same security block (ecosystem manifests).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScanRequirement {
    Required,
    Optional,
    Completed,
}

/// Result of a security scan.
/// Canonical form is SCREAMING_SNAKE_CASE; lowercase aliases accept the
/// ecosystem/curated-registry spelling ("pass", "warning", …).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SecurityStatus {
    #[serde(alias = "pass")]
    Pass,
    #[serde(alias = "warning")]
    Warning,
    #[serde(alias = "blocked")]
    Blocked,
    #[serde(alias = "unknown")]
    Unknown,
}

/// How a package is launched at runtime.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum EntrypointType {
    HarnessProfile,
    Process,
    McpServer,
    Workflow,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Publisher {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    #[serde(rename = "type")]
    pub r#type: SourceType,
    pub repository: Option<String>,
    #[serde(rename = "ref")]
    pub ref_: Option<String>,
    pub commit: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Upstream {
    pub repository: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub version: Option<String>,
    pub url: Option<String>,
    pub adapter_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub spdx: String,
    pub file: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DshCompat {
    pub min: Option<String>,
    #[serde(default)]
    pub tested: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    pub forge: Option<String>,
    pub dsh: DshCompat,
    pub node: Option<String>,
    #[serde(default)]
    pub platform: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    #[serde(default)]
    pub network: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub rule: String,
    pub level: String,
    pub label: String,
    pub count: u64,
    pub file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Security {
    pub scan: ScanRequirement,
    pub status: SecurityStatus,
    #[serde(rename = "scannedAt")]
    pub scanned_at: Option<String>,
    #[serde(default)]
    pub findings: Vec<Finding>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub filename: String,
    pub sha256: Option<String>,
    pub signature: Option<String>,
    #[serde(rename = "signatureAlgorithm")]
    pub signature_algorithm: Option<String>,
    #[serde(rename = "publisherKeyId")]
    pub publisher_key_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entrypoint {
    #[serde(rename = "type")]
    pub r#type: EntrypointType,
    pub profile: Option<String>,
    pub command: Option<String>,
    #[serde(default)]
    pub config: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub package: String,
    pub version: Option<String>,
    #[serde(default = "default_true")]
    pub required: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProfile {
    pub name: String,
    #[serde(default)]
    pub bundles: Vec<String>,
    pub patch: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentBundle {
    pub package: String,
    pub version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentPreset {
    pub id: String,
    pub base: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Components {
    #[serde(default)]
    pub bundles: Vec<ComponentBundle>,
    #[serde(default)]
    pub presets: Vec<ComponentPreset>,
    #[serde(default)]
    pub skills: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub kind: String,
    #[serde(rename = "expect-rows", default)]
    pub expect_rows: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Runtime {
    pub engine: String,
    pub profile: RuntimeProfile,
    pub components: Components,
    #[serde(default)]
    pub health: Vec<HealthCheck>,
}

/// The unified package primitive.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: PackageType,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub publisher: Publisher,
    pub source: Source,
    pub upstream: Upstream,
    pub license: License,
    pub compatibility: Compatibility,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub permissions: Permissions,
    pub security: Security,
    pub artifact: Artifact,
    pub entrypoint: Entrypoint,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    pub runtime: Runtime,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}
