//! Typed errors (target-state §21): code + human message + technical detail + recovery.

use serde::{Deserialize, Serialize};

/// Every Forge error, each with a stable machine-readable [code](ForgeError::code),
/// a human message (the `Display` impl), technical detail, and a recovery suggestion.
#[derive(Debug, thiserror::Error)]
pub enum ForgeError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("package '{0}' was not found")]
    PackageNotFound(String),

    #[error("version '{version}' was not found for package '{package}'")]
    VersionNotFound { package: String, version: String },

    #[error("registry is unavailable: {0}")]
    RegistryUnavailable(String),

    #[error("invalid manifest: {0}")]
    InvalidManifest(String),

    #[error("invalid schema: {0}")]
    InvalidSchema(String),

    #[error("license is missing: {0}")]
    LicenseMissing(String),

    #[error("artifact hash mismatch: expected {expected}, got {actual}")]
    HashMismatch { expected: String, actual: String },

    #[error("signature is invalid: {0}")]
    SignatureInvalid(String),

    #[error("publisher is not trusted: {0}")]
    PublisherUntrusted(String),

    #[error("security scan blocked install: {0}")]
    SecurityBlocked(String),

    #[error("incompatible version: {0}")]
    IncompatibleVersion(String),

    #[error("artifact not found: {0}")]
    ArtifactNotFound(String),

    #[error("install dependency is missing: {0}")]
    InstallDependencyMissing(String),

    #[error("runtime failed: {0}")]
    RuntimeFailed(String),
}

impl ForgeError {
    /// Stable, machine-readable error code.
    pub fn code(&self) -> &'static str {
        match self {
            ForgeError::PackageNotFound(_) => "PACKAGE_NOT_FOUND",
            ForgeError::VersionNotFound { .. } => "VERSION_NOT_FOUND",
            ForgeError::RegistryUnavailable(_) => "REGISTRY_UNAVAILABLE",
            ForgeError::InvalidManifest(_) => "INVALID_MANIFEST",
            ForgeError::InvalidSchema(_) => "INVALID_SCHEMA",
            ForgeError::HashMismatch { .. } => "HASH_MISMATCH",
            ForgeError::SignatureInvalid(_) => "SIGNATURE_INVALID",
            ForgeError::PublisherUntrusted(_) => "PUBLISHER_UNTRUSTED",
            ForgeError::SecurityBlocked(_) => "SECURITY_BLOCKED",
            ForgeError::IncompatibleVersion(_) => "INCOMPATIBLE_VERSION",
            ForgeError::ArtifactNotFound(_) => "ARTIFACT_NOT_FOUND",
            ForgeError::InstallDependencyMissing(_) => "INSTALL_DEPENDENCY_MISSING",
            ForgeError::RuntimeFailed(_) => "RUNTIME_FAILED",
            ForgeError::LicenseMissing(_) => "LICENSE_MISSING",
            ForgeError::Io(_) => "IO",
            ForgeError::Json(_) | ForgeError::Yaml(_) => "PARSE",
        }
    }

    /// Technical detail (the `thiserror` Display text).
    pub fn technical(&self) -> String {
        self.to_string()
    }

    /// A concrete, actionable recovery suggestion.
    pub fn recovery(&self) -> String {
        match self {
            ForgeError::PackageNotFound(id) => format!(
                "check the package id spelling, or run 'forge-core registry list' to list available packages (looked for '{}')",
                id
            ),
            ForgeError::VersionNotFound { package, version } => format!(
                "run 'forge-core registry info {}' to list available versions; '{}' was not found",
                package, version
            ),
            ForgeError::RegistryUnavailable(_) => {
                "point --registry at an initialized registry directory, or run 'forge-core registry init' to create one".to_string()
            }
            ForgeError::InvalidManifest(_) => {
                "fix the manifest fields and re-run 'forge-core package validate'".to_string()
            }
            ForgeError::InvalidSchema(_) => {
                "use schema 'forge.package.v1' for JSON manifests or 'agenthub.dev/agent/v1' for legacy agents".to_string()
            }
            ForgeError::LicenseMissing(_) => {
                "add a LICENSE file or an SPDX license identifier before importing".to_string()
            }
            ForgeError::HashMismatch { .. } => {
                "re-download the artifact and verify against the publisher's published checksum".to_string()
            }
            ForgeError::SignatureInvalid(_) => {
                "re-download the artifact; if it persists, contact the publisher".to_string()
            }
            ForgeError::PublisherUntrusted(_) => {
                "review the publisher's trust status in System > Security before installing".to_string()
            }
            ForgeError::SecurityBlocked(_) => {
                "review the security findings and resolve blocking issues before installing".to_string()
            }
            ForgeError::IncompatibleVersion(_) => {
                "upgrade or downgrade the conflicting dependency to a compatible version".to_string()
            }
            ForgeError::ArtifactNotFound(_) => {
                "re-publish or re-import the package so its artifact is available".to_string()
            }
            ForgeError::InstallDependencyMissing(_) => {
                "install the missing dependency (e.g. Node.js) and retry".to_string()
            }
            ForgeError::RuntimeFailed(_) => {
                "check the runtime logs and restart the session".to_string()
            }
            ForgeError::Io(_) => {
                "check filesystem permissions and that the path exists".to_string()
            }
            ForgeError::Json(_) | ForgeError::Yaml(_) => {
                "fix the syntax of the manifest file and retry".to_string()
            }
        }
    }
}

/// IPC-safe error shape.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ErrorEnvelope {
    pub code: String,
    pub human: String,
    pub technical: String,
    pub recovery: String,
}

impl From<ForgeError> for ErrorEnvelope {
    fn from(err: ForgeError) -> Self {
        ErrorEnvelope {
            code: err.code().to_string(),
            human: err.to_string(),
            technical: err.technical(),
            recovery: err.recovery(),
        }
    }
}
