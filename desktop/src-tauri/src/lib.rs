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
use forge_core::composer::{resolve_graph, validate_components, ComponentSpec, DependencySpec};
use forge_core::import::analyze_source;
use forge_core::installer::rollback;
use forge_core::model::SourceType;
use forge_core::registry::{LocalRegistry, RegistryProvider};
use forge_core::logutil::list_install_logs;
use forge_core::runtime::{restart_process, runtime_status, stop_process};
use forge_core::state::load_state;
use forge_core::updater::check_updates;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

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

/// Phase 8: installed agents from the shared DSH state store.
#[tauri::command]
fn state_list() -> Result<serde_json::Value, String> {
    Ok(load_state(&forge_core::dsh::dsh_home(None)))
}

/// Increment ⑤: process control via Core (UI never kills directly).
#[tauri::command]
fn runtime_stop(pid: u32) -> Result<serde_json::Value, String> {
    let ok = stop_process(pid).map_err(to_ipc_error)?;
    Ok(serde_json::json!({ "ok": ok, "pid": pid }))
}

#[tauri::command]
fn runtime_restart(command: String) -> Result<serde_json::Value, String> {
    let pid = restart_process(&command).map_err(to_ipc_error)?;
    Ok(serde_json::json!({ "pid": pid }))
}

/// Increment ⑥: install log entries (append-only JSONL).
#[tauri::command]
fn logs_list() -> Result<Vec<forge_core::logutil::LogEntry>, String> {
    Ok(list_install_logs())
}

/// STEP 6: 真实安装 —— 有 artifact 走 install-from-registry；GitHub 源走收录式
/// 安装（克隆→扫描→状态登记，经 Core）。状态/结果全部由 Core 返回。
#[tauri::command]
fn install_package(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let reg = registry();
    let pkg = reg.get_package(&id).map_err(to_ipc_error)?;
    let home = forge_core::dsh::dsh_home(None);
    let has_artifact = !pkg.artifact.filename.is_empty() || pkg.artifact.sha256.is_some();
    if pkg.source.r#type == SourceType::Github && !has_artifact {
        // 收录式安装：经 forge-core 二进制（与 CLI 同路径）
        let reg_root = registry().root().to_string_lossy().to_string();
        return run_forge_streaming(
            &app,
            &[
                "package".to_string(),
                "import-github".to_string(),
                id.clone(),
                "--registry".to_string(),
                reg_root,
                "--home".to_string(),
                home.to_string_lossy().to_string(),
            ],
        );
    }
    // 有 artifact：走与 CLI 相同的 install-from-registry 完整管线
    // （哈希→验签→解包→快照→安装→健康检查→状态登记 profile，失败自动回滚）
    let reg_root = registry().root().to_string_lossy().to_string();
    run_forge_streaming(
        &app,
        &[
            "install-from-registry".to_string(),
            id.clone(),
            "--registry".to_string(),
            reg_root,
            "--home".to_string(),
            home.to_string_lossy().to_string(),
        ],
    )
}

/// 通用 forge-core 调用：stdout JSON / stderr 错误信封。
fn run_forge(args: &[String]) -> Result<serde_json::Value, String> {
    let bin = published_or_dev_bin()
        .ok_or_else(|| "forge-core 二进制不可用：请先构建或设置 FORGE_CORE_BIN".to_string())?;
    let out = std::process::Command::new(bin)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let raw = String::from_utf8_lossy(&out.stderr);
        let env: serde_json::Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
            serde_json::json!({ "code": "FAILED", "human": raw.trim() })
        });
        return Err(serde_json::to_string(&env).unwrap_or_default());
    }
    serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())
}

/// 流式执行 forge-core：stderr 逐行读取，install-progress 事件实时推给前端；
/// stdout 仍为单一结果 JSON；失败时用 stderr 中的错误信封（兼容原有语义）。
fn run_forge_streaming(app: &AppHandle, args: &[String]) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, BufReader};
    let bin = published_or_dev_bin()
        .ok_or_else(|| "forge-core 二进制不可用：请先构建或设置 FORGE_CORE_BIN".to_string())?;
    let mut child = std::process::Command::new(bin)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法捕获子进程 stderr".to_string())?;
    let mut last_err: Option<serde_json::Value> = None;
    for line in BufReader::new(stderr).lines() {
        let line = line.unwrap_or_default();
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
            if v.get("event").and_then(|e| e.as_str()) == Some("install-progress") {
                let _ = app.emit("install-progress", &v);
            } else if v.get("code").is_some() {
                last_err = Some(v);
            }
        }
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let raw = String::from_utf8_lossy(&output.stderr);
        let env = last_err.clone().unwrap_or_else(|| {
            serde_json::from_str(&raw).unwrap_or_else(|_| {
                serde_json::json!({ "code": "FAILED", "human": raw.trim() })
            })
        });
        return Err(serde_json::to_string(&env).unwrap_or_default());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}

fn home_arg() -> String {
    forge_core::dsh::dsh_home(None).to_string_lossy().to_string()
}

#[tauri::command]
fn bundle_create(name: String, ids: Vec<String>) -> Result<serde_json::Value, String> {
    let reg = registry().root().to_string_lossy().to_string();
    let args = vec![
        "bundle".to_string(),
        "create".to_string(),
        "--name".to_string(),
        name,
        "--ids".to_string(),
        ids.join(","),
        "--registry".to_string(),
        reg,
        "--home".to_string(),
        home_arg(),
    ];
    run_forge(&args)
}

#[tauri::command]
fn bundle_list() -> Result<serde_json::Value, String> {
    run_forge(&[
        "bundle".to_string(),
        "list".to_string(),
        "--home".to_string(),
        home_arg(),
    ])
}

#[tauri::command]
fn bundle_install(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let reg = registry().root().to_string_lossy().to_string();
    run_forge_streaming(
        &app,
        &[
            "bundle".to_string(),
            "install".to_string(),
            id,
            "--registry".to_string(),
            reg,
            "--home".to_string(),
            home_arg(),
        ],
    )
}

#[tauri::command]
fn bundle_uninstall(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let reg = registry().root().to_string_lossy().to_string();
    run_forge_streaming(
        &app,
        &[
            "bundle".to_string(),
            "uninstall".to_string(),
            id,
            "--registry".to_string(),
            reg,
            "--home".to_string(),
            home_arg(),
        ],
    )
}

#[tauri::command]
fn update_apply(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let reg = registry().root().to_string_lossy().to_string();
    run_forge_streaming(
        &app,
        &[
            "update".to_string(),
            "apply".to_string(),
            id,
            "--registry".to_string(),
            reg,
            "--home".to_string(),
            home_arg(),
        ],
    )
}

#[tauri::command]
fn dependents_list(id: String) -> Result<serde_json::Value, String> {
    run_forge(&["dependents".to_string(), id, "--home".to_string(), home_arg()])
}

/// Sources 页真实统计：本地 Registry 包数 / GitHub 来源数 / 本地源码缓存数。
/// STEP 14: 组合生成 Agent —— composer generate 全链路（生成目录 → 安装管线 → 可运行）。
#[tauri::command]
fn composer_generate(
    app: AppHandle,
    name: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let reg = registry().root().to_string_lossy().to_string();
    run_forge_streaming(
        &app,
        &[
            "composer".to_string(),
            "generate".to_string(),
            "--name".to_string(),
            name,
            "--ids".to_string(),
            ids.join(","),
            "--registry".to_string(),
            reg,
            "--home".to_string(),
            home_arg(),
        ],
    )
}

#[tauri::command]
fn sources_stats() -> Result<serde_json::Value, String> {
    let reg = registry();
    let root = reg.root().to_path_buf();
    let mut packages = 0usize;
    let mut github = 0usize;
    let mut licenses: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    if let Ok(rd) = std::fs::read_dir(root.join("packages")) {
        for entry in rd.flatten() {
            let pj = entry.path().join("package.json");
            if let Ok(text) = std::fs::read_to_string(&pj) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    packages += 1;
                    let is_github = v
                        .get("source")
                        .and_then(|s| s.get("type"))
                        .and_then(|t| t.as_str())
                        == Some("github");
                    if is_github {
                        github += 1;
                    }
                    if let Some(l) = v
                        .get("license")
                        .and_then(|l| l.get("spdx"))
                        .and_then(|l| l.as_str())
                    {
                        *licenses.entry(l.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }
    }
    let cache_repos = std::path::Path::new(&forge_core::dsh::dsh_home(None))
        .join(".deepseek-forge")
        .join("cache")
        .join("repos");
    let mut cache_count = 0usize;
    if let Ok(rd) = std::fs::read_dir(&cache_repos) {
        cache_count = rd.flatten().count();
    }
    Ok(serde_json::json!({
        "registryPath": root,
        "packages": packages,
        "githubSources": github,
        "licenses": licenses,
        "cacheRepos": cache_count,
        "cachePath": cache_repos,
    }))
}

#[tauri::command]
fn state_set_review(id: String, status: String) -> Result<serde_json::Value, String> {
    run_forge(&[
        "state".to_string(),
        "set-review".to_string(),
        id,
        "--status".to_string(),
        status,
        "--home".to_string(),
        home_arg(),
    ])
}

#[tauri::command]
fn state_set_enabled(id: String, enabled: bool) -> Result<serde_json::Value, String> {
    run_forge(&[
        "state".to_string(),
        "set-enabled".to_string(),
        id,
        "--enabled".to_string(),
        enabled.to_string(),
        "--home".to_string(),
        home_arg(),
    ])
}

/// 定位 forge-core（开发 target 优先，其次发布布局，最后 PATH）
fn published_or_dev_bin() -> Option<String> {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    for profile in ["release", "debug"] {
        let p = here
            .join("../../crates/forge-core/target")
            .join(profile)
            .join("forge-core");
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

/// Increment ④: resolve a composition of registry packages (deps from manifests).
#[tauri::command]
fn composer_resolve(ids: Vec<String>) -> Result<forge_core::composer::ResolveReport, String> {
    let reg = registry();
    let mut components = Vec::new();
    for id in &ids {
        let pkg = reg.get_package(id).map_err(to_ipc_error)?;
        let deps: Vec<DependencySpec> = pkg
            .dependencies
            .iter()
            .map(|d| DependencySpec {
                package: d.package.clone(),
                version: d.version.clone(),
            })
            .collect();
        components.push(ComponentSpec {
            name: id.clone(),
            dependencies: deps,
        });
    }
    validate_components(&components).map_err(to_ipc_error)?;
    resolve_graph(&components).map_err(to_ipc_error)
}

/// Increment ③: compare installed versions against the local registry.
#[tauri::command]
fn update_check() -> Result<Vec<forge_core::updater::UpdateEntry>, String> {
    check_updates(&forge_core::dsh::dsh_home(None), &registry()).map_err(to_ipc_error)
}

/// Phase 8: rollback/uninstall an installed package via the Rust kernel.
#[tauri::command]
fn package_rollback(id: String) -> Result<serde_json::Value, String> {
    rollback(&forge_core::dsh::dsh_home(None), &id).map_err(to_ipc_error)
}

/// Phase 7: observe the DeepSeek Harness runtime (status/sessions/processes).
/// Run/Manage：真实启动 Harness profile（后台分离，返回 pid + 日志文件）。
/// 只有带 profile 的已安装包可运行（artifact 安装管线写入 profile 字段）。
#[tauri::command]
fn runtime_run(profile: String) -> Result<serde_json::Value, String> {
    let bin = forge_core::dsh::locate_dsh()
        .ok_or_else(|| "dsh 未找到：请安装 DeepSeek Harness CLI".to_string())?;
    let (pid, log_file) = forge_core::runtime::run_harness_captured(
        &bin.to_string_lossy(),
        &profile,
        None,
        &forge_core::dsh::dsh_home(None),
    )
    .map_err(to_ipc_error)?;
    Ok(serde_json::json!({ "pid": pid, "logFile": log_file }))
}

#[tauri::command]
fn runtime_status_cmd() -> Result<forge_core::runtime::RuntimeStatus, String> {
    runtime_status(None).map_err(to_ipc_error)
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
            adapter_propose,
            runtime_status_cmd,
            state_list,
            package_rollback,
            update_check,
            composer_resolve,
            runtime_stop,
            runtime_restart,
            runtime_run,
            logs_list,
            install_package,
            bundle_create,
            bundle_list,
            bundle_install,
            bundle_uninstall,
            update_apply,
            dependents_list,
            state_set_enabled,
            state_set_review,
            sources_stats,
            composer_generate
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
