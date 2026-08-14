//! Increment ⑥: install log persistence (append-only JSONL).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::errors::ForgeError;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub ts: String,
    pub id: String,
    /// "install" | "security"
    #[serde(default = "default_kind")]
    pub kind: String,
    pub version: String,
    pub ok: bool,
    #[serde(default)]
    pub steps: Vec<String>,
    pub code: Option<String>,
}

fn default_kind() -> String {
    "install".to_string()
}

pub fn forge_root() -> PathBuf {
    match std::env::var_os("FORGE_HOME") {
        Some(h) if !h.is_empty() => PathBuf::from(h),
        _ => match std::env::var_os("HOME") {
            Some(h) => PathBuf::from(h).join(".deepseek-forge"),
            None => PathBuf::from(".deepseek-forge"),
        },
    }
}

fn log_root() -> PathBuf {
    forge_root()
}

pub fn append_install_log(
    id: &str,
    version: &str,
    ok: bool,
    steps: &[String],
    code: Option<&str>,
) -> Result<PathBuf, ForgeError> {
    let dir = log_root().join("logs").join("install");
    fs::create_dir_all(&dir).map_err(ForgeError::Io)?;
    let path = dir.join(format!("{id}.jsonl"));
    let entry = LogEntry {
        ts: crate::snapshot::iso_utc_colon(),
        id: id.to_string(),
        kind: "install".to_string(),
        version: version.to_string(),
        ok,
        steps: steps.to_vec(),
        code: code.map(String::from),
    };
    let line = serde_json::to_string(&entry).map_err(ForgeError::Json)?;
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(ForgeError::Io)?;
    writeln!(f, "{line}").map_err(ForgeError::Io)?;
    Ok(path)
}

/// Security-scan log entry (kind="security"): version=verdict, code=score.
pub fn append_security_log(
    id: &str,
    score: i32,
    verdict: &str,
    findings_count: usize,
) -> Result<PathBuf, ForgeError> {
    let dir = log_root().join("logs").join("security");
    fs::create_dir_all(&dir).map_err(ForgeError::Io)?;
    let path = dir.join(format!("{id}.jsonl"));
    let entry = LogEntry {
        ts: crate::snapshot::iso_utc_colon(),
        id: id.to_string(),
        kind: "security".to_string(),
        version: verdict.to_string(),
        ok: verdict != "block",
        steps: vec![format!("findings: {findings_count}")],
        code: Some(score.to_string()),
    };
    let line = serde_json::to_string(&entry).map_err(ForgeError::Json)?;
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(ForgeError::Io)?;
    writeln!(f, "{line}").map_err(ForgeError::Io)?;
    Ok(path)
}

pub fn list_logs() -> Vec<LogEntry> {
    let root = log_root().join("logs");
    let mut entries = Vec::new();
    // harness：日志文件本身（无 JSONL 结构，按文件枚举）
    let harness_dir = root.join("harness");
    if let Ok(rd) = fs::read_dir(&harness_dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("log") {
                continue;
            }
            let meta = fs::metadata(&p);
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let ts = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            entries.push(LogEntry {
                ts: ts.clone(),
                id: ts.split('-').last().unwrap_or("harness").to_string(),
                kind: "harness".to_string(),
                version: "log".to_string(),
                ok: true,
                steps: vec![format!("{} bytes", size)],
                code: Some(p.to_string_lossy().to_string()),
            });
        }
    }
    for kind in ["install", "security"] {
        let dir = root.join(kind);
        if let Ok(rd) = fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) != Some("jsonl") {
                    continue;
                }
                if let Ok(text) = fs::read_to_string(&p) {
                    for line in text.lines() {
                        if let Ok(mut entry) = serde_json::from_str::<LogEntry>(line) {
                            if entry.kind.is_empty() {
                                entry.kind = kind.to_string();
                            }
                            entries.push(entry);
                        }
                    }
                }
            }
        }
    }
    entries.sort_by(|a, b| b.ts.cmp(&a.ts));
    entries
}

pub fn list_install_logs() -> Vec<LogEntry> {
    list_logs()
}

pub fn logs_dir() -> PathBuf {
    log_root().join("logs").join("install")
}
