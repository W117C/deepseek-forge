//! Increment ⑥: install log persistence (append-only JSONL).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::ForgeError;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub ts: String,
    pub id: String,
    pub version: String,
    pub ok: bool,
    pub steps: Vec<String>,
    pub code: Option<String>,
}

fn log_root() -> PathBuf {
    match std::env::var_os("FORGE_HOME") {
        Some(h) if !h.is_empty() => PathBuf::from(h),
        _ => match std::env::var_os("HOME") {
            Some(h) => PathBuf::from(h).join(".deepseek-forge"),
            None => PathBuf::from(".deepseek-forge"),
        },
    }
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

pub fn list_install_logs() -> Vec<LogEntry> {
    let dir = log_root().join("logs").join("install");
    let mut entries = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("jsonl") {
                continue;
            }
            if let Ok(text) = fs::read_to_string(&p) {
                for line in text.lines() {
                    if let Ok(entry) = serde_json::from_str::<LogEntry>(line) {
                        entries.push(entry);
                    }
                }
            }
        }
    }
    entries.sort_by(|a, b| b.ts.cmp(&a.ts));
    entries
}

pub fn logs_dir() -> PathBuf {
    log_root().join("logs").join("install")
}
