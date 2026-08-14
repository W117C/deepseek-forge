//! Tauri 2 desktop shell for DeepSeek Forge (Phase 2).
//!
//! A thin IPC layer over the Forge Core (`crates/forge-core`). Commands are
//! read-only in this phase; the event bus is managed here so later
//! install/runtime phases can publish events without a second wiring pass.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use forge_core::errors::{ErrorEnvelope, ForgeError};
use forge_core::events::EventBus;
use forge_core::adapter::propose;
use forge_core::import::analyze_source;
use forge_core::registry::{LocalRegistry, RegistryProvider};
use serde::Serialize;

/// Shared state managed by Tauri. The bus is wired now for later
/// install/runtime events; no event commands exist in this phase.
pub struct ForgeState {
    pub bus: EventBus,
}

/// IPC-safe system status payload (serde camelCase).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub core_version: String,
    pub registry_path: String,
    pub registry_available: bool,
    pub registry_name: Option<String>,
    pub dsh_detected: bool,
}

/// Resolve the local registry root. `FORGE_REGISTRY` wins when set and
/// non-empty; otherwise `$HOME/.deepseek-forge/registry`. Pure helper so tests
/// can exercise it without touching the real environment.
fn registry_root_from(env_home: Option<&OsStr>, env_override: Option<&OsStr>) -> PathBuf {
    if let Some(override_path) = env_override {
        let p = PathBuf::from(override_path);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    match env_home {
        Some(home) => PathBuf::from(home).join(".deepseek-forge").join("registry"),
        None => PathBuf::from(".deepseek-forge").join("registry"),
    }
}

/// Detect the DeepSeek Harness CLI (`dsh`). A non-empty `AGENTHUB_DSH_BIN`
/// pointing at an existing file wins; otherwise fall back to whether
/// `which dsh` succeeded. Pure helper.
fn dsh_bin_from(env_override: Option<&OsStr>, which_succeeded: bool) -> bool {
    if let Some(bin) = env_override {
        if Path::new(bin).is_file() {
            return true;
        }
    }
    which_succeeded
}

fn registry() -> LocalRegistry {
    LocalRegistry::open(registry_root_from(
        std::env::var_os("HOME").as_deref(),
        std::env::var_os("FORGE_REGISTRY").as_deref(),
    ))
}

fn which_dsh_succeeded() -> bool {
    std::process::Command::new("which")
        .arg("dsh")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Serialize a [ForgeError] into the IPC error string (a [ErrorEnvelope]).
fn to_ipc_error(err: ForgeError) -> String {
    serde_json::to_string(&ErrorEnvelope::from(err))
        .expect("serializing an all-String envelope cannot fail")
}

#[tauri::command]
fn system_status() -> Result<SystemStatus, String> {
    let registry = registry();
    let root = registry.root().to_path_buf();
    let metadata = registry.get_registry().ok();

    Ok(SystemStatus {
        core_version: env!("CARGO_PKG_VERSION").to_string(),
        registry_path: root.to_string_lossy().to_string(),
        registry_available: metadata.is_some(),
        registry_name: metadata.map(|m| m.name),
        dsh_detected: dsh_bin_from(
            std::env::var_os("AGENTHUB_DSH_BIN").as_deref(),
            which_dsh_succeeded(),
        ),
    })
}

#[tauri::command]
fn registry_list() -> Result<Vec<forge_core::registry::PackageSummary>, String> {
    registry().list_packages().map_err(to_ipc_error)
}

#[tauri::command]
fn registry_info(id: String) -> Result<forge_core::model::Package, String> {
    registry().get_package(&id).map_err(to_ipc_error)
}

#[tauri::command]
fn registry_versions(id: String) -> Result<Vec<String>, String> {
    registry().get_versions(&id).map_err(to_ipc_error)
}

#[tauri::command]
fn registry_get_version(
    id: String,
    version: String,
) -> Result<forge_core::registry::PackageVersion, String> {
    registry().get_version(&id, &version).map_err(to_ipc_error)
}

/// Phase 4: analyze a local directory or a github URL (Local-first).
#[tauri::command]
fn import_analyze(source: String) -> Result<forge_core::import::RepositoryAnalysis, String> {
    analyze_source(&source).map_err(to_ipc_error)
}

/// Phase 5: rule-based adapter proposal (human gate; never executes anything).
#[tauri::command]
fn adapter_propose(source: String) -> Result<forge_core::adapter::AdapterProposal, String> {
    let analysis = analyze_source(&source).map_err(to_ipc_error)?;
    propose(&analysis).map_err(to_ipc_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bus = EventBus::new();

    tauri::Builder::default()
        .manage(ForgeState { bus })
        .invoke_handler(tauri::generate_handler![
            system_status,
            registry_list,
            registry_info,
            registry_versions,
            registry_get_version,
            import_analyze,
            adapter_propose
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn registry_root_uses_override_when_set() {
        assert_eq!(
            registry_root_from(
                Some(OsStr::new("/home/test")),
                Some(OsStr::new("/custom/registry"))
            ),
            PathBuf::from("/custom/registry")
        );
    }

    #[test]
    fn registry_root_ignores_empty_override() {
        assert_eq!(
            registry_root_from(Some(OsStr::new("/home/test")), Some(OsStr::new(""))),
            PathBuf::from("/home/test/.deepseek-forge/registry")
        );
    }

    #[test]
    fn registry_root_uses_home_by_default() {
        assert_eq!(
            registry_root_from(Some(OsStr::new("/home/test")), None),
            PathBuf::from("/home/test/.deepseek-forge/registry")
        );
    }

    #[test]
    fn registry_root_falls_back_when_no_home() {
        assert_eq!(
            registry_root_from(None, None),
            PathBuf::from(".deepseek-forge/registry")
        );
    }

    #[test]
    fn dsh_detected_via_env_override_file() {
        // The current test executable is a real file on disk, so it serves as a
        // deterministic "existing file" without touching the environment.
        let existing = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("/"));
        assert!(dsh_bin_from(Some(existing.as_os_str()), false));
    }

    #[test]
    fn dsh_not_detected_without_override_or_which() {
        assert!(!dsh_bin_from(None, false));
    }

    #[test]
    fn dsh_detected_via_which() {
        assert!(dsh_bin_from(None, true));
    }

    #[test]
    fn dsh_override_ignored_when_missing() {
        assert!(!dsh_bin_from(
            Some(OsStr::new("/definitely/not/a/real/dsh-binary")),
            false
        ));
    }
}
