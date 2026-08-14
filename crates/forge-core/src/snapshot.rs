//! Snapshot / restore, ported 1:1 from lib/installer.mjs snapshot()/restoreSnapshot().

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::dsh::{agenthub_store, preset_dir, profile_dir, skills_dir};
use crate::errors::ForgeError;
use crate::state::{load_state, save_state};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub ts: String,
    pub snap_dir: PathBuf,
}

/// JS `new Date().toISOString()` equivalent (colons/dots intact).
pub fn iso_utc_colon() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let days = (secs / 86400) as i64;
    let (y, m, d) = civil_from_days(days);
    let rem = secs % 86400;
    let hh = rem / 3600;
    let mm = (rem % 3600) / 60;
    let ss = rem % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{millis:03}Z")
}

/// JS `new Date().toISOString().replace(/[:.]/g,'-')` equivalent.
fn iso_ts() -> String {
    iso_utc_colon().replace([':', '.'], "-")
}

/// Howard Hinnant's civil-from-days algorithm (days since 1970-01-01).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn remove_any(p: &Path) -> Result<(), ForgeError> {
    match fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(p).map_err(ForgeError::Io),
        Ok(_) => fs::remove_file(p).map_err(ForgeError::Io),
        Err(_) => Ok(()),
    }
}

/// Dereferencing copy (Node `copyDeref`): symlinks are expanded to real
/// content; directories recursed.
fn copy_deref(src: &Path, dst: &Path) -> Result<(), ForgeError> {
    remove_any(dst)?;
    let meta = fs::metadata(src).map_err(ForgeError::Io)?; // follows symlinks
    if !meta.is_dir() {
        fs::copy(src, dst).map_err(ForgeError::Io)?;
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(ForgeError::Io)?;
    for entry in fs::read_dir(src).map_err(ForgeError::Io)? {
        let entry = entry.map_err(ForgeError::Io)?;
        copy_deref(&entry.path(), &dst.join(entry.file_name()))?;
    }
    Ok(())
}

/// Symlink-preserving recursive copy (Node `cpSync(src, dst, {recursive:true})`).
fn copy_dir(src: &Path, dst: &Path) -> Result<(), ForgeError> {
    let meta = fs::symlink_metadata(src).map_err(ForgeError::Io)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(src).map_err(ForgeError::Io)?;
        remove_any(dst)?;
        #[cfg(unix)]
        {
            return std::os::unix::fs::symlink(&target, dst).map_err(ForgeError::Io);
        }
        #[cfg(not(unix))]
        {
            let m = fs::metadata(&target).map_err(ForgeError::Io)?;
            if m.is_dir() {
                return copy_dir(&target, dst);
            }
            return fs::copy(&target, dst).map_err(ForgeError::Io);
        }
    }
    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(ForgeError::Io)?;
        for entry in fs::read_dir(src).map_err(ForgeError::Io)? {
            let entry = entry.map_err(ForgeError::Io)?;
            copy_dir(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else {
        fs::copy(src, dst).map_err(ForgeError::Io)?;
    }
    Ok(())
}

/// Create an install snapshot (Node `snapshot`).
pub fn snapshot(
    home: &Path,
    agent_id: &str,
    profile_name: &str,
    preset_ids: &[String],
    skill_names: &[String],
) -> Result<SnapshotInfo, ForgeError> {
    let store = agenthub_store(home);
    let ts = iso_ts();
    let snap_dir = store.join("snapshots").join(agent_id).join(&ts);
    fs::create_dir_all(&snap_dir).map_err(ForgeError::Io)?;
    let pdir = profile_dir(home, profile_name);
    if pdir.exists() {
        let prof = snap_dir.join("profile");
        fs::create_dir_all(&prof).map_err(ForgeError::Io)?;
        for f in [
            "package.json",
            "cordis.patch.yml",
            "pnpm-workspace.yaml",
            "cordis.yml",
        ] {
            let src = pdir.join(f);
            if src.exists() {
                fs::copy(&src, prof.join(f)).map_err(ForgeError::Io)?;
            }
        }
        if pdir.join("node_modules").exists() {
            fs::write(prof.join(".had-node-modules"), "1").map_err(ForgeError::Io)?;
        }
        let scope_profile = pdir.join("node_modules").join("@agenthub");
        if scope_profile.exists() {
            copy_deref(&scope_profile, &prof.join(".nm-scope-agenthub"))?;
        }
        if let Some(parent) = pdir.parent() {
            let scope_flat = parent.join("node_modules").join("@agenthub");
            if scope_flat.exists() {
                copy_deref(&scope_flat, &prof.join(".nm-flat-agenthub"))?;
            }
        }
    } else {
        fs::write(snap_dir.join(".profile-missing"), "1").map_err(ForgeError::Io)?;
    }
    for id in preset_ids {
        let src = preset_dir(home, id);
        if src.exists() {
            copy_dir(&src, &snap_dir.join(format!("preset-{id}")))?;
        }
    }
    for name in skill_names {
        let src = skills_dir(home, name);
        if src.exists() {
            copy_dir(&src, &snap_dir.join(format!("skill-{name}")))?;
        }
    }
    let state = load_state(home);
    if let Some(prior) = state.get("agents").and_then(|a| a.get(agent_id)) {
        let text = serde_json::to_string_pretty(prior).map_err(ForgeError::Json)?;
        fs::write(snap_dir.join("prior-state.json"), format!("{text}\n"))
            .map_err(ForgeError::Io)?;
    }
    Ok(SnapshotInfo { ts, snap_dir })
}

/// Restore a snapshot (Node `restoreSnapshot`).
pub fn restore_snapshot(
    home: &Path,
    agent_id: &str,
    ts: &str,
    profile_name: &str,
    preset_ids: &[String],
    skill_names: &[String],
) -> Result<(), ForgeError> {
    let snap_dir = agenthub_store(home)
        .join("snapshots")
        .join(agent_id)
        .join(ts);
    let pdir = profile_dir(home, profile_name);
    if snap_dir.join(".profile-missing").exists() {
        if pdir.exists() {
            fs::remove_dir_all(&pdir).map_err(ForgeError::Io)?;
        }
    } else {
        fs::create_dir_all(&pdir).map_err(ForgeError::Io)?;
        for f in [
            "package.json",
            "cordis.patch.yml",
            "pnpm-workspace.yaml",
            "cordis.yml",
        ] {
            let src = snap_dir.join("profile").join(f);
            if src.exists() {
                fs::copy(&src, pdir.join(f)).map_err(ForgeError::Io)?;
            } else {
                remove_any(&pdir.join(f))?;
            }
        }
        if !snap_dir.join("profile").join(".had-node-modules").exists() {
            remove_any(&pdir.join("node_modules"))?;
        }
        let scope_profile = pdir.join("node_modules").join("@agenthub");
        remove_any(&scope_profile)?;
        let s_scope = snap_dir.join("profile").join(".nm-scope-agenthub");
        if s_scope.exists() {
            copy_dir(&s_scope, &scope_profile)?;
        }
        if let Some(parent) = pdir.parent() {
            let scope_flat = parent.join("node_modules").join("@agenthub");
            remove_any(&scope_flat)?;
            let s_flat = snap_dir.join("profile").join(".nm-flat-agenthub");
            if s_flat.exists() {
                copy_dir(&s_flat, &scope_flat)?;
            }
        }
    }
    for id in preset_ids {
        let dst = preset_dir(home, id);
        remove_any(&dst)?;
        let src = snap_dir.join(format!("preset-{id}"));
        if src.exists() {
            copy_dir(&src, &dst)?;
        }
    }
    for name in skill_names {
        let dst = skills_dir(home, name);
        remove_any(&dst)?;
        let src = snap_dir.join(format!("skill-{name}"));
        if src.exists() {
            copy_dir(&src, &dst)?;
        }
    }
    let mut state = load_state(home);
    let prior = snap_dir.join("prior-state.json");
    if prior.exists() {
        let text = fs::read_to_string(&prior).map_err(ForgeError::Io)?;
        let v: serde_json::Value = serde_json::from_str(&text).map_err(ForgeError::Json)?;
        state["agents"][agent_id] = v;
    } else if let Some(agents) = state.get_mut("agents").and_then(|a| a.as_object_mut()) {
        agents.remove(agent_id);
    }
    save_state(home, &state)?;
    Ok(())
}
