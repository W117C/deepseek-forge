//! Manifest loading, validation, and legacy 'agenthub.dev/agent/v1' normalization.

use std::collections::BTreeMap;
use std::path::Path;

use crate::errors::ForgeError;
use crate::model::*;

/// The authoritative schema identifier for a Forge package manifest.
pub const SCHEMA_V1: &str = "forge.package.v1";

/// The legacy schema identifier accepted for normalization.
pub const LEGACY_SCHEMA: &str = "agenthub.dev/agent/v1";

/// Parse and validate a 'forge.package.v1' JSON manifest.
pub fn parse_package_json(text: &str) -> Result<Package, ForgeError> {
    let value: serde_json::Value = serde_json::from_str(text)?;

    let schema = value.get("schema").and_then(|s| s.as_str()).unwrap_or("");
    if schema != SCHEMA_V1 {
        return Err(ForgeError::InvalidSchema(format!(
            "expected schema '{}' but found '{}'",
            SCHEMA_V1,
            if schema.is_empty() {
                "<missing>"
            } else {
                schema
            }
        )));
    }

    for field in ["id", "name", "type", "version"] {
        if value.get(field).is_none() {
            return Err(ForgeError::InvalidManifest(format!(
                "missing required field '{}'",
                field
            )));
        }
    }

    let package: Package = serde_json::from_value(value)
        .map_err(|e| ForgeError::InvalidManifest(format!("invalid manifest: {}", e)))?;

    validate_version(&package.version)?;
    Ok(package)
}

fn validate_version(version: &str) -> Result<(), ForgeError> {
    let stripped = version.strip_prefix('v').unwrap_or(version);
    semver::Version::parse(stripped).map_err(|_| {
        ForgeError::InvalidManifest(format!("version '{}' is not valid SemVer", version))
    })?;
    Ok(())
}

/// Load a package from a file path, dispatching on the file extension.
pub fn load_package_file(path: &Path) -> Result<Package, ForgeError> {
    let text = std::fs::read_to_string(path)?;
    match path.extension().and_then(|e| e.to_str()) {
        Some("json") => parse_package_json(&text),
        Some("yaml") | Some("yml") => normalize_legacy_agent(&text),
        _ => Err(ForgeError::InvalidManifest(format!(
            "unsupported manifest extension for '{}' (expected .json, .yaml, or .yml)",
            path.display()
        ))),
    }
}

/// Load a legacy agent directory by reading its 'agenthub.yaml'.
pub fn load_legacy_agent_dir(dir: &Path) -> Result<Package, ForgeError> {
    let manifest = dir.join("agenthub.yaml");
    let text = std::fs::read_to_string(&manifest)?;
    normalize_legacy_agent(&text)
}

/// Normalize a legacy 'agenthub.dev/agent/v1' YAML manifest into a 'forge.package.v1' model.
pub fn normalize_legacy_agent(yaml_text: &str) -> Result<Package, ForgeError> {
    let root: serde_yaml::Value = serde_yaml::from_str(yaml_text)?;

    let schema = root.get("schema").and_then(|s| s.as_str()).unwrap_or("");
    if schema != LEGACY_SCHEMA {
        return Err(ForgeError::InvalidSchema(format!(
            "expected legacy schema '{}' but found '{}'",
            LEGACY_SCHEMA,
            if schema.is_empty() {
                "<missing>"
            } else {
                schema
            }
        )));
    }

    let id = yaml_str(&root, "id")
        .ok_or_else(|| ForgeError::InvalidManifest("missing required field 'id'".to_string()))?;
    let name = yaml_str(&root, "name")
        .ok_or_else(|| ForgeError::InvalidManifest("missing required field 'name'".to_string()))?;
    let version = yaml_str(&root, "version").ok_or_else(|| {
        ForgeError::InvalidManifest("missing required field 'version'".to_string())
    })?;

    // publisher
    let publisher = root.get("publisher");
    let publisher_id = publisher
        .and_then(|p| p.get("id"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let publisher_name = publisher
        .and_then(|p| p.get("name"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    // compatibility
    let compatibility = root.get("compatibility");
    let dsh = compatibility.and_then(|c| c.get("dsh"));
    let dsh_min = dsh
        .and_then(|d| d.get("min"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());
    let dsh_tested = dsh.map(|d| yaml_str_list(d, "tested")).unwrap_or_default();
    let node = compatibility
        .and_then(|c| c.get("node"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());
    let platform = yaml_str_list(&root, "platform");

    // permissions + capabilities
    let permissions = root.get("permissions");
    let network = permissions
        .map(|p| yaml_str_list(p, "network"))
        .unwrap_or_default();
    let env = permissions
        .map(|p| yaml_str_list(p, "env"))
        .unwrap_or_default();
    let mut capabilities: Vec<String> = Vec::new();
    if !network.is_empty() {
        capabilities.push("network.http".to_string());
    }
    if !env.is_empty() {
        capabilities.push("environment.read".to_string());
    }

    // profile
    let profile = root.get("profile");
    let profile_name = profile
        .and_then(|p| p.get("name"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let profile_bundles = profile
        .map(|p| yaml_str_list(p, "bundles"))
        .unwrap_or_default();
    let profile_patch = profile
        .and_then(|p| p.get("patch"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    // components
    let components = root.get("components");
    let component_bundles = yaml_bundles(components);
    let component_presets = yaml_presets(components);
    let component_skills = components
        .map(|c| yaml_str_list(c, "skills"))
        .unwrap_or_default();

    // dependencies derive from component bundles
    let dependencies = component_bundles
        .iter()
        .map(|b| Dependency {
            package: b.package.clone(),
            version: b.version.clone(),
            required: true,
        })
        .collect();

    // health
    let health = root
        .get("health")
        .and_then(|h| h.as_sequence())
        .map(|seq| {
            seq.iter()
                .map(|entry| HealthCheck {
                    kind: entry
                        .get("kind")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string(),
                    expect_rows: yaml_str_list(entry, "expect-rows"),
                })
                .collect()
        })
        .unwrap_or_default();

    // Everything not mapped onto a known field is preserved losslessly in 'extra'.
    let extra = yaml_extra(&root);

    Ok(Package {
        id: id.clone(),
        name,
        r#type: PackageType::Agent,
        version: version.clone(),
        description: yaml_str(&root, "description").unwrap_or_default(),
        category: yaml_str(&root, "category").unwrap_or_default(),
        tags: Vec::new(),
        publisher: Publisher {
            id: publisher_id.clone(),
            name: publisher_name,
        },
        source: Source {
            r#type: SourceType::Forge,
            repository: Some("https://github.com/W117C/deepseek-forge".to_string()),
            ref_: None,
            commit: None,
        },
        upstream: Upstream {
            repository: None,
            author: None,
            license: None,
            version: None,
            url: None,
            adapter_version: None,
        },
        license: License {
            spdx: "NOASSERTION".to_string(),
            file: None,
        },
        compatibility: Compatibility {
            forge: None,
            dsh: DshCompat {
                min: dsh_min,
                tested: dsh_tested,
            },
            node,
            platform,
        },
        capabilities,
        permissions: Permissions { network, env },
        security: Security {
            scan: ScanRequirement::Required,
            status: SecurityStatus::Unknown,
            scanned_at: None,
            findings: Vec::new(),
        },
        artifact: Artifact {
            filename: format!("{}-{}.tar.gz", id, version),
            sha256: None,
            signature: None,
            signature_algorithm: Some("ed25519".to_string()),
            publisher_key_id: Some(publisher_id),
        },
        entrypoint: Entrypoint {
            r#type: EntrypointType::HarnessProfile,
            profile: Some(profile_name.clone()),
            command: None,
            config: serde_json::Map::new(),
        },
        dependencies,
        runtime: Runtime {
            engine: "deepseek-harness".to_string(),
            profile: RuntimeProfile {
                name: profile_name,
                bundles: profile_bundles,
                patch: profile_patch,
            },
            components: Components {
                bundles: component_bundles,
                presets: component_presets,
                skills: component_skills,
            },
            health,
        },
        created_at: None,
        updated_at: None,
        extra,
    })
}

// ---- helpers ----

fn yaml_str(value: &serde_yaml::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|s| s.as_str())
        .map(|s| s.to_string())
}

fn yaml_str_list(value: &serde_yaml::Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|s| s.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn yaml_bundles(components: Option<&serde_yaml::Value>) -> Vec<ComponentBundle> {
    components
        .and_then(|c| c.get("bundles"))
        .and_then(|b| b.as_sequence())
        .map(|seq| {
            seq.iter()
                .map(|b| ComponentBundle {
                    package: b
                        .get("package")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string(),
                    version: b
                        .get("version")
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn yaml_presets(components: Option<&serde_yaml::Value>) -> Vec<ComponentPreset> {
    components
        .and_then(|c| c.get("presets"))
        .and_then(|p| p.as_sequence())
        .map(|seq| {
            seq.iter()
                .map(|p| ComponentPreset {
                    id: p
                        .get("id")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string(),
                    base: p
                        .get("base")
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn yaml_extra(root: &serde_yaml::Value) -> BTreeMap<String, serde_json::Value> {
    // Top-level keys that are mapped onto known Package fields. The legacy string
    // 'runtime' field is captured by 'runtime.engine', so it is not duplicated here
    // (a duplicate 'runtime' key would collide with the typed Runtime struct).
    const MAPPED: &[&str] = &[
        "id",
        "name",
        "category",
        "version",
        "description",
        "publisher",
        "compatibility",
        "platform",
        "components",
        "profile",
        "permissions",
        "health",
        "runtime",
    ];

    let mut extra = BTreeMap::new();
    if let Some(mapping) = root.as_mapping() {
        for (key, value) in mapping {
            if let Some(key) = key.as_str() {
                if !MAPPED.contains(&key) {
                    if let Ok(json) = serde_json::to_value(value) {
                        extra.insert(key.to_string(), json);
                    }
                }
            }
        }
    }
    extra
}
