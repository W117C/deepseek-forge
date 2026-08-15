//! Installed-state store, ported from lib/state.mjs (lossless JSON).

use std::fs;
use std::path::Path;

use crate::dsh::agenthub_store;
use crate::errors::ForgeError;

/// Load `<agenthub_store>/state.json`; missing/corrupt -> `{ agents: {} }`.
pub fn load_state(home: &Path) -> serde_json::Value {
    let p = agenthub_store(home).join("state.json");
    match fs::read_to_string(&p) {
        Ok(text) => {
            serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "agents": {} }))
        }
        Err(_) => serde_json::json!({ "agents": {} }),
    }
}

pub fn save_state(home: &Path, state: &serde_json::Value) -> Result<(), ForgeError> {
    let dir = agenthub_store(home);
    fs::create_dir_all(&dir).map_err(ForgeError::Io)?;
    let text = serde_json::to_string_pretty(state).map_err(ForgeError::Json)?;
    // 原子写：先写同目录临时文件再 rename，避免进程崩溃/并发读读到半截文件。
    let final_path = dir.join("state.json");
    let tmp_path = dir.join("state.json.tmp");
    fs::write(&tmp_path, format!("{text}\n")).map_err(ForgeError::Io)?;
    fs::rename(&tmp_path, &final_path).map_err(ForgeError::Io)
}
