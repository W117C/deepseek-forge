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
use forge_core::runtime::{restart_process, runtime_status, stop_process};
use forge_core::security::{scan_agent_dir, scan_text_report};
use forge_core::signing::{canonical_payload, keygen, sha256hex, sign_payload, verify_payload};
use forge_core::snapshot::iso_utc_colon;
use forge_core::state::load_state;
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
        "logs" => run_logs(&args[1..]),
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
                "package requires a subcommand (validate|inspect)".to_string(),
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
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown package subcommand '{sub}'"
        ))),
    }
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
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&keys_path, fs::Permissions::from_mode(0o600))
                .map_err(ForgeError::Io)?;
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
                "state requires a subcommand (list)".to_string(),
            ))
        }
    };
    if sub == "list" {
        let f = Flags::parse(&args[1..]);
        let home = f
            .get("home")
            .map(PathBuf::from)
            .unwrap_or_else(|| dsh_home(None));
        let state = load_state(&home);
        return print_json(&state);
    }
    Err(ForgeError::InvalidManifest(format!(
        "unknown state subcommand '{sub}'"
    )))
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

fn registry_import(agent_dir: &Path, registry: &Path) -> Result<(), ForgeError> {
    let pkg = load_legacy_agent_dir_strict(agent_dir)?;
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

fn run_composer(args: &[String]) -> Result<(), ForgeError> {
    let sub = args.first().ok_or_else(|| {
        ForgeError::InvalidManifest("composer requires a subcommand (resolve)".to_string())
    })?;
    if sub != "resolve" {
        return Err(ForgeError::InvalidManifest(format!(
            "unknown composer subcommand '{sub}'"
        )));
    }
    // 输入：stdin JSON 数组（ComponentSpec）；输出 ResolveReport
    let mut buf = String::new();
    use std::io::Read;
    std::io::stdin()
        .read_to_string(&mut buf)
        .map_err(ForgeError::Io)?;
    let components: Vec<ComponentSpec> = serde_json::from_str(&buf).map_err(ForgeError::Json)?;
    validate_components(&components)?;
    print_json(&resolve_graph(&components)?)
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
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown runtime subcommand '{sub}'"
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
        ForgeError::InvalidManifest("update requires a subcommand (check)".to_string())
    })?;
    if sub != "check" {
        return Err(ForgeError::InvalidManifest(format!(
            "unknown update subcommand '{sub}'"
        )));
    }
    let f = Flags::parse(&args[1..]);
    let registry = f.get("registry").map(PathBuf::from).ok_or_else(|| {
        ForgeError::InvalidManifest("update check requires --registry".to_string())
    })?;
    let home = f
        .get("home")
        .map(PathBuf::from)
        .unwrap_or_else(|| dsh_home(None));
    let entries = check_updates(&home, &LocalRegistry::open(registry))?;
    print_json(&entries)
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
  forge-core update check --registry PATH [--home DIR]
  forge-core runtime stop PID | runtime restart COMMAND
  forge-core logs list"#
    );
}
