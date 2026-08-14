//! Read-only Forge CLI: registry list/info, package validate/inspect,
//! sign (keygen/sha256/canonical/raw/verify), scan, state list.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::exit;

use forge_core::adapter::{generate, propose};
use forge_core::composer::{resolve_graph, validate_components, ComponentSpec};
use forge_core::dsh::{agenthub_store, dsh_home, locate_dsh};
use forge_core::errors::{ErrorEnvelope, ForgeError};
use forge_core::import::analyze_source;
use forge_core::installer::{
    install, install_catalog_plugin, rollback, InstallFailure, InstallRequest,
};
use forge_core::logutil::{append_install_log, list_logs};
use forge_core::manifest::{
    load_legacy_agent_dir, load_legacy_agent_dir_strict, load_package_file,
};
use forge_core::registry::{LocalRegistry, PackageSummary, RegistryProvider};
use forge_core::runtime::{restart_process, run_harness_captured, runtime_status, stop_process};
use forge_core::security::{scan_agent_dir, scan_text_report};
use forge_core::signing::{canonical_payload, keygen, sha256hex, sign_payload, verify_payload};
use forge_core::snapshot::iso_utc_colon;
use forge_core::state::{load_state, save_state};
use forge_core::updater::check_updates;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if let Err(err) = run(&args) {
        let envelope = ErrorEnvelope::from(err);
        eprintln!(
            "{}",
            serde_json::to_string_pretty(&envelope).unwrap_or_else(|_| {
                "{\"code\":\"IO\",\"human\":\"error serialization failed\"}".to_string()
            })
        );
        exit(1);
    }
}

struct Flags {
    map: BTreeMap<String, String>,
    positional: Vec<String>,
}

/// Flags that always take a value (PEM armor starts with "--" like "--BEGIN").
const VALUE_FLAGS: &[&str] = &[
    "registry",
    "home",
    "trust",
    "label",
    "key",
    "public-key",
    "signature",
    "manifest-json",
    "sha256",
    "profile",
    "bin",
    "source",
    "version",
];

impl Flags {
    fn parse(args: &[String]) -> Flags {
        let mut map = BTreeMap::new();
        let mut positional = Vec::new();
        let mut i = 0;
        while i < args.len() {
            let a = &args[i];
            if let Some(rest) = a.strip_prefix("--") {
                if let Some((k, v)) = rest.split_once('=') {
                    map.insert(k.to_string(), v.to_string());
                } else if VALUE_FLAGS.contains(&rest) && i + 1 < args.len() {
                    map.insert(rest.to_string(), args[i + 1].clone());
                    i += 1;
                } else if i + 1 < args.len() && !args[i + 1].starts_with("--") {
                    map.insert(rest.to_string(), args[i + 1].clone());
                    i += 1;
                } else {
                    map.insert(rest.to_string(), "true".to_string());
                }
            } else {
                positional.push(a.clone());
            }
            i += 1;
        }
        Flags { map, positional }
    }

    fn get(&self, k: &str) -> Option<&str> {
        self.map.get(k).map(|s| s.as_str())
    }
}

fn read_stdin() -> Result<Vec<u8>, ForgeError> {
    let mut buf = Vec::new();
    std::io::stdin()
        .read_to_end(&mut buf)
        .map_err(ForgeError::Io)?;
    Ok(buf)
}

fn print_json<T: serde::Serialize>(v: &T) -> Result<(), ForgeError> {
    println!(
        "{}",
        serde_json::to_string_pretty(v).map_err(ForgeError::Json)?
    );
    Ok(())
}

fn run(args: &[String]) -> Result<(), ForgeError> {
    let command = match args.first() {
        Some(cmd) => cmd,
        None => {
            print_usage();
            return Err(ForgeError::InvalidManifest(
                "no command provided".to_string(),
            ));
        }
    };

    match command.as_str() {
        "registry" => run_registry(&args[1..]),
        "package" => run_package(&args[1..]),
        "sign" => run_sign(&args[1..]),
        "scan" => run_scan(&args[1..]),
        "state" => run_state(&args[1..]),
        "install" => run_install(&args[1..]),
        "rollback" | "uninstall" => run_rollback(&args[1..]),
        "catalog-plugin" => run_catalog_plugin(&args[1..]),
        "install-from-registry" => run_install_from_registry(&args[1..]),
        "import" => run_import(&args[1..]),
        "adapter" => run_adapter(&args[1..]),
        "composer" => run_composer(&args[1..]),
        "runtime" => run_runtime(&args[1..]),
        "search" => run_search(&args[1..]),
        "update" => run_update(&args[1..]),
        "dependents" => run_dependents(&args[1..]),
        "logs" => run_logs(&args[1..]),
        "agent-config" => run_agent_config(&args[1..]),
        "bundle" => run_bundle(&args[1..]),
        _ => {
            print_usage();
            Err(ForgeError::InvalidManifest(format!(
                "unknown command '{command}'"
            )))
        }
    }
}

fn default_registry_path() -> PathBuf {
    match env::var_os("HOME") {
        Some(home) => PathBuf::from(home).join(".deepseek-forge").join("registry"),
        None => PathBuf::from(".deepseek-forge").join("registry"),
    }
}

fn parse_registry(args: &[String]) -> (PathBuf, Vec<String>) {
    let f = Flags::parse(args);
    let registry = f
        .get("registry")
        .map(PathBuf::from)
        .unwrap_or_else(default_registry_path);
    (registry, f.positional)
}

fn run_registry(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "registry requires a subcommand (list|info)".to_string(),
            ))
        }
    };
    match sub.as_str() {
        "list" => {
            let (registry, _) = parse_registry(&args[1..]);
            let packages = LocalRegistry::open(registry).list_packages()?;
            print_json(&packages)
        }
        "info" => {
            let (registry, positional) = parse_registry(&args[1..]);
            let id = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("registry info requires a package ID".to_string())
            })?;
            let package = LocalRegistry::open(registry).get_package(id)?;
            print_json(&package)
        }
        "import" => {
            let (registry, positional) = parse_registry(&args[1..]);
            let agent_dir = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest(
                    "registry import requires an agent directory".to_string(),
                )
            })?;
            registry_import(Path::new(agent_dir), &registry)
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown registry subcommand '{sub}'"
        ))),
    }
}

fn run_package(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "package requires a subcommand (validate|inspect|import-github)".to_string(),
            ))
        }
    };
    match sub.as_str() {
        "validate" => {
            let path = args.get(1).ok_or_else(|| {
                ForgeError::InvalidManifest(
                    "package validate requires a file or directory path".to_string(),
                )
            })?;
            let package = if Path::new(path).is_dir() {
                load_legacy_agent_dir(Path::new(path))?
            } else {
                load_package_file(Path::new(path))?
            };
            let out = serde_json::json!({
                "ok": true,
                "id": package.id,
                "type": package.r#type,
                "version": package.version,
                "capabilities": package.capabilities,
            });
            print_json(&out)
        }
        "inspect" => {
            let (registry, positional) = parse_registry(&args[1..]);
            let id = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("package inspect requires a package ID".to_string())
            })?;
            let package = LocalRegistry::open(registry).get_package(id)?;
            print_json(&package)
        }
        "import-github" => {
            let f = Flags::parse(&args[1..]);
            let (registry, positional) = parse_registry(&args[1..]);
            let id = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest(
                    "package import-github requires a package ID".to_string(),
                )
            })?;
            let home = f
                .get("home")
                .map(PathBuf::from)
                .unwrap_or_else(|| dsh_home(None));
            print_json(&package_import_github(id, &registry, &home)?)
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown package subcommand '{sub}'"
        ))),
    }
}

/// 安装进度事件（NDJSON → stderr，stdout 保持单一结果 JSON，向后兼容 CLI/e2e）。
/// 桌面端逐行读取并把每个阶段实时推给 UI（真实阶段：每行都在对应真实工作完成后打印）。
fn progress_line(
    id: &str,
    phase: &str,
    step: usize,
    total: usize,
    meta: Option<serde_json::Value>,
) {
    let mut v = serde_json::json!({
        "event": "install-progress",
        "id": id,
        "phase": phase,
        "step": step,
        "total": total,
    });
    if let Some(m) = meta {
        v["meta"] = m;
    }
    eprintln!("{v}");
}

/// 收录式安装：GitHub 源包 → 浅克隆到缓存 → 安全扫描 → 登记安装状态 → 写安装日志。
/// 真实落盘（缓存源码 + state.json + 日志）；未适配的 upstream 不会伪装成已装进 Harness。
fn package_import_github(
    id: &str,
    registry: &Path,
    home: &Path,
) -> Result<serde_json::Value, ForgeError> {
    use forge_core::import::analyze_source;
    use forge_core::logutil::append_install_log;
    use forge_core::snapshot::iso_utc_colon;

    let pkg = LocalRegistry::open(registry.to_path_buf()).get_package(id)?;
    let repo_url = pkg
        .source
        .repository
        .clone()
        .ok_or_else(|| ForgeError::InvalidManifest("该包无 GitHub 来源".to_string()))?;
    if pkg.source.r#type != forge_core::model::SourceType::Github {
        return Err(ForgeError::InvalidManifest(
            "import-github 仅支持 source.type=github 的包".to_string(),
        ));
    }
    let steps = vec![
        "resolving".to_string(),
        "cloning".to_string(),
        "scanning".to_string(),
        "registering".to_string(),
    ];
    progress_line(id, "resolving", 1, 5, None);
    let analysis = analyze_source(&repo_url)?;
    progress_line(
        id,
        "cloning",
        2,
        5,
        Some(serde_json::json!({ "source": analysis.source })),
    );
    progress_line(
        id,
        "scanning",
        3,
        5,
        Some(serde_json::json!({ "verdict": analysis.scan.verdict, "score": analysis.scan.score })),
    );
    if analysis.license_missing {
        let _ = append_install_log(id, &pkg.version, false, &steps, Some("LICENSE_MISSING"));
        return Err(ForgeError::LicenseMissing(format!(
            "{}：该仓库无许可证，按 Principle 5 拒绝收录。",
            analysis.source
        )));
    }
    // 登记安装状态（真实写入共享状态库）
    let deps: serde_json::Map<String, serde_json::Value> = pkg
        .dependencies
        .iter()
        .map(|d| {
            (
                d.package.clone(),
                serde_json::Value::String(d.version.clone().unwrap_or_else(|| "any".to_string())),
            )
        })
        .collect();
    let mut state = load_state(home);
    state["agents"][id] = serde_json::json!({
        "kind": pkg.r#type,
        "source": repo_url,
        "installPath": analysis.source,
        "version": pkg.version,
        "installedAt": iso_utc_colon(),
        "trust": "community",
        "score": analysis.scan.score,
        "scanVerdict": analysis.scan.verdict,
        "imported": true,
        "license": analysis.license,
        "dependencies": deps,
        "enabled": true,
        "reviewStatus": "pending",
        "reviewedAt": null,
        // 真实权限来自本次安全扫描（空数组 = 扫描未发现该类别引用）
        "permissions": {
            "network": analysis.network_usage,
            "filesystem": analysis.filesystem_usage,
            "env": analysis.env_vars,
        },
    });
    save_state(home, &state)?;
    progress_line(id, "registering", 4, 5, None);
    let _ = append_install_log(id, &pkg.version, true, &steps, None);
    progress_line(
        id,
        "installed",
        5,
        5,
        Some(serde_json::json!({ "version": pkg.version })),
    );
    Ok(serde_json::json!({
        "id": id,
        "version": pkg.version,
        "source": analysis.source,
        "license": analysis.license,
        "packageType": analysis.package_type,
        "scan": analysis.scan,
        "steps": steps,
        "imported": true,
        "note": "收录完成：源码已克隆到本地缓存并完成安全扫描；适配为可运行 Forge 包（Adapter）为后续步骤。"
    }))
}

fn run_sign(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "sign requires a subcommand (keygen|sha256|canonical|raw|verify)".to_string(),
            ))
        }
    };
    let f = Flags::parse(&args[1..]);
    match sub.as_str() {
        "keygen" => {
            let kp = keygen();
            if f.get("stdout-only").is_some() {
                return print_json(&kp);
            }
            let home = f
                .get("home")
                .map(PathBuf::from)
                .unwrap_or_else(|| dsh_home(None));
            let keys_path = agenthub_store(&home).join("keys.json");
            if keys_path.exists() {
                let existing = fs::read_to_string(&keys_path).map_err(ForgeError::Io)?;
                println!("{existing}");
                return Ok(());
            }
            fs::create_dir_all(keys_path.parent().unwrap_or(Path::new(".")))
                .map_err(ForgeError::Io)?;
            let text = serde_json::to_string_pretty(&kp).map_err(ForgeError::Json)?;
            fs::write(
                &keys_path,
                format!(
                    "{text}
"
                ),
            )
            .map_err(ForgeError::Io)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&keys_path, fs::Permissions::from_mode(0o600))
                    .map_err(ForgeError::Io)?;
            }
            print_json(&kp)
        }
        "sha256" => {
            let data = read_stdin()?;
            let out = serde_json::json!({ "sha256": sha256hex(&data) });
            print_json(&out)
        }
        "canonical" => {
            let m = f.get("manifest-json").ok_or_else(|| {
                ForgeError::InvalidManifest("--manifest-json <text> required".to_string())
            })?;
            let sha = f.get("sha256").ok_or_else(|| {
                ForgeError::InvalidManifest("--sha256 <hex> required".to_string())
            })?;
            let out = serde_json::json!({ "payload": canonical_payload(m, sha) });
            print_json(&out)
        }
        "raw" => {
            let key = f
                .get("key")
                .ok_or_else(|| ForgeError::InvalidManifest("--key <pem> required".to_string()))?;
            let payload = String::from_utf8(read_stdin()?)
                .map_err(|e| ForgeError::InvalidManifest(format!("payload not utf-8: {e}")))?;
            let sig = sign_payload(key, &payload)?;
            let out = serde_json::json!({ "signature": sig });
            print_json(&out)
        }
        "verify" => {
            let key = f.get("public-key").ok_or_else(|| {
                ForgeError::InvalidManifest("--public-key <pem> required".to_string())
            })?;
            let sig = f.get("signature").ok_or_else(|| {
                ForgeError::InvalidManifest("--signature <b64> required".to_string())
            })?;
            let payload = String::from_utf8(read_stdin()?)
                .map_err(|e| ForgeError::InvalidManifest(format!("payload not utf-8: {e}")))?;
            let out = serde_json::json!({ "valid": verify_payload(key, &payload, sig) });
            print_json(&out)
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown sign subcommand '{sub}'"
        ))),
    }
}

fn run_scan(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let trust = f.get("trust").unwrap_or("community");
    if f.get("stdin").is_some() {
        let label = f.get("label").unwrap_or("<stdin>");
        let text = String::from_utf8(read_stdin()?)
            .map_err(|e| ForgeError::InvalidManifest(format!("stdin not utf-8: {e}")))?;
        let report = scan_text_report(&text, label, trust);
        return print_json(&report);
    }
    let dir = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("scan requires a directory or --stdin".to_string())
    })?;
    let report = scan_agent_dir(Path::new(dir), trust)?;
    print_json(&report)
}

fn run_state(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "state requires a subcommand (list|set-enabled)".to_string(),
            ))
        }
    };
    let f = Flags::parse(&args[1..]);
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    match sub.as_str() {
        "list" => {
            let state = load_state(&home);
            return print_json(&state);
        }
        "set-enabled" => {
            // 真实启用/禁用：写入共享状态库的 enabled 字段。
            // Forge 自身的组合安装 / 更新会拒绝使用被禁用的插件（见 bundle install 与 update apply）。
            let id = f.positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("state set-enabled requires a package id".to_string())
            })?;
            let flag = match f.get("enabled") {
                Some("true") => true,
                Some("false") => false,
                _ => {
                    return Err(ForgeError::InvalidManifest(
                        "state set-enabled requires --enabled true|false".to_string(),
                    ))
                }
            };
            let mut state = load_state(&home);
            let rec = state
                .get("agents")
                .and_then(|a| a.get(id))
                .cloned()
                .ok_or_else(|| ForgeError::PackageNotFound(format!("未安装：{id}")))?;
            let kind = rec.get("kind").and_then(|k| k.as_str()).unwrap_or("agent");
            if kind == "agent" {
                return Err(ForgeError::InvalidManifest(
                    "启用/禁用当前仅支持 plugin（收录式安装）。Agent 的启停由 Harness profile 决定。".to_string(),
                ));
            }
            state["agents"][id]["enabled"] = serde_json::json!(flag);
            save_state(&home, &state)?;
            return print_json(&serde_json::json!({
                "id": id,
                "enabled": flag,
                "note": "已写入共享状态库；Forge 的组合安装/更新将拒绝使用被禁用的插件（Harness 侧运行策略随 Runtime 接入）。"
            }));
        }
        "set-review" => {
            // 审核工作流：pending → approved / rejected（真实写入共享状态库）。
            // Forge 的组合安装 / 更新拒绝使用未批准（pending/rejected）的组件。
            let id = f.positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("state set-review requires a package id".to_string())
            })?;
            let status = f.get("status").unwrap_or("");
            if !["pending", "approved", "rejected"].contains(&status) {
                return Err(ForgeError::InvalidManifest(
                    "state set-review requires --status pending|approved|rejected".to_string(),
                ));
            }
            let mut state = load_state(&home);
            let rec = state
                .get("agents")
                .and_then(|a| a.get(id))
                .cloned()
                .ok_or_else(|| ForgeError::PackageNotFound(format!("未安装：{id}")))?;
            let kind = rec.get("kind").and_then(|k| k.as_str()).unwrap_or("agent");
            if kind == "agent" && status == "pending" {
                return Err(ForgeError::InvalidManifest(
                    "官方/管线安装的 Agent 由发布者信任决定审核状态，不支持手动退回 pending。"
                        .to_string(),
                ));
            }
            state["agents"][id]["reviewStatus"] = serde_json::json!(status);
            state["agents"][id]["reviewedAt"] = serde_json::json!(iso_utc_colon());
            save_state(&home, &state)?;
            return print_json(&serde_json::json!({
                "id": id,
                "reviewStatus": status,
                "note": format!("审核状态已更新为 {status}；组合安装与更新将按此状态放行或拒绝。")
            }));
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown state subcommand '{sub}'"
        ))),
    }
}

fn remove_any(p: &Path) -> Result<(), ForgeError> {
    match fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(p).map_err(ForgeError::Io),
        Ok(_) => fs::remove_file(p).map_err(ForgeError::Io),
        Err(_) => Ok(()),
    }
}

fn print_install_failure(fail: &InstallFailure) -> ! {
    let envelope = serde_json::json!({
        "code": fail.code,
        "human": fail.message,
        "technical": fail.message,
        "recovery": "",
        "steps": fail.steps,
        "rollbackError": fail.rollback_error,
    });
    eprintln!(
        "{}",
        serde_json::to_string_pretty(&envelope).unwrap_or_default()
    );
    exit(1)
}

fn resolve_bin(flag: Option<&str>) -> Result<String, ForgeError> {
    if let Some(b) = flag {
        return Ok(b.to_string());
    }
    locate_dsh()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| {
            ForgeError::RuntimeFailed(
                "找不到 dsh。请设置 AGENTHUB_DSH_BIN 指向 dsh 可执行文件。".to_string(),
            )
        })
}

fn default_profile(pkg: &forge_core::model::Package, flag: Option<&str>) -> String {
    if let Some(p) = flag {
        return p.to_string();
    }
    let name = pkg.runtime.profile.name.clone();
    if name.is_empty() {
        pkg.id.clone()
    } else {
        name
    }
}

fn run_install(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let agent_dir = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("install requires an agent directory".to_string())
    })?;
    let agent_dir_path = PathBuf::from(agent_dir);
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let bin = resolve_bin(f.get("bin"))?;
    let profile = default_profile(
        &load_legacy_agent_dir_strict(&agent_dir_path)?,
        f.get("profile"),
    );
    let req = InstallRequest {
        agent_dir: agent_dir_path,
        home,
        bin,
        profile_name: profile,
        trust: f.get("trust").map(String::from),
        smoke: f.get("smoke").is_some(),
    };
    match install(&req) {
        Ok(r) => {
            let _ = append_install_log(&r.manifest.id, &r.manifest.version, true, &r.steps, None);
            print_json(&r)
        }
        Err(fail) => {
            let _ = append_install_log(
                "(unknown)",
                "(unknown)",
                false,
                &fail.steps,
                Some(&fail.code),
            );
            print_install_failure(&fail)
        }
    }
}

fn run_rollback(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let id = f
        .positional
        .first()
        .ok_or_else(|| ForgeError::InvalidManifest("rollback requires a package id".to_string()))?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let out = rollback(&home, id)?;
    print_json(&out)
}

fn run_catalog_plugin(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let name = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("catalog-plugin requires a plugin name".to_string())
    })?;
    let source = f.get("source").ok_or_else(|| {
        ForgeError::InvalidManifest("catalog-plugin requires --source".to_string())
    })?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let bin = resolve_bin(f.get("bin"))?;
    let profile = f.get("profile").unwrap_or("plugins");
    match install_catalog_plugin(name, source, &home, &bin, profile) {
        Ok(v) => print_json(&v),
        Err(fail) => print_install_failure(&fail),
    }
}

/// 从 LICENSE 文本识别 SPDX（与 Node 侧 curate-ecosystem 一致的模式表）。
fn spdx_from_text_rust(text: &str) -> Option<&'static str> {
    if text.contains("Mozilla Public License Version 2.0") {
        return Some("MPL-2.0");
    }
    if text.contains("Apache License, Version 2.0")
        || text.contains(
            "Apache License
Version 2.0",
        )
    {
        return Some("Apache-2.0");
    }
    if text.contains("GNU AFFERO GENERAL PUBLIC LICENSE") {
        return Some("AGPL-3.0");
    }
    if text.contains("GNU GENERAL PUBLIC LICENSE") {
        return Some("GPL-3.0");
    }
    if text.contains("MIT License") || text.contains("Permission is hereby granted, free of charge")
    {
        return Some("MIT");
    }
    if text.contains("BSD 3-Clause")
        || (text.contains("Redistribution and use in source and binary forms")
            && text.contains("Neither the name"))
    {
        return Some("BSD-3-Clause");
    }
    if text.contains("ISC License") {
        return Some("ISC");
    }
    if text.contains("The Unlicense") || text.contains("public domain") {
        return Some("Unlicense");
    }
    None
}

fn registry_import(agent_dir: &Path, registry: &Path) -> Result<(), ForgeError> {
    let mut pkg = load_legacy_agent_dir_strict(agent_dir)?;
    // 真实 license：manifest 缺省时从 agent 目录的 LICENSE 文件识别（不臆造）
    if pkg.license.spdx == "NOASSERTION" || pkg.license.spdx.is_empty() {
        for name in ["LICENSE", "LICENSE.txt", "LICENSE.md", "license", "COPYING"] {
            let lp = agent_dir.join(name);
            if let Ok(text) = fs::read_to_string(&lp) {
                if let Some(spdx) = spdx_from_text_rust(&text) {
                    pkg.license.spdx = spdx.to_string();
                    pkg.license.file = Some(name.to_string());
                    break;
                }
            }
        }
    }
    fs::create_dir_all(registry.join("cache")).map_err(ForgeError::Io)?;
    let tmp_tgz = registry
        .join("cache")
        .join(format!("import-{}-{}.tmp.tgz", pkg.id, pkg.version));
    remove_any(&tmp_tgz)?;
    let st = std::process::Command::new("tar")
        .args(["-czf"])
        .arg(&tmp_tgz)
        .args(["--exclude", "./node_modules", "-C"])
        .arg(agent_dir)
        .arg(".")
        .output()
        .map_err(ForgeError::Io)?;
    if !st.status.success() {
        return Err(ForgeError::RuntimeFailed(format!(
            "tar failed: {}",
            String::from_utf8_lossy(&st.stderr)
        )));
    }
    let bytes = fs::read(&tmp_tgz).map_err(ForgeError::Io)?;
    let sha = sha256hex(&bytes);
    let final_tgz = registry.join("cache").join(format!("{sha}.tgz"));
    fs::rename(&tmp_tgz, &final_tgz).map_err(ForgeError::Io)?;

    let scan = scan_agent_dir(agent_dir, "community")?;
    let status = if scan.verdict == "block" {
        "BLOCKED"
    } else if scan.verdict == "warn" {
        "WARNING"
    } else {
        "PASS"
    };

    let reg_meta_path = registry.join("registry.json");
    if !reg_meta_path.exists() {
        let meta = serde_json::json!({ "schemaVersion": 1, "id": "local", "name": "Local Forge Registry" });
        fs::write(
            &reg_meta_path,
            serde_json::to_string_pretty(&meta).map_err(ForgeError::Json)? + "\n",
        )
        .map_err(ForgeError::Io)?;
    }

    let pkg_dir = registry.join("packages").join(&pkg.id);
    let ver_dir = pkg_dir.join("versions").join(&pkg.version);
    fs::create_dir_all(&ver_dir).map_err(ForgeError::Io)?;
    // 归一化 Package 不含 schema 字段；写入时注入权威 schema 标识（解析端要求）
    let mut pkg_value = serde_json::to_value(&pkg).map_err(ForgeError::Json)?;
    if let Some(obj) = pkg_value.as_object_mut() {
        obj.insert("schema".to_string(), serde_json::json!("forge.package.v1"));
    }
    let pkg_json = serde_json::to_string_pretty(&pkg_value).map_err(ForgeError::Json)?;
    fs::write(pkg_dir.join("package.json"), format!("{pkg_json}\n")).map_err(ForgeError::Io)?;
    fs::write(ver_dir.join("manifest.json"), format!("{pkg_json}\n")).map_err(ForgeError::Io)?;
    let artifact = serde_json::json!({
        "filename": format!("{}-{}.tar.gz", pkg.id, pkg.version),
        "sha256": sha,
        "size": bytes.len(),
        "url": format!("cache/{sha}.tgz"),
    });
    fs::write(
        ver_dir.join("artifact.json"),
        serde_json::to_string_pretty(&artifact).map_err(ForgeError::Json)? + "\n",
    )
    .map_err(ForgeError::Io)?;
    let security = serde_json::json!({
        "status": status,
        "scan": "required",
        "scannedAt": iso_utc_colon(),
        "findings": scan.findings,
    });
    fs::write(
        ver_dir.join("security.json"),
        serde_json::to_string_pretty(&security).map_err(ForgeError::Json)? + "\n",
    )
    .map_err(ForgeError::Io)?;
    let compat = serde_json::json!({
        "forge": pkg.compatibility.forge,
        "dsh": { "min": pkg.compatibility.dsh.min, "tested": pkg.compatibility.dsh.tested },
        "node": pkg.compatibility.node,
        "platform": pkg.compatibility.platform,
    });
    fs::write(
        ver_dir.join("compatibility.json"),
        serde_json::to_string_pretty(&compat).map_err(ForgeError::Json)? + "\n",
    )
    .map_err(ForgeError::Io)?;
    let out = serde_json::json!({ "id": pkg.id, "version": pkg.version, "sha256": sha, "registry": registry });
    print_json(&out)
}

fn load_publisher_key(registry: &Path, publisher_id: &str) -> Result<String, ForgeError> {
    let path = registry.join("publishers.json");
    let text = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            ForgeError::PublisherUntrusted("publishers.json not found in registry".to_string())
        } else {
            ForgeError::Io(e)
        }
    })?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(ForgeError::Json)?;
    let obj = v.as_object().ok_or_else(|| {
        ForgeError::PublisherUntrusted("publishers.json must be an object".to_string())
    })?;
    let entry = obj
        .get(publisher_id)
        .or_else(|| obj.get("publishers").and_then(|p| p.get(publisher_id)))
        .ok_or_else(|| {
            ForgeError::PublisherUntrusted(format!("no public key for publisher '{publisher_id}'"))
        })?;
    entry
        .get("publicKey")
        .or_else(|| entry.get("public_key"))
        .and_then(|k| k.as_str())
        .or_else(|| entry.as_str())
        .map(String::from)
        .ok_or_else(|| {
            ForgeError::PublisherUntrusted(format!(
                "public key format invalid for '{publisher_id}'"
            ))
        })
}

fn run_install_from_registry(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let id = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("install-from-registry requires a package id".to_string())
    })?;
    let registry_path = f
        .get("registry")
        .map(PathBuf::from)
        .ok_or_else(|| ForgeError::InvalidManifest("--registry required".to_string()))?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let reg = LocalRegistry::open(registry_path.clone());
    let version = match f.get("version") {
        Some(v) => v.to_string(),
        None => reg.get_package(id)?.version.clone(),
    };
    let pv = reg.get_version(id, &version)?;
    let artifact = pv.artifact.clone().ok_or_else(|| {
        ForgeError::ArtifactNotFound(format!("artifact metadata missing for {id}@{version}"))
    })?;
    let artifact_path = match &artifact.url {
        Some(url) => registry_path.join(url),
        None => registry_path.join("cache").join(&artifact.filename),
    };
    let bytes = fs::read(&artifact_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            ForgeError::ArtifactNotFound(format!("{}", artifact_path.display()))
        } else {
            ForgeError::Io(e)
        }
    })?;
    let actual = sha256hex(&bytes);
    let expected = artifact.sha256.as_deref().unwrap_or("");
    if expected.is_empty() || actual != expected {
        return Err(ForgeError::HashMismatch {
            expected: expected.to_string(),
            actual,
        });
    }

    let mut warning: Option<String> = None;
    if let Some(sig) = &artifact.signature {
        let manifest_path = registry_path
            .join("packages")
            .join(id)
            .join("versions")
            .join(&version)
            .join("manifest.json");
        let manifest_text = fs::read_to_string(&manifest_path).map_err(ForgeError::Io)?;
        // Node 签名负载 = JSON.stringify(manifest 对象)（紧凑、保持插入序）；
        // 解析后紧凑重序列化以复现同一文本（preserve_order 保序）。
        let manifest_value: serde_json::Value =
            serde_json::from_str(&manifest_text).map_err(ForgeError::Json)?;
        let manifest_compact = serde_json::to_string(&manifest_value).map_err(ForgeError::Json)?;
        let key = load_publisher_key(&registry_path, &pv.package.publisher.id)?;
        let payload = canonical_payload(&manifest_compact, &actual);
        if !verify_payload(&key, &payload, sig) {
            return Err(ForgeError::SignatureInvalid(format!("{id}@{version}")));
        }
    } else {
        warning = Some("unsigned artifact: signature verification skipped".to_string());
    }

    let unpack = home
        .join(".agenthub")
        .join("fetch")
        .join(format!("{id}-{version}"));
    remove_any(&unpack)?;
    fs::create_dir_all(&unpack).map_err(ForgeError::Io)?;
    let st = std::process::Command::new("tar")
        .args(["-xzf"])
        .arg(&artifact_path)
        .arg("-C")
        .arg(&unpack)
        .output()
        .map_err(ForgeError::Io)?;
    if !st.status.success() {
        return Err(ForgeError::RuntimeFailed(format!(
            "解包失败: {}",
            String::from_utf8_lossy(&st.stderr)
        )));
    }

    let bin = resolve_bin(f.get("bin"))?;
    let profile = default_profile(&pv.package, f.get("profile"));
    let req = InstallRequest {
        agent_dir: unpack,
        home,
        bin,
        profile_name: profile,
        trust: f.get("trust").map(String::from),
        smoke: f.get("smoke").is_some(),
    };
    match install(&req) {
        Ok(r) => {
            let _ = append_install_log(id, &version, true, &r.steps, None);
            let out = serde_json::json!({
                "result": r,
                "registry": registry_path,
                "id": id,
                "version": version,
                "warning": warning,
            });
            print_json(&out)
        }
        Err(fail) => {
            let _ = append_install_log(id, &version, false, &fail.steps, Some(&fail.code));
            print_install_failure(&fail)
        }
    }
}

fn run_import(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("import requires a subcommand (analyze)".to_string())
    })?;
    if sub != "analyze" {
        return Err(ForgeError::InvalidManifest(format!(
            "unknown import subcommand '{sub}'"
        )));
    }
    let source = args.get(1).ok_or_else(|| {
        ForgeError::InvalidManifest(
            "import analyze requires a source: a local directory or a github URL".to_string(),
        )
    })?;
    let analysis = analyze_source(source)?;
    print_json(&analysis)
}

fn run_adapter(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("adapter requires a subcommand (propose|generate)".to_string())
    })?;
    let source = args.get(1).ok_or_else(|| {
        ForgeError::InvalidManifest(
            "adapter requires a source (directory or github URL)".to_string(),
        )
    })?;
    let analysis = analyze_source(source)?;
    match sub.as_str() {
        "propose" => print_json(&propose(&analysis)?),
        "generate" => {
            let f = Flags::parse(&args[2..]);
            let out = f.get("out").map(PathBuf::from).ok_or_else(|| {
                ForgeError::InvalidManifest("adapter generate requires --out DIR".to_string())
            })?;
            let dir = generate(&analysis, &out)?;
            print_json(&serde_json::json!({ "ok": true, "packageDir": dir }))
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown adapter subcommand '{sub}'"
        ))),
    }
}

/// 递归复制一个目录的内容（文件真实拷贝；官方 bundle 不含符号链接，链接保守跳过并记录）。
fn copy_dir_contents(src: &Path, dst: &Path) -> Result<(), ForgeError> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(ForgeError::Io)?;
    for entry in fs::read_dir(src).map_err(ForgeError::Io)? {
        let entry = entry.map_err(ForgeError::Io)?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let meta = fs::symlink_metadata(&from).map_err(ForgeError::Io)?;
        if meta.is_dir() {
            copy_dir_contents(&from, &to)?;
        } else if meta.file_type().is_symlink() {
            eprintln!("compose generate: 跳过符号链接 {}", from.display());
        } else {
            fs::copy(&from, &to).map_err(ForgeError::Io)?;
        }
    }
    Ok(())
}

fn run_composer(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("composer requires a subcommand (resolve|generate)".to_string())
    })?;
    let f = Flags::parse(&args[1..]);
    match sub.as_str() {
        "resolve" => {
            // 输入：stdin JSON 数组（ComponentSpec）；输出 ResolveReport
            let mut buf = String::new();
            use std::io::Read;
            std::io::stdin()
                .read_to_string(&mut buf)
                .map_err(ForgeError::Io)?;
            let components: Vec<ComponentSpec> =
                serde_json::from_str(&buf).map_err(ForgeError::Json)?;
            validate_components(&components)?;
            print_json(&resolve_graph(&components)?)
        }
        "generate" => {
            // 真实组合：多个 Agent 组件 → 生成自包含 Agent 目录 → 完整安装管线 → 可运行。
            // 未适配（无运行 bundle）的收录式插件被诚实拒绝，绝不生成不可运行的空壳。
            let name = f.get("name").ok_or_else(|| {
                ForgeError::InvalidManifest("compose generate requires --name".to_string())
            })?;
            let ids: Vec<String> = f
                .get("ids")
                .map(|s| {
                    s.split(',')
                        .map(|x| x.trim().to_string())
                        .filter(|x| !x.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            if ids.len() < 2 {
                return Err(ForgeError::InvalidManifest(
                    "compose generate 至少需要 2 个组件（--ids a,b）".to_string(),
                ));
            }
            let registry = f
                .get("registry")
                .map(PathBuf::from)
                .unwrap_or_else(default_registry_path);
            let home = f
                .get("home")
                .map(PathBuf::from)
                .unwrap_or_else(|| dsh_home(None));
            let reg = LocalRegistry::open(registry.clone());
            let slug = name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>();
            let slug = slug.trim_matches('-').to_string();
            progress_line(&slug, "resolving", 1, 5, None);
            // 收集组件（只允许带运行 bundle 的 Agent）
            let mut bundle_specs: Vec<(String, String)> = Vec::new();
            let mut profile_bundles: Vec<String> = vec![
                "@deepseek-ai/dsh-base".to_string(),
                "@deepseek-ai/dsh-web-app".to_string(),
            ];
            let mut names: Vec<String> = Vec::new();
            for id in &ids {
                let pkg = reg.get_package(id)?;
                if pkg.r#type != forge_core::model::PackageType::Agent {
                    return Err(ForgeError::InvalidManifest(format!(
                        "组件 {id} 类型为 {:?}，不是 Agent；暂无法组合为可运行 Agent",
                        pkg.r#type
                    )));
                }
                if pkg.runtime.components.bundles.is_empty()
                    && pkg.runtime.profile.bundles.is_empty()
                {
                    return Err(ForgeError::InvalidManifest(format!(
                        "组件 {id} 尚未适配为可运行 bundle（收录式插件需先经 Adapter 适配，不能伪装成可运行）"
                    )));
                }
                for b in &pkg.runtime.components.bundles {
                    if !bundle_specs.iter().any(|(p2, _)| p2 == &b.package) {
                        bundle_specs.push((
                            b.package.clone(),
                            b.version.clone().unwrap_or_else(|| "0.1.0".to_string()),
                        ));
                    }
                }
                for b in &pkg.runtime.profile.bundles {
                    if !profile_bundles.contains(b) {
                        profile_bundles.push(b.clone());
                    }
                }
                names.push(pkg.name.clone());
            }
            // 生成目录：从 registry 制品解包并拷贝组件 bundle/preset 源码（真实文件）
            let out = f
                .get("out")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".deepseek-forge").join("generated").join(&slug));
            remove_any(&out)?;
            fs::create_dir_all(out.join("bundle")).map_err(ForgeError::Io)?;
            fs::create_dir_all(out.join("preset")).map_err(ForgeError::Io)?;
            progress_line(
                &slug,
                "assembling",
                2,
                5,
                Some(serde_json::json!({ "components": ids })),
            );
            for id in &ids {
                let pkg = reg.get_package(id)?;
                let pv = reg.get_version(id, &pkg.version)?;
                let artifact = pv.artifact.clone().ok_or_else(|| {
                    ForgeError::ArtifactNotFound(format!("{id} 缺少制品，无法组合"))
                })?;
                let artifact_path = match &artifact.url {
                    Some(url) => registry.join(url),
                    None => registry.join("cache").join(&artifact.filename),
                };
                let fetch = out.join(".fetch").join(id);
                remove_any(&fetch)?;
                fs::create_dir_all(&fetch).map_err(ForgeError::Io)?;
                let st = std::process::Command::new("tar")
                    .args(["-xzf"])
                    .arg(&artifact_path)
                    .arg("-C")
                    .arg(&fetch)
                    .output()
                    .map_err(ForgeError::Io)?;
                if !st.status.success() {
                    return Err(ForgeError::RuntimeFailed(format!(
                        "解包失败: {}",
                        String::from_utf8_lossy(&st.stderr)
                    )));
                }
                copy_dir_contents(&fetch.join("bundle"), &out.join("bundle"))?;
                copy_dir_contents(&fetch.join("preset"), &out.join("preset"))?;
            }
            let _ = remove_any(&out.join(".fetch"));
            // agenthub.yaml（官方 Agent 结构，字段来自被组合组件的真实 manifest）
            let bundles_yaml = bundle_specs
                .iter()
                .map(|(p2, v)| format!("    - package: {p2:?}\n      version: {v:?}"))
                .collect::<Vec<_>>()
                .join("\n");
            let profile_yaml = profile_bundles
                .iter()
                .map(|b| format!("{b:?}"))
                .collect::<Vec<_>>()
                .join(", ");
            let yaml = format!(
                "schema: agenthub.dev/agent/v1\n
id: {slug}\n
name: {name}\n
category: 组合 Composed\n
version: 0.1.0\n
description: 由 DeepSeek Forge 组合生成：{names}。\n
publisher:\n
  id: agenthub\n
  name: AgentHub\n
runtime: deepseek-harness\n
compatibility:\n
  dsh:\n
    min: \"0.1.0-rc.6\"\n
    tested: [\"0.1.0-rc.6\"]\n
  node: \">=22\"\n
platform: [darwin, linux]\n
components:\n
  bundles:\n
{bundles_yaml}\n
  presets: []\n
  skills: []\n
profile:\n
  name: {slug}\n
  bundles: [{profile_yaml}]\n
  patch: ./profile.patch.yml\n
permissions:\n
  network: []\n
  env: []\n
secrets: []\n
health:\n
  - kind: dump-config\n
    expect-rows: []\n
updatePolicy: notify\n
trust: official\n",
                names = names.join(" + "),
            );
            fs::write(out.join("agenthub.yaml"), yaml).map_err(ForgeError::Io)?;
            fs::write(out.join("profile.patch.yml"), "[]\n").map_err(ForgeError::Io)?;
            fs::write(
                out.join("README.md"),
                format!(
                    "# {name}\n\n由 DeepSeek Forge 组合生成（Composed by DeepSeek Forge）。\n\n组件：{ids}\n\nProfile：{slug}（dsh --profile {slug}）\n",
                    ids = ids.join(", "),
                ),
            )
            .map_err(ForgeError::Io)?;
            // 完整安装管线（兼容→安全扫描→快照→profile→bundles→presets→merge→state→健康检查）
            progress_line(&slug, "installing", 3, 5, None);
            let bin = resolve_bin(f.get("bin"))?;
            let req = InstallRequest {
                agent_dir: out.clone(),
                home: home.clone(),
                bin,
                profile_name: slug.clone(),
                trust: Some("official".to_string()),
                smoke: f.get("smoke").is_some(),
            };
            match install(&req) {
                Ok(r) => {
                    progress_line(&slug, "health-check", 4, 5, None);
                    let _ = append_install_log(&slug, "0.1.0", true, &r.steps, None);
                    progress_line(&slug, "installed", 5, 5, None);
                    print_json(&serde_json::json!({
                        "agentId": slug,
                        "profile": slug,
                        "dir": out,
                        "components": ids,
                        "profileBundles": profile_bundles,
                        "result": r,
                        "note": format!("组合 Agent 已生成并安装；运行：dsh --profile {slug}（或桌面端 My Agents → Run）。"),
                    }))
                }
                Err(fail) => {
                    let _ =
                        append_install_log(&slug, "0.1.0", false, &fail.steps, Some(&fail.code));
                    print_install_failure(&fail)
                }
            }
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown composer subcommand '{sub}'"
        ))),
    }
}

fn run_runtime(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest(
            "runtime requires a subcommand (status|stop|restart)".to_string(),
        )
    })?;
    match sub.as_str() {
        "status" => {
            let f = Flags::parse(&args[1..]);
            let home = f.get("home").map(PathBuf::from);
            print_json(&runtime_status(home.as_deref())?)
        }
        "stop" => {
            let f = Flags::parse(&args[1..]);
            let pid: u32 = f
                .positional
                .first()
                .and_then(|p| p.parse().ok())
                .ok_or_else(|| {
                    ForgeError::InvalidManifest("runtime stop requires a numeric pid".to_string())
                })?;
            print_json(&serde_json::json!({ "ok": stop_process(pid)?, "pid": pid }))
        }
        "restart" => {
            let f = Flags::parse(&args[1..]);
            let command = f.positional.join(" ");
            if command.trim().is_empty() {
                return Err(ForgeError::InvalidManifest(
                    "runtime restart requires the command line".to_string(),
                ));
            }
            print_json(&serde_json::json!({ "pid": restart_process(&command)? }))
        }
        "run" => {
            let f = Flags::parse(&args[1..]);
            let profile = f.get("profile").ok_or_else(|| {
                ForgeError::InvalidManifest("runtime run requires --profile".to_string())
            })?;
            let port = f.get("port").and_then(|p| p.parse::<u16>().ok());
            let home = f
                .get("home")
                .map(PathBuf::from)
                .unwrap_or_else(|| dsh_home(None));
            let bin = resolve_bin(f.get("bin"))?;
            let (pid, log_file) = run_harness_captured(&bin, profile, port, &home)?;
            print_json(&serde_json::json!({ "pid": pid, "logFile": log_file }))
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown runtime subcommand '{sub}'"
        ))),
    }
}

/// 组合（Bundle）管理：create/list/install/uninstall。
/// Bundle = 依赖组合描述（不重复存储组件源码）；安装/卸载逐组件执行，失败即停。
fn run_bundle(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest(
            "bundle requires a subcommand (create|list|install|uninstall)".to_string(),
        )
    })?;
    let f = Flags::parse(&args[1..]);
    let registry = f
        .get("registry")
        .map(PathBuf::from)
        .unwrap_or_else(default_registry_path);
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let bundles_dir = home.join(".deepseek-forge").join("bundles");

    match sub.as_str() {
        "create" => {
            let name = f.get("name").ok_or_else(|| {
                ForgeError::InvalidManifest("bundle create requires --name".to_string())
            })?;
            let ids: Vec<String> = f
                .get("ids")
                .map(|s| {
                    s.split(',')
                        .map(|x| x.trim().to_string())
                        .filter(|x| !x.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            if ids.len() < 2 {
                return Err(ForgeError::InvalidManifest(
                    "bundle create 至少需要 2 个组件（--ids a,b,c）".to_string(),
                ));
            }
            let reg = LocalRegistry::open(registry.clone());
            for id in &ids {
                reg.get_package(id)
                    .map_err(|_| ForgeError::PackageNotFound(format!("组件不在 Registry：{id}")))?;
            }
            let slug = name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>();
            let slug = slug.trim_matches('-').to_string();
            let dir = bundles_dir.join(&slug);
            fs::create_dir_all(&dir).map_err(ForgeError::Io)?;
            let bundle_json = serde_json::json!({
                "schema": "forge.bundle.v1",
                "id": slug,
                "name": name,
                "type": "bundle",
                "components": ids,
                "createdAt": iso_utc_colon(),
            });
            fs::write(
                dir.join("bundle.json"),
                serde_json::to_string_pretty(&bundle_json).map_err(ForgeError::Json)? + "\n",
            )
            .map_err(ForgeError::Io)?;
            let pkg = serde_json::json!({
                "schema": "forge.package.v1",
                "id": slug,
                "name": name,
                "type": "bundle",
                "version": "0.1.0",
                "description": format!("Bundle: {}", ids.join(", ")),
                "category": "bundle",
                "tags": [],
                "publisher": { "id": "local", "name": "Local" },
                "source": { "type": "forge", "repository": null, "ref": null, "commit": null },
                "upstream": { "repository": null, "author": null, "license": null, "version": null, "url": null, "adapterVersion": null },
                "license": { "spdx": "NOASSERTION", "file": null },
                "compatibility": { "forge": ">=0.4.0", "dsh": { "min": null, "tested": [] }, "node": null, "platform": [] },
                "capabilities": [],
                "permissions": { "network": [], "env": [] },
                "security": { "scan": "required", "status": "UNKNOWN", "scannedAt": null, "findings": [] },
                "artifact": { "filename": "", "sha256": null, "signature": null, "signatureAlgorithm": "ed25519", "publisherKeyId": null },
                "entrypoint": { "type": "workflow", "profile": null, "command": null, "config": {} },
                "dependencies": ids.iter().map(|id| serde_json::json!({ "package": id, "version": null, "required": true })).collect::<Vec<_>>(),
                "runtime": { "engine": "deepseek-harness", "profile": { "name": slug, "bundles": [], "patch": null }, "components": { "bundles": [], "presets": [], "skills": [] }, "health": [] },
            });
            let pkg_dir = registry.join("packages").join(&slug);
            fs::create_dir_all(&pkg_dir).map_err(ForgeError::Io)?;
            fs::write(
                pkg_dir.join("package.json"),
                serde_json::to_string_pretty(&pkg).map_err(ForgeError::Json)? + "\n",
            )
            .map_err(ForgeError::Io)?;
            print_json(
                &serde_json::json!({ "id": slug, "name": name, "components": ids, "registry": registry }),
            )
        }
        "list" => {
            let mut out = Vec::new();
            if let Ok(rd) = fs::read_dir(&bundles_dir) {
                for e in rd.flatten() {
                    let p = e.path().join("bundle.json");
                    if let Ok(text) = fs::read_to_string(&p) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                            out.push(v);
                        }
                    }
                }
            }
            print_json(&out)
        }
        "install" => {
            let id = f.positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("bundle install requires a bundle id".to_string())
            })?;
            let text = fs::read_to_string(bundles_dir.join(id).join("bundle.json"))
                .map_err(|_| ForgeError::PackageNotFound(format!("bundle 不存在：{id}")))?;
            let b: serde_json::Value = serde_json::from_str(&text).map_err(ForgeError::Json)?;
            let comps: Vec<String> = b
                .get("components")
                .and_then(|c| c.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let mut results = Vec::new();
            let installed_state = load_state(&home);
            for (i, cid) in comps.iter().enumerate() {
                progress_line(
                    id,
                    "component",
                    i + 1,
                    comps.len(),
                    Some(serde_json::json!({ "component": cid })),
                );
                let disabled = installed_state
                    .get("agents")
                    .and_then(|a| a.get(cid))
                    .and_then(|r| r.get("enabled"))
                    .and_then(|v| v.as_bool())
                    == Some(false);
                let rec_opt = installed_state.get("agents").and_then(|a| a.get(cid));
                let review = rec_opt
                    .and_then(|r| r.get("reviewStatus"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(if rec_opt.is_some() {
                        "pending"
                    } else {
                        "approved"
                    });
                if review != "approved" {
                    print_json(&serde_json::json!({
                        "bundle": id,
                        "ok": false,
                        "failedAt": i,
                        "component": cid,
                        "results": results,
                        "note": format!(
                            "安装中止：组件 {cid} 审核状态为 {review}（批准：forge-core state set-review {cid} --status approved）"
                        )
                    }))?;
                    return Ok(());
                }
                if disabled {
                    print_json(&serde_json::json!({
                        "bundle": id,
                        "ok": false,
                        "failedAt": i,
                        "component": cid,
                        "results": results,
                        "note": format!("安装中止：组件 {cid} 已被禁用，请先启用（forge-core state set-enabled {cid} --enabled true）")
                    }))?;
                    return Ok(());
                }
                match package_import_github_or_artifact(cid, &registry, &home) {
                    Ok(v) => {
                        results.push(serde_json::json!({ "id": cid, "ok": true, "result": v }))
                    }
                    Err(e) => {
                        results.push(
                            serde_json::json!({ "id": cid, "ok": false, "error": e.to_string() }),
                        );
                        print_json(&serde_json::json!({
                            "bundle": id,
                            "ok": false,
                            "failedAt": i,
                            "results": results,
                            "note": format!("安装中止：第 {} 个组件失败", i + 1)
                        }))?;
                        return Ok(());
                    }
                }
            }
            print_json(&serde_json::json!({ "bundle": id, "ok": true, "results": results }))
        }
        "uninstall" => {
            let id = f.positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("bundle uninstall requires a bundle id".to_string())
            })?;
            let text = fs::read_to_string(bundles_dir.join(id).join("bundle.json"))
                .map_err(|_| ForgeError::PackageNotFound(format!("bundle 不存在：{id}")))?;
            let b: serde_json::Value = serde_json::from_str(&text).map_err(ForgeError::Json)?;
            let comps: Vec<String> = b
                .get("components")
                .and_then(|c| c.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let mut results = Vec::new();
            for cid in &comps {
                let r = forge_core::installer::rollback(&home, cid);
                results.push(serde_json::json!({
                    "id": cid,
                    "ok": r.is_ok(),
                    "result": r.unwrap_or_else(|e| serde_json::json!({ "error": e.to_string() })),
                }));
            }
            fs::remove_dir_all(bundles_dir.join(id)).map_err(ForgeError::Io)?;
            fs::remove_dir_all(registry.join("packages").join(id)).map_err(ForgeError::Io)?;
            print_json(&serde_json::json!({ "bundle": id, "ok": true, "results": results }))
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown bundle subcommand '{sub}'"
        ))),
    }
}

/// 组件安装：GitHub 源无制品 → 收录式安装；否则报告未支持（诚实）。
fn package_import_github_or_artifact(
    id: &str,
    registry: &Path,
    home: &Path,
) -> Result<serde_json::Value, ForgeError> {
    let pkg = LocalRegistry::open(registry.to_path_buf()).get_package(id)?;
    if pkg.source.r#type == forge_core::model::SourceType::Github
        && pkg.artifact.filename.is_empty()
    {
        package_import_github(id, registry, home)
    } else {
        Err(ForgeError::InvalidManifest(format!(
            "{}：该包需要制品安装管线（后续 STEP 接入）",
            id
        )))
    }
}

/// 配置（Configure）：真实读写已安装 Agent 的 profile cordis.patch.yml（用户覆盖层）。
/// 只对带 profile 的已安装 Agent 开放；收录式组件（未适配）诚实报错。
fn run_agent_config(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("agent-config requires a subcommand (get|set)".to_string())
    })?;
    let f = Flags::parse(&args[1..]);
    let id = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("agent-config requires an agent id".to_string())
    })?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let state = load_state(&home);
    let rec = state
        .get("agents")
        .and_then(|a| a.get(id))
        .cloned()
        .ok_or_else(|| ForgeError::PackageNotFound(format!("未安装：{id}")))?;
    let profile = rec.get("profile").and_then(|v| v.as_str()).ok_or_else(|| {
        ForgeError::InvalidManifest(format!(
            "{id} 没有可配置的 profile（收录式组件待 Adapter 适配后开放配置）"
        ))
    })?;
    let patch_path = forge_core::dsh::profile_dir(&home, profile).join("cordis.patch.yml");
    match sub.as_str() {
        "get" => {
            let text = if patch_path.exists() {
                fs::read_to_string(&patch_path).map_err(ForgeError::Io)?
            } else {
                String::new()
            };
            print_json(&serde_json::json!({
                "id": id,
                "profile": profile,
                "path": patch_path,
                "text": text,
            }))
        }
        "set" => {
            let text = String::from_utf8(read_stdin()?)
                .map_err(|e| ForgeError::InvalidManifest(format!("配置必须是 UTF-8 文本: {e}")))?;
            if let Some(parent) = patch_path.parent() {
                fs::create_dir_all(parent).map_err(ForgeError::Io)?;
            }
            fs::write(&patch_path, &text).map_err(ForgeError::Io)?;
            print_json(&serde_json::json!({
                "id": id,
                "profile": profile,
                "path": patch_path,
                "saved": true,
                "note": "配置已写入 profile cordis.patch.yml（用户覆盖层，可自由编辑）；重启 dsh 生效。"
            }))
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown agent-config subcommand '{sub}'"
        ))),
    }
}

fn run_logs(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("logs requires a subcommand (list)".to_string())
    })?;
    if sub != "list" {
        return Err(ForgeError::InvalidManifest(format!(
            "unknown logs subcommand '{sub}'"
        )));
    }
    print_json(&list_logs())
}

fn run_search(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let query = f
        .positional
        .first()
        .cloned()
        .unwrap_or_default()
        .to_lowercase();
    let (registry, _) = parse_registry(&args[1..]);
    let packages = LocalRegistry::open(registry).list_packages()?;
    let hits: Vec<&PackageSummary> = packages
        .iter()
        .filter(|p| {
            query.is_empty()
                || p.id.to_lowercase().contains(&query)
                || p.name.to_lowercase().contains(&query)
                || p.description.to_lowercase().contains(&query)
        })
        .collect();
    print_json(&hits)
}

fn run_update(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("update requires a subcommand (check|apply)".to_string())
    })?;
    let f = Flags::parse(&args[1..]);
    let registry = f
        .get("registry")
        .map(PathBuf::from)
        .ok_or_else(|| ForgeError::InvalidManifest(format!("update {sub} requires --registry")))?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    match sub.as_str() {
        "check" => {
            let entries = check_updates(&home, &LocalRegistry::open(registry))?;
            print_json(&entries)
        }
        "apply" => {
            // 真实更新：plugin/imported → 重新收录（克隆→扫描→登记新版本）；
            // 带制品的 agent → 走 install-from-registry 完整管线（校验→快照→安装→健康，失败自动回滚）。
            let id = f.positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("update apply requires a package id".to_string())
            })?;
            let reg = LocalRegistry::open(registry.clone());
            let state = load_state(&home);
            let rec = state
                .get("agents")
                .and_then(|a| a.get(id))
                .cloned()
                .ok_or_else(|| ForgeError::PackageNotFound(format!("未安装：{id}")))?;
            let kind = rec
                .get("kind")
                .and_then(|k| k.as_str())
                .unwrap_or("agent")
                .to_string();
            let imported = rec
                .get("imported")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let installed = rec
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let pkg = reg.get_package(id)?;
            if kind == "plugin" && rec.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
                return Err(ForgeError::InvalidManifest(format!(
                    "插件 {id} 已被禁用：请先启用（forge-core state set-enabled {id} --enabled true）"
                )));
            }
            let review =
                rec.get("reviewStatus")
                    .and_then(|v| v.as_str())
                    .unwrap_or(if kind == "plugin" {
                        "pending"
                    } else {
                        "approved"
                    });
            if review != "approved" {
                let msg = if review == "rejected" {
                    format!("插件 {id} 已被拒绝：更新被阻止。")
                } else {
                    format!(
                        "插件 {id} 待审核：请先批准（forge-core state set-review {id} --status approved）"
                    )
                };
                return Err(ForgeError::InvalidManifest(msg));
            }
            if !forge_core::updater::semver_lt(&installed, &pkg.version) {
                return print_json(&serde_json::json!({
                    "id": id,
                    "updated": false,
                    "installed": installed,
                    "latest": pkg.version,
                    "note": "已是最新版本"
                }));
            }
            if kind == "plugin" && imported {
                let res = package_import_github(id, &registry, &home)?;
                return print_json(&serde_json::json!({
                    "id": id,
                    "updated": true,
                    "from": installed,
                    "to": pkg.version,
                    "kind": "plugin",
                    "imported": res
                }));
            }
            // artifact 包：子进程走与 CLI 相同的 install-from-registry（保留其错误信封语义）
            let self_bin = std::env::current_exe().map_err(ForgeError::Io)?;
            let out = std::process::Command::new(&self_bin)
                .args([
                    "install-from-registry",
                    id,
                    "--registry",
                    &registry.to_string_lossy(),
                    "--home",
                    &home.to_string_lossy(),
                ])
                .output()
                .map_err(ForgeError::Io)?;
            if !out.status.success() {
                let raw = String::from_utf8_lossy(&out.stderr);
                let env: serde_json::Value = serde_json::from_str(&raw).unwrap_or_else(
                    |_| serde_json::json!({ "code": "UPDATE_FAILED", "human": raw.trim() }),
                );
                return Err(ForgeError::RuntimeFailed(
                    env.get("human")
                        .and_then(|h| h.as_str())
                        .unwrap_or("安装失败（详见日志）")
                        .to_string(),
                ));
            }
            let inner: serde_json::Value =
                serde_json::from_slice(&out.stdout).map_err(ForgeError::Json)?;
            print_json(&serde_json::json!({
                "id": id,
                "updated": true,
                "from": installed,
                "to": pkg.version,
                "kind": "agent",
                "install": inner
            }))
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown update subcommand '{sub}'"
        ))),
    }
}

/// STEP 9: 反向依赖追踪 —— 谁在使用这个包（已装插件的依赖声明 + 组合 Bundle）。
/// 只读扫描 state.json 与 bundles 目录，不猜测、不编造。
fn run_dependents(args: &[String]) -> Result<(), ForgeError> {
    let f = Flags::parse(args);
    let id = f.positional.first().ok_or_else(|| {
        ForgeError::InvalidManifest("dependents requires a package id".to_string())
    })?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let mut out: Vec<serde_json::Value> = Vec::new();
    let state = load_state(&home);
    if let Some(agents) = state.get("agents").and_then(|a| a.as_object()) {
        for (other, rec) in agents {
            if other == id {
                continue;
            }
            if let Some(deps) = rec.get("dependencies").and_then(|d| d.as_object()) {
                if let Some(req) = deps.get(id) {
                    out.push(serde_json::json!({
                        "kind": rec.get("kind").and_then(|k| k.as_str()).unwrap_or("plugin"),
                        "id": other,
                        "requires": req.as_str().unwrap_or("any")
                    }));
                }
            }
        }
    }
    let bundles_dir = home.join(".deepseek-forge").join("bundles");
    if bundles_dir.exists() {
        for entry in fs::read_dir(&bundles_dir).map_err(ForgeError::Io)? {
            let entry = entry.map_err(ForgeError::Io)?;
            let bf = entry.path().join("bundle.json");
            let Ok(text) = fs::read_to_string(&bf) else {
                continue;
            };
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            let comps: Vec<&str> = v
                .get("components")
                .and_then(|c| c.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
                .unwrap_or_default();
            if comps.iter().any(|c| *c == id.as_str()) {
                out.push(serde_json::json!({
                    "kind": "bundle",
                    "id": entry.file_name().to_string_lossy(),
                    "requires": "any"
                }));
            }
        }
    }
    print_json(&serde_json::json!({ "id": id, "dependents": out }))
}

fn print_usage() {
    eprintln!(
        r#"forge-core - DeepSeek Forge core (read-only)

USAGE:
  forge-core registry list [--registry PATH]
  forge-core registry info ID [--registry PATH]
  forge-core package validate FILE-OR-DIR
  forge-core package inspect ID [--registry PATH]
  forge-core sign keygen [--home DIR] [--stdout-only]
  forge-core sign sha256 --stdin
  forge-core sign canonical --manifest-json TEXT --sha256 HEX
  forge-core sign raw --key PEM --payload-stdin
  forge-core sign verify --public-key PEM --signature B64 --payload-stdin
  forge-core scan DIR [--trust LEVEL] | scan --stdin --label NAME [--trust LEVEL]
  forge-core state list --home DIR
  forge-core install AGENT-DIR --home DIR [--profile NAME] [--trust LEVEL] [--bin PATH] [--smoke]
  forge-core rollback ID --home DIR      (uninstall = rollback)
  forge-core catalog-plugin NAME --source SRC --home DIR [--bin PATH] [--profile NAME]
  forge-core registry import AGENT-DIR [--registry PATH]
  forge-core install-from-registry ID --registry PATH --home DIR [--version V] [--profile NAME] [--trust LEVEL] [--bin PATH] [--smoke]
  forge-core import analyze DIR-OR-GITHUB-URL
  forge-core adapter propose DIR-OR-GITHUB-URL
  forge-core adapter generate DIR-OR-GITHUB-URL --out DIR
  forge-core composer resolve (stdin: 组件 JSON 数组)
  forge-core runtime status [--home DIR]
  forge-core search QUERY [--registry PATH]
  forge-core update check|apply [ID] --registry PATH [--home DIR]
  forge-core dependents ID [--home DIR]
  forge-core runtime stop PID | runtime restart COMMAND | runtime run --profile NAME [--port N]
  forge-core logs list"#
    );
}
