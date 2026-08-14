//! Local-first registry (target-state §8).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::ForgeError;
use crate::manifest::parse_package_json;
use crate::model::{Finding, Package, PackageType, SecurityStatus};

/// Top-level 'registry.json' metadata.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RegistryMetadata {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "trustPolicy")]
    pub trust_policy: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackageSummary {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: PackageType,
    #[serde(rename = "versionLatest")]
    pub version_latest: String,
    pub description: String,
    /// 收录条目携带的真实 stars（extra.stars）；官方/本地包为 None
    #[serde(default)]
    pub stars: Option<u64>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactMeta {
    pub sha256: Option<String>,
    pub signature: Option<String>,
    pub filename: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecurityMeta {
    pub status: SecurityStatus,
    #[serde(rename = "scannedAt")]
    pub scanned_at: Option<String>,
    #[serde(default)]
    pub findings: Vec<Finding>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackageVersion {
    pub package: Package,
    pub artifact: Option<ArtifactMeta>,
    pub security: Option<SecurityMeta>,
    pub compatibility: Option<serde_json::Value>,
}

/// Read-only access to a package registry.
pub trait RegistryProvider {
    fn get_registry(&self) -> Result<RegistryMetadata, ForgeError>;
    fn list_packages(&self) -> Result<Vec<PackageSummary>, ForgeError>;
    fn get_package(&self, id: &str) -> Result<Package, ForgeError>;
    fn get_versions(&self, id: &str) -> Result<Vec<String>, ForgeError>;
    fn get_version(&self, id: &str, version: &str) -> Result<PackageVersion, ForgeError>;
}

/// A plain-directory registry:
/// 'root/registry.json', 'root/packages/ID/package.json',
/// 'root/packages/ID/versions/SEMVER/{manifest,artifact,security,compatibility}.json'.
#[derive(Clone, Debug)]
pub struct LocalRegistry {
    root: PathBuf,
}

impl LocalRegistry {
    /// Open a registry root. The directory is not required to exist yet.
    pub fn open(root: impl Into<PathBuf>) -> Self {
        LocalRegistry { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn package_dir(&self, id: &str) -> PathBuf {
        self.root.join("packages").join(id)
    }

    fn read_package_file(&self, id: &str) -> Result<Package, ForgeError> {
        let path = self.package_dir(id).join("package.json");
        let text = std::fs::read_to_string(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ForgeError::PackageNotFound(id.to_string())
            } else {
                ForgeError::Io(e)
            }
        })?;
        parse_package_json(&text)
    }
}

impl RegistryProvider for LocalRegistry {
    fn get_registry(&self) -> Result<RegistryMetadata, ForgeError> {
        let path = self.root.join("registry.json");
        let text = std::fs::read_to_string(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ForgeError::RegistryUnavailable(format!(
                    "registry.json not found at '{}'",
                    path.display()
                ))
            } else {
                ForgeError::Io(e)
            }
        })?;
        let metadata: RegistryMetadata = serde_json::from_str(&text)?;
        if metadata.schema_version != 1 {
            return Err(ForgeError::InvalidSchema(format!(
                "registry schemaVersion {} is not supported (expected 1)",
                metadata.schema_version
            )));
        }
        Ok(metadata)
    }

    fn list_packages(&self) -> Result<Vec<PackageSummary>, ForgeError> {
        let packages_dir = self.root.join("packages");
        let entries = match std::fs::read_dir(&packages_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(ForgeError::Io(e)),
        };

        let mut summaries = Vec::new();
        for entry in entries {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            let package = self.read_package_file(&id)?;
            summaries.push(PackageSummary {
                id: package.id.clone(),
                name: package.name.clone(),
                r#type: package.r#type.clone(),
                version_latest: package.version.clone(),
                description: package.description.clone(),
                stars: package.extra.get("stars").and_then(|s| s.as_u64()),
                category: Some(package.category.clone()).filter(|c| !c.is_empty()),
                license: Some(package.license.spdx.clone()),
            });
        }
        summaries.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(summaries)
    }

    fn get_package(&self, id: &str) -> Result<Package, ForgeError> {
        self.read_package_file(id)
    }

    fn get_versions(&self, id: &str) -> Result<Vec<String>, ForgeError> {
        let package_dir = self.package_dir(id);
        if !package_dir.exists() {
            return Err(ForgeError::PackageNotFound(id.to_string()));
        }
        let versions_dir = package_dir.join("versions");
        let entries = match std::fs::read_dir(&versions_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(ForgeError::Io(e)),
        };

        let mut versions: Vec<(semver::Version, String)> = Vec::new();
        for entry in entries {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let stripped = name.strip_prefix('v').unwrap_or(&name);
            let parsed = semver::Version::parse(stripped).map_err(|_| {
                ForgeError::InvalidManifest(format!(
                    "invalid version string '{}' in package '{}'",
                    name, id
                ))
            })?;
            versions.push((parsed, name));
        }
        versions.sort_by(|a, b| b.0.cmp(&a.0));
        Ok(versions.into_iter().map(|(_, name)| name).collect())
    }

    fn get_version(&self, id: &str, version: &str) -> Result<PackageVersion, ForgeError> {
        let package_dir = self.package_dir(id);
        if !package_dir.exists() {
            return Err(ForgeError::PackageNotFound(id.to_string()));
        }
        let version_dir = package_dir.join("versions").join(version);
        if !version_dir.exists() {
            return Err(ForgeError::VersionNotFound {
                package: id.to_string(),
                version: version.to_string(),
            });
        }

        let manifest_path = version_dir.join("manifest.json");
        let manifest_text = std::fs::read_to_string(&manifest_path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ForgeError::VersionNotFound {
                    package: id.to_string(),
                    version: version.to_string(),
                }
            } else {
                ForgeError::Io(e)
            }
        })?;
        let package = parse_package_json(&manifest_text)?;

        let artifact = read_optional_json(&version_dir.join("artifact.json"))?;
        let security = read_optional_json(&version_dir.join("security.json"))?;
        let compatibility = read_optional_json(&version_dir.join("compatibility.json"))?;

        Ok(PackageVersion {
            package,
            artifact,
            security,
            compatibility,
        })
    }
}

/// Missing file = None; present but malformed = loud [ForgeError] (never silent).
fn read_optional_json<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> Result<Option<T>, ForgeError> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(ForgeError::Io(e)),
    };
    match serde_json::from_str(&text) {
        Ok(value) => Ok(Some(value)),
        Err(e) => Err(ForgeError::InvalidManifest(format!(
            "malformed '{}': {}",
            path.display(),
            e
        ))),
    }
}
