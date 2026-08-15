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
            return fs::copy(&target, dst).map_err(ForgeError::Io).map(|_| ());
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

/// 每个 Agent 最多保留的快照数（超出删最旧，防磁盘无界增长）
const KEEP_SNAPSHOTS: usize = 10;
/// 快照原子提交标记（写完后才 rename 到最终目录；restore 只接受带此标记的快照）
const COMPLETE_MARKER: &str = "COMPLETE";

/// 清理某 Agent 的孤儿 .tmp 目录与超量旧快照（保留最近 KEEP_SNAPSHOTS 个）。
fn gc_snapshots(agent_root: &Path) -> Result<(), ForgeError> {
    let mut dirs: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(agent_root).map_err(ForgeError::Io)? {
        let entry = entry.map_err(ForgeError::Io)?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".tmp") {
            let _ = remove_any(&entry.path());
        } else {
            dirs.push((name, entry.path()));
        }
    }
    // ISO 时间戳目录名按字典序 = 时间序
    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    while dirs.len() > KEEP_SNAPSHOTS {
        let (_, p) = dirs.remove(0);
        let _ = remove_any(&p);
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
    let agent_root = store.join("snapshots").join(agent_id);
    let snap_dir = agent_root.join(&ts);
    let tmp_dir = agent_root.join(format!("{ts}.tmp"));
    fs::create_dir_all(&tmp_dir).map_err(ForgeError::Io)?;
    let result: Result<(), ForgeError> = (|| {
        let pdir = profile_dir(home, profile_name);
        if pdir.exists() {
            let prof = tmp_dir.join("profile");
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
            fs::write(tmp_dir.join(".profile-missing"), "1").map_err(ForgeError::Io)?;
        }
        for id in preset_ids {
            let src = preset_dir(home, id);
            if src.exists() {
                copy_dir(&src, &tmp_dir.join(format!("preset-{id}")))?;
            }
        }
        for name in skill_names {
            let src = skills_dir(home, name);
            if src.exists() {
                copy_dir(&src, &tmp_dir.join(format!("skill-{name}")))?;
            }
        }
        let state = load_state(home);
        if let Some(prior) = state.get("agents").and_then(|a| a.get(agent_id)) {
            let text = serde_json::to_string_pretty(prior).map_err(ForgeError::Json)?;
            fs::write(tmp_dir.join("prior-state.json"), format!("{text}\n"))
                .map_err(ForgeError::Io)?;
        }
        // 原子提交：写完成标记后 rename，避免半截快照被后续 restore 信任
        fs::write(tmp_dir.join(COMPLETE_MARKER), "1").map_err(ForgeError::Io)?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            remove_any(&snap_dir)?; // 清掉异常中断遗留的同名残留（无标记，不可恢复）
            fs::rename(&tmp_dir, &snap_dir).map_err(ForgeError::Io)?;
            let _ = gc_snapshots(&agent_root);
            Ok(SnapshotInfo { ts, snap_dir })
        }
        Err(e) => {
            let _ = remove_any(&tmp_dir);
            Err(e)
        }
    }
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
    // 原子性门禁：无 COMPLETE 标记的快照 = 中断/损坏，拒绝恢复（防半成品被信任）
    if !snap_dir.join(COMPLETE_MARKER).exists() {
        return Err(ForgeError::InvalidManifest(format!(
            "snapshot 不完整或已损坏（缺少 {COMPLETE_MARKER} 标记），拒绝恢复：{}",
            snap_dir.display()
        )));
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_rejects_snapshot_without_complete_marker() {
        // P1-3 适应度函数：无 COMPLETE 标记（中断/损坏）的快照不得被恢复
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let store = agenthub_store(home);
        let snap_dir = store
            .join("snapshots")
            .join("x")
            .join("2026-01-01T00-00-00.000Z");
        fs::create_dir_all(&snap_dir).unwrap();
        fs::write(snap_dir.join(".profile-missing"), "1").unwrap();
        let err = restore_snapshot(home, "x", "2026-01-01T00-00-00.000Z", "x", &[], &[]);
        assert!(err.is_err(), "无标记快照应被拒绝恢复");
    }

    #[test]
    fn snapshot_writes_complete_marker_and_is_restorable() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let info = snapshot(home, "x", "nonexistent-profile", &[], &[]).unwrap();
        assert!(
            info.snap_dir.join(COMPLETE_MARKER).exists(),
            "新快照必须带 COMPLETE 标记"
        );
        let r = restore_snapshot(
            home,
            "x",
            &info.ts,
            "nonexistent-profile",
            &[],
            &[],
        );
        assert!(r.is_ok(), "带标记的快照应可恢复");
    }

    #[test]
    fn gc_keeps_at_most_keep_snapshots_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let store = agenthub_store(home);
        let root = store.join("snapshots").join("x");
        fs::create_dir_all(&root).unwrap();
        // 制造超过 KEEP_SNAPSHOTS 个已完成快照 + 1 个孤儿 tmp
        let n = KEEP_SNAPSHOTS + 3;
        for i in 0..n {
            let d = root.join(format!("2026-01-{i:02}T00-00-00.000Z"));
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join(COMPLETE_MARKER), "1").unwrap();
        }
        fs::create_dir_all(root.join("2026-02-01T00-00-00.000Z.tmp")).unwrap();
        gc_snapshots(&root).unwrap();
        let remain: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(remain.len(), KEEP_SNAPSHOTS, "GC 后应只剩 KEEP_SNAPSHOTS 个快照（含清理 tmp），实际 {remain:?}");
    }
}
