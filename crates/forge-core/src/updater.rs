//! Increment ③: update check —— installed state versions vs local registry.

use std::path::Path;

use serde::Serialize;

use crate::errors::ForgeError;
use crate::registry::{LocalRegistry, RegistryProvider};
use crate::state::load_state;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntry {
    pub id: String,
    pub installed: String,
    pub latest: String,
    pub outdated: bool,
}

/// Compare installed agents (shared DSH state) against the local registry.
/// Non-semver or unlisted packages are reported with outdated=false but kept
/// visible (honest listing, no fabricated versions).
pub fn check_updates(
    home: &Path,
    registry: &LocalRegistry,
) -> Result<Vec<UpdateEntry>, ForgeError> {
    let state = load_state(home);
    let agents = state
        .get("agents")
        .and_then(|a| a.as_object())
        .cloned()
        .unwrap_or_default();
    let mut entries = Vec::new();
    for (id, rec) in agents {
        let installed = rec
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let latest = registry
            .get_package(&id)
            .map(|p| p.version.clone())
            .unwrap_or_default();
        let outdated = semver_lt(&installed, &latest);
        entries.push(UpdateEntry {
            id,
            installed,
            latest,
            outdated,
        });
    }
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(entries)
}

/// 宽松 semver 比较：两边都可解析才比较，否则视为无更新（诚实，不臆造版本序）。
pub fn semver_lt(a: &str, b: &str) -> bool {
    let pa = semver::Version::parse(a.trim_start_matches('v'));
    let pb = semver::Version::parse(b.trim_start_matches('v'));
    match (pa, pb) {
        (Ok(pa), Ok(pb)) => pa < pb,
        _ => false,
    }
}
