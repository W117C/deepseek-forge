//! DeepSeek Harness adapter, ported 1:1 from lib/dsh.mjs.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::errors::ForgeError;

pub const PROFILE_PATCH_FILENAME: &str = "cordis.patch.yml";

/// Byte-identical to lib/dsh.mjs PROFILE_PATCH_TEMPLATE.
pub const PROFILE_PATCH_TEMPLATE: &str =
    "# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
";

/// Byte-identical to lib/dsh.mjs PROFILE_PNPM_WORKSPACE.
pub const PROFILE_PNPM_WORKSPACE: &str = "packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
";

pub fn dsh_home(home: Option<&Path>) -> PathBuf {
    if let Some(h) = home {
        return h.to_path_buf();
    }
    if let Some(dsh) = std::env::var_os("DSH_HOME") {
        if !dsh.is_empty() {
            return PathBuf::from(dsh);
        }
    }
    match std::env::var_os("HOME") {
        Some(h) => PathBuf::from(h).join(".dsh"),
        None => PathBuf::from(".dsh"),
    }
}

/// Locate the dsh CLI (Node `locateDsh`).
pub fn locate_dsh() -> Option<PathBuf> {
    if let Some(bin) = std::env::var_os("AGENTHUB_DSH_BIN") {
        let p = PathBuf::from(bin);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let npx_root = PathBuf::from(home).join(".npm/_npx");
        if let Ok(entries) = fs::read_dir(&npx_root) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("node_modules/.bin/dsh");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    if let Ok(out) = Command::new("which").arg("dsh").output() {
        if out.status.success() {
            let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Result of a dsh invocation (Node `spawnSync` shape).
#[derive(Clone, Debug, PartialEq)]
pub struct RunOutput {
    /// `None` means killed by timeout (Node: status null).
    pub status: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// Run a command with a wall-clock timeout, capturing output.
/// Polls `try_wait` so no extra threads are involved.
fn run_captured(mut cmd: Command, timeout_ms: u64) -> RunOutput {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return RunOutput {
                status: None,
                stdout: String::new(),
                stderr: format!("failed to spawn: {e}"),
            };
        }
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = String::new();
                let mut err = String::new();
                if let Some(mut s) = child.stdout.take() {
                    let _ = s.read_to_string(&mut out);
                }
                if let Some(mut s) = child.stderr.take() {
                    let _ = s.read_to_string(&mut err);
                }
                return RunOutput {
                    status: status.code(),
                    stdout: out,
                    stderr: err,
                };
            }
            Ok(None) => {
                if start.elapsed() >= Duration::from_millis(timeout_ms) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return RunOutput {
                        status: None,
                        stdout: String::new(),
                        stderr: String::new(),
                    };
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return RunOutput {
                    status: None,
                    stdout: String::new(),
                    stderr: String::new(),
                };
            }
        }
    }
}

/// Run dsh with DSH_HOME set (Node `runDsh`).
pub fn run_dsh(bin: &str, args: &[&str], home: &Path, timeout_ms: u64) -> RunOutput {
    let mut cmd = Command::new(bin);
    cmd.args(args).env("DSH_HOME", home);
    run_captured(cmd, timeout_ms)
}

pub fn dsh_version(bin: &str) -> Option<String> {
    let mut cmd = Command::new(bin);
    cmd.arg("--version");
    let out = run_captured(cmd, 15_000);
    if out.status == Some(0) {
        let text = format!("{}{}", out.stdout, out.stderr);
        return text.lines().next().map(|l| l.trim().to_string());
    }
    None
}

pub fn has_pnpm() -> bool {
    let mut cmd = Command::new("pnpm");
    cmd.arg("-v");
    run_captured(cmd, 15_000).status == Some(0)
}

pub fn profile_dir(home: &Path, name: &str) -> PathBuf {
    home.join("profiles").join(name)
}

pub fn preset_dir(home: &Path, id: &str) -> PathBuf {
    home.join(".agent-presets").join(id)
}

pub fn skills_dir(home: &Path, name: &str) -> PathBuf {
    home.join("skills").join(name)
}

pub fn agenthub_store(home: &Path) -> PathBuf {
    home.join(".agenthub")
}

/// Initialize a dsh profile exactly like Node's `initProfile` (only writes
/// missing files; never overwrites).
pub fn init_profile(dir: &Path, bundles: &[String]) -> Result<(), ForgeError> {
    fs::create_dir_all(dir).map_err(ForgeError::Io)?;
    let manifest_path = dir.join("package.json");
    if !manifest_path.exists() {
        let name = dir
            .file_name()
            .map(|n| format!("dsh-profile-{}", n.to_string_lossy()))
            .unwrap_or_else(|| "dsh-profile".to_string());
        let manifest = serde_json::json!({
            "name": name,
            "private": true,
            "dependencies": {},
            "dsh": { "profile": { "bundles": bundles } }
        });
        write_manifest(dir, &manifest)?;
    }
    let patch_path = dir.join(PROFILE_PATCH_FILENAME);
    if !patch_path.exists() {
        fs::write(&patch_path, PROFILE_PATCH_TEMPLATE).map_err(ForgeError::Io)?;
    }
    let workspace_path = dir.join("pnpm-workspace.yaml");
    if !workspace_path.exists() {
        fs::write(&workspace_path, PROFILE_PNPM_WORKSPACE).map_err(ForgeError::Io)?;
    }
    Ok(())
}

pub fn read_manifest(dir: &Path) -> Result<serde_json::Value, ForgeError> {
    let text = fs::read_to_string(dir.join("package.json")).map_err(ForgeError::Io)?;
    serde_json::from_str(&text).map_err(ForgeError::Json)
}

pub fn write_manifest(dir: &Path, manifest: &serde_json::Value) -> Result<(), ForgeError> {
    let text = serde_json::to_string_pretty(manifest).map_err(ForgeError::Json)?;
    fs::write(
        dir.join("package.json"),
        format!(
            "{text}
"
        ),
    )
    .map_err(ForgeError::Io)
}
