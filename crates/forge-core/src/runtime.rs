//! Phase 7: thin runtime adapter over DeepSeek Harness (status/sessions/processes).
//!
//! Forge does NOT reimplement the agent runtime: it observes the Harness
//! (binary + version), its session store (JSONL files) and its processes.
//! Model/context figures only appear when a real source provides them.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::dsh::{dsh_home, locate_dsh, run_dsh};
use crate::errors::ForgeError;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSummary {
    pub pid: u32,
    pub command: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub harness_detected: bool,
    pub harness_bin: Option<String>,
    pub harness_version: Option<String>,
    pub sessions_dir: String,
    pub session_count: usize,
    pub sessions: Vec<SessionSummary>,
    pub processes: Vec<ProcessSummary>,
}

/// Parse one line of the ps output ("pid=,command="). Pure for tests.
pub fn parse_ps_line(line: &str) -> Option<ProcessSummary> {
    let trimmed = line.trim_start();
    let space = trimmed.find(char::is_whitespace)?;
    let pid: u32 = trimmed[..space].parse().ok()?;
    let command = trimmed[space..].trim().to_string();
    if command.contains("dsh") {
        Some(ProcessSummary { pid, command })
    } else {
        None
    }
}

pub fn list_sessions(home: &Path) -> (usize, Vec<SessionSummary>) {
    let dir = home.join("sessions");
    let mut sessions = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let id = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let meta = fs::metadata(&p).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let secs = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let days = (secs / 86400) as i64;
                    let (y, mo, d) = civil_from_days(days);
                    let rem = secs % 86400;
                    format!(
                        "{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}Z",
                        rem / 3600,
                        (rem % 3600) / 60,
                        rem % 60
                    )
                })
                .unwrap_or_default();
            sessions.push(SessionSummary {
                id,
                size_bytes: size,
                modified_at: modified,
            });
        }
    }
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    let count = sessions.len();
    (count, sessions)
}

/// Howard Hinnant civil-from-days (shared shape with snapshot.rs).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn list_processes() -> Vec<ProcessSummary> {
    let Ok(out) = std::process::Command::new("ps")
        .args(["-axo", "pid=,command="])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(parse_ps_line)
        .collect()
}

/// Stop a process by pid (SIGTERM via Core; UI never kills directly).
pub fn stop_process(pid: u32) -> Result<bool, ForgeError> {
    let out = std::process::Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .output()
        .map_err(ForgeError::Io)?;
    Ok(out.status.success())
}

/// Restart a recorded command line detached; returns the new pid when known.
pub fn restart_process(command: &str) -> Result<Option<u32>, ForgeError> {
    let out = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("nohup {} >/dev/null 2>&1 & echo $!", command))
        .output()
        .map_err(ForgeError::Io)?;
    if !out.status.success() {
        return Ok(None);
    }
    let pid = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<u32>()
        .ok();
    Ok(pid)
}

/// Detached harness launch with stdout/stderr captured to a harness log
/// (~/.deepseek-forge/logs/harness/<ts>-<profile>.log). Returns pid + log path.
pub fn run_harness_captured(
    bin: &str,
    profile: &str,
    port: Option<u16>,
    home: &Path,
) -> Result<(u32, PathBuf), ForgeError> {
    let log_dir = crate::logutil::forge_root().join("logs").join("harness");
    fs::create_dir_all(&log_dir).map_err(ForgeError::Io)?;
    let log_file = log_dir.join(format!(
        "{}-{}.log",
        crate::snapshot::iso_utc_colon(),
        profile
    ));
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(ForgeError::Io)?;
    use std::process::Stdio;
    let mut cmd = std::process::Command::new(bin);
    cmd.args(["--profile", profile]);
    if let Some(p) = port {
        cmd.args(["--port", &p.to_string()]);
    }
    let child = cmd
        .env("DSH_HOME", home)
        .stdout(Stdio::from(log.try_clone().map_err(ForgeError::Io)?))
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(ForgeError::Io)?;
    Ok((child.id(), log_file))
}

/// Observe the Harness and its runtime state (never starts/stops anything here).
pub fn runtime_status(home_opt: Option<&Path>) -> Result<RuntimeStatus, ForgeError> {
    let home = dsh_home(home_opt);
    let bin = locate_dsh();
    let harness_detected = bin.is_some();
    let harness_version = match &bin {
        Some(b) => {
            let r = run_dsh(&b.to_string_lossy(), &["--version"], &home, 15_000);
            if r.status == Some(0) {
                format!("{}{}", r.stdout, r.stderr)
                    .lines()
                    .next()
                    .map(|l| l.trim().to_string())
            } else {
                None
            }
        }
        None => None,
    };
    let (session_count, sessions) = list_sessions(&home);
    Ok(RuntimeStatus {
        harness_detected,
        harness_bin: bin.map(|p| p.to_string_lossy().to_string()),
        harness_version,
        sessions_dir: home.join("sessions").to_string_lossy().to_string(),
        session_count,
        sessions,
        processes: list_processes(),
    })
}
