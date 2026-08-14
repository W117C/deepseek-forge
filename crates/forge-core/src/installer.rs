//! Installer engine, ported 1:1 from lib/installer.mjs (ten-step pipeline,
//! snapshot/auto-rollback, catalog-plugin path). Behavior contract: the existing
//! 18 e2e suites drive this code through the Node delegation bridge.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::dsh::{
    has_pnpm, init_profile, preset_dir, profile_dir, read_manifest, run_dsh, skills_dir,
    write_manifest,
};
use crate::errors::ForgeError;
use crate::logutil::append_security_log;
use crate::manifest::load_legacy_agent_dir_strict;
use crate::model::Package;
use crate::security::{scan_agent_dir, ScanReport};
use crate::snapshot::{iso_utc_colon, restore_snapshot, snapshot, SnapshotInfo};
use crate::state::{load_state, save_state};

/// Serialized install failure (Node \`err.installedSteps\` shape).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallFailure {
    pub code: String,
    pub message: String,
    pub steps: Vec<String>,
    pub rollback_error: Option<String>,
}

impl InstallFailure {
    pub fn new(err: &ForgeError, steps: Vec<String>, rollback_error: Option<String>) -> Self {
        InstallFailure {
            code: err.code().to_string(),
            message: err.to_string(),
            steps,
            rollback_error,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthResult {
    pub kind: String,
    pub passed: bool,
    pub checks: Vec<HealthCheckItem>,
    pub out: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub passed: bool,
    pub results: Vec<HealthResult>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub manifest: Package,
    pub steps: Vec<String>,
    pub scan: ScanReport,
    pub health: HealthReport,
    pub snapshot: SnapshotInfo,
}

#[derive(Clone, Debug)]
pub struct InstallRequest {
    pub agent_dir: PathBuf,
    pub home: PathBuf,
    pub bin: String,
    pub profile_name: String,
    pub trust: Option<String>,
    pub smoke: bool,
}

fn remove_any(p: &Path) -> Result<(), ForgeError> {
    match fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(p).map_err(ForgeError::Io),
        Ok(_) => fs::remove_file(p).map_err(ForgeError::Io),
        Err(_) => Ok(()),
    }
}

/// symlink（unix）或复制（windows）：与 Node cpSync 的跨平台行为对齐。
fn link_or_copy(target: &Path, dst: &Path) -> Result<(), ForgeError> {
    remove_any(dst)?;
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, dst).map_err(ForgeError::Io)
    }
    #[cfg(not(unix))]
    {
        let meta = fs::metadata(target).map_err(ForgeError::Io)?;
        if meta.is_dir() {
            copy_dir(target, dst)
        } else {
            fs::copy(target, dst).map_err(ForgeError::Io).map(|_| ())
        }
    }
}

/// Symlink-preserving recursive copy skipping dot-basename entries.
fn copy_dir_filtered(src: &Path, dst: &Path) -> Result<(), ForgeError> {
    let meta = fs::symlink_metadata(src).map_err(ForgeError::Io)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(src).map_err(ForgeError::Io)?;
        return link_or_copy(&target, dst);
    }
    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(ForgeError::Io)?;
        for entry in fs::read_dir(src).map_err(ForgeError::Io)? {
            let entry = entry.map_err(ForgeError::Io)?;
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            copy_dir_filtered(&entry.path(), &dst.join(&name))?;
        }
    } else {
        fs::copy(src, dst).map_err(ForgeError::Io)?;
    }
    Ok(())
}

/// Symlink-preserving recursive copy (Node cpSync recursive).
fn copy_dir(src: &Path, dst: &Path) -> Result<(), ForgeError> {
    let meta = fs::symlink_metadata(src).map_err(ForgeError::Io)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(src).map_err(ForgeError::Io)?;
        return link_or_copy(&target, dst);
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

/// Node ensureProfile equivalent.
fn ensure_profile(home: &Path, name: &str, bundles: &[String]) -> Result<PathBuf, ForgeError> {
    let dir = profile_dir(home, name);
    if !dir.join("package.json").exists() {
        let filtered: Vec<String> = bundles
            .iter()
            .filter(|b| !b.starts_with("@agenthub/"))
            .cloned()
            .collect();
        init_profile(&dir, &filtered)?;
        let mut m = read_manifest(&dir)?;
        m["dsh"]["profile"]["bundles"] = json!(bundles);
        write_manifest(&dir, &m)?;
    }
    Ok(dir)
}

/// Node installBundleIntoProfile equivalent.
fn install_bundle_into_profile(
    home: &Path,
    bundle_src_dir: &Path,
    package_name: &str,
) -> Result<PathBuf, ForgeError> {
    let mut dest = home.join("profiles").join("node_modules");
    for seg in package_name.split('/') {
        dest = dest.join(seg);
    }
    fs::create_dir_all(dest.parent().unwrap_or(Path::new("."))).map_err(ForgeError::Io)?;
    remove_any(&dest)?;
    copy_dir_filtered(bundle_src_dir, &dest)?;
    Ok(dest)
}

/// Node mergeProfilePatch equivalent (managed-block replacement).
pub fn merge_profile_patch(
    patch_path: &Path,
    agent_id: &str,
    rows_text: &str,
) -> Result<PathBuf, ForgeError> {
    let begin = format!("# --- agenthub managed (begin): {agent_id} ---");
    let end = format!("# --- agenthub managed (end): {agent_id} ---");
    let mut content = fs::read_to_string(patch_path).unwrap_or_default();
    let re = regex::Regex::new(&format!(
        r"{}[\s\S]*?{}\n?",
        regex::escape(&begin),
        regex::escape(&end)
    ))
    .map_err(|e| ForgeError::InvalidManifest(format!("managed-block regex: {e}")))?;
    content = re.replace_all(&content, "").to_string();

    let rows = rows_text
        .split('\n')
        .filter(|l| l.trim() != "[]")
        .collect::<Vec<_>>()
        .join(
            "
",
        )
        .trim()
        .to_string();
    let has_real_rows = rows
        .split('\n')
        .any(|l| !l.trim().is_empty() && !l.trim().starts_with('#'));
    let block = if rows.is_empty() {
        format!(
            "{begin}
{end}
"
        )
    } else {
        format!(
            "{begin}
{rows}
{end}
"
        )
    };
    let effective = content
        .split('\n')
        .filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#'))
        .map(|l| l.trim())
        .collect::<Vec<_>>()
        .join(
            "
",
        );
    if effective.is_empty() || effective == "[]" {
        content = if has_real_rows {
            format!(
                "{begin}
{rows}
{end}
"
            )
        } else {
            format!(
                "[]
{block}"
            )
        };
    } else {
        content = format!(
            "{}

{block}",
            content.trim_end()
        );
    }
    fs::write(patch_path, content).map_err(ForgeError::Io)?;
    Ok(patch_path.to_path_buf())
}

fn manifest_trust(manifest: &Package) -> Option<String> {
    manifest
        .extra
        .get("trust")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

/// Dump-config health check (Node dumpConfigCheck).
fn dump_config_check(
    bin: &str,
    home: &Path,
    profile_name: &str,
    expect_rows: &[String],
) -> HealthResult {
    let r = run_dsh(
        bin,
        &["--profile", profile_name, "--dump-config"],
        home,
        60_000,
    );
    let out = format!("{}{}", r.stdout, r.stderr);
    let mut checks = vec![HealthCheckItem {
        name: "dump-config 退出码 0".to_string(),
        ok: r.status == Some(0),
        detail: format!(
            "exit={}",
            r.status
                .map(|s| s.to_string())
                .unwrap_or_else(|| "null".to_string())
        ),
    }];
    for row_id in expect_rows {
        let re = regex::Regex::new(&format!(r"- id: {}(\n|\r|$)", regex::escape(row_id)));
        let present = match &re {
            Ok(re) => re.is_match(&out) || out.contains(&format!("id: {row_id}")),
            Err(_) => out.contains(&format!("id: {row_id}")),
        };
        checks.push(HealthCheckItem {
            name: format!("组合树含行 {row_id}"),
            ok: present,
            detail: if present {
                String::new()
            } else {
                "未找到".to_string()
            },
        });
    }
    let passed = checks.iter().all(|c| c.ok);
    HealthResult {
        kind: "dump-config".to_string(),
        passed,
        checks,
        out,
    }
}

/// Boot smoke check (Node bootSmokeCheck: 12s, port 3999).
fn boot_smoke_check(bin: &str, home: &Path, profile_name: &str) -> HealthResult {
    let wait_ms: u64 = 12_000;
    let mut child = match std::process::Command::new(bin)
        .args(["--profile", profile_name, "--port", "3999"])
        .env("DSH_HOME", home)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return HealthResult {
                kind: "boot-smoke".to_string(),
                passed: false,
                checks: vec![HealthCheckItem {
                    name: format!("进程存活 {wait_ms}ms"),
                    ok: false,
                    detail: format!("spawn 失败: {e}"),
                }],
                out: String::new(),
            }
        }
    };
    let start = std::time::Instant::now();
    let mut early_exit: Option<Option<i32>> = None;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                early_exit = Some(status.code());
                break;
            }
            Ok(None) => {
                if start.elapsed().as_millis() as u64 >= wait_ms {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(_) => break,
        }
    }
    let alive = early_exit.is_none() && child.try_wait().ok().flatten().is_none();
    let _ = child.kill();
    let _ = child.wait();
    let mut out = String::new();
    let mut err_out = String::new();
    if let Some(mut s) = child.stdout.take() {
        use std::io::Read;
        let _ = s.read_to_string(&mut out);
    }
    if let Some(mut s) = child.stderr.take() {
        use std::io::Read;
        let _ = s.read_to_string(&mut err_out);
    }
    let fatal_re = regex::Regex::new(r"(fatal|FATAL|uncaught|Error:)").unwrap();
    let fatal = fatal_re.is_match(&err_out);
    let checks = if let Some(code) = early_exit {
        vec![HealthCheckItem {
            name: "进程存活".to_string(),
            ok: false,
            detail: format!(
                "提前退出 code={}",
                code.map(|c| c.to_string())
                    .unwrap_or_else(|| "signal".to_string())
            ),
        }]
    } else {
        vec![
            HealthCheckItem {
                name: format!("进程存活 {wait_ms}ms"),
                ok: alive,
                detail: String::new(),
            },
            HealthCheckItem {
                name: "无致命错误日志".to_string(),
                ok: !fatal,
                detail: err_out.lines().take(5).collect::<Vec<_>>().join(" | "),
            },
        ]
    };
    let passed = checks.iter().all(|c| c.ok);
    HealthResult {
        kind: "boot-smoke".to_string(),
        passed,
        checks,
        out: format!("{out}{err_out}")
            .lines()
            .take(20)
            .collect::<Vec<_>>()
            .join(
                "
",
            ),
    }
}

fn run_health(
    bin: &str,
    home: &Path,
    profile_name: &str,
    expect_rows: &[String],
    smoke: bool,
) -> HealthReport {
    let mut results = vec![dump_config_check(bin, home, profile_name, expect_rows)];
    if smoke {
        results.push(boot_smoke_check(bin, home, profile_name));
    }
    let passed = results.iter().all(|r| r.passed);
    HealthReport { passed, results }
}

/// The ten-step install pipeline (Node install()).
pub fn install(req: &InstallRequest) -> Result<InstallResult, InstallFailure> {
    // Node 侧总是传绝对路径（resolve()/fetch 目录）；绝对化保证 pnpm link: 目标可解析，
    // 否则 dsh 对账会因 link 断链把 bundle 从 profile.bundles 里剔除。
    let agent_dir = match fs::canonicalize(&req.agent_dir) {
        Ok(p) => p,
        Err(e) => {
            let err = ForgeError::Io(e);
            return Err(InstallFailure::new(&err, vec![], None));
        }
    };
    let manifest = match load_legacy_agent_dir_strict(&agent_dir) {
        Ok(m) => m,
        Err(e) => return Err(InstallFailure::new(&e, vec![], None)),
    };
    let agent_id = manifest.id.clone();
    let preset_ids: Vec<String> = manifest
        .runtime
        .components
        .presets
        .iter()
        .map(|p| p.id.clone())
        .collect();
    let skill_names: Vec<String> = manifest.runtime.components.skills.clone();
    let mut steps: Vec<String> = Vec::new();

    // 1. compatibility
    steps.push("compatibility".to_string());
    if let Err(e) = check_compatibility(&manifest) {
        return Err(InstallFailure::new(&e, steps, None));
    }

    // 2. security scan
    steps.push("security-scan".to_string());
    let trust = req
        .trust
        .clone()
        .or_else(|| manifest_trust(&manifest))
        .unwrap_or_else(|| "community".to_string());
    let scan = match scan_agent_dir(&agent_dir, &trust) {
        Ok(s) => s,
        Err(e) => return Err(InstallFailure::new(&e, steps, None)),
    };
    if scan.verdict == "block" {
        let _ = append_security_log(&agent_id, scan.score, &scan.verdict, scan.findings.len());
        let e = ForgeError::SecurityBlocked(format!(
            "安全扫描阻断：{} 个高危发现。用 --trust official 仅限官方包；第三方高危包拒绝安装。",
            scan.high
        ));
        return Err(InstallFailure::new(&e, steps, None));
    }
    let _ = append_security_log(&agent_id, scan.score, &scan.verdict, scan.findings.len());

    // 3. snapshot
    steps.push("snapshot".to_string());
    let snap = match snapshot(
        &req.home,
        &agent_id,
        &req.profile_name,
        &preset_ids,
        &skill_names,
    ) {
        Ok(s) => s,
        Err(e) => return Err(InstallFailure::new(&e, steps, None)),
    };

    let inner: Result<InstallResult, ForgeError> = (|| {
        // 4. profile init
        steps.push("init-profile".to_string());
        ensure_profile(
            &req.home,
            &req.profile_name,
            &manifest.runtime.profile.bundles,
        )?;

        // 5. bundles
        steps.push("install-bundles".to_string());
        let pdir = profile_dir(&req.home, &req.profile_name);
        let specs: Vec<(String, PathBuf, Option<String>)> = manifest
            .runtime
            .components
            .bundles
            .iter()
            .map(|b| {
                let pkg_name = b.package.clone();
                let last = pkg_name.split('/').next_back().unwrap_or(&pkg_name);
                let mut bundle_src = agent_dir.join("bundle").join(last);
                if !bundle_src.join("package.json").exists() {
                    let alt = agent_dir.join("bundle");
                    if alt.join("package.json").exists() {
                        bundle_src = alt;
                    }
                }
                if !bundle_src.join("package.json").exists() {
                    return Err(ForgeError::ArtifactNotFound(format!(
                        "找不到 bundle 包目录：{pkg_name}"
                    )));
                }
                Ok((pkg_name, bundle_src, b.version.clone()))
            })
            .collect::<Result<Vec<_>, ForgeError>>()?;

        let use_official = has_pnpm();
        let mut m = read_manifest(&pdir)?;
        if use_official {
            for (pkg_name, bundle_src, _) in &specs {
                m["dependencies"][pkg_name] = json!(format!("link:{}", bundle_src.display()));
            }
            write_manifest(&pdir, &m)?;
            let r = run_dsh(
                &req.bin,
                &[
                    "plugin",
                    "--profile",
                    req.profile_name.as_str(),
                    "install",
                    "--no-frozen-lockfile",
                ],
                &req.home,
                300_000,
            );
            if r.status != Some(0) {
                let src = if r.stderr.trim().is_empty() {
                    &r.stdout
                } else {
                    &r.stderr
                };
                let tail = src
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .rev()
                    .take(20)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join(
                        "
",
                    );
                return Err(ForgeError::RuntimeFailed(format!(
                    "dsh plugin install 失败:
{tail}"
                )));
            }
        } else {
            for (pkg_name, bundle_src, version) in &specs {
                install_bundle_into_profile(&req.home, bundle_src, pkg_name)?;
                let bundles = m["dsh"]["profile"]["bundles"]
                    .as_array_mut()
                    .ok_or_else(|| ForgeError::InvalidManifest("profile bundles missing".into()))?;
                if !bundles
                    .iter()
                    .any(|v| v.as_str() == Some(pkg_name.as_str()))
                {
                    bundles.push(json!(pkg_name));
                }
                m["dependencies"][pkg_name] =
                    json!(version.clone().unwrap_or_else(|| "0.0.0".to_string()));
            }
            write_manifest(&pdir, &m)?;
        }

        // 6. presets
        steps.push("install-presets".to_string());
        for p in &manifest.runtime.components.presets {
            let mut from = agent_dir.join("preset").join(&p.id);
            if !from.join("agent.cordis.yml").exists() {
                let alt = agent_dir.join("preset");
                if alt.join("agent.cordis.yml").exists() {
                    from = alt;
                }
            }
            if !from.join("agent.cordis.yml").exists() {
                return Err(ForgeError::InvalidManifest(format!(
                    "找不到 preset 组合文件：{}",
                    p.id
                )));
            }
            let dst = preset_dir(&req.home, &p.id);
            remove_any(&dst)?;
            copy_dir(&from, &dst)?;
        }

        // 7. skills
        steps.push("install-skills".to_string());
        for name in &skill_names {
            let candidates = [
                agent_dir.join("skills").join(name),
                agent_dir.join("preset").join("skills").join(name),
                agent_dir
                    .join("preset")
                    .join(preset_ids.first().map(String::as_str).unwrap_or(""))
                    .join("skills")
                    .join(name),
            ];
            let src = candidates
                .iter()
                .find(|s| s.join("SKILL.md").exists())
                .ok_or_else(|| ForgeError::ArtifactNotFound(format!("找不到 skill：{name}")))?;
            let dst = skills_dir(&req.home, name);
            remove_any(&dst)?;
            copy_dir(src, &dst)?;
        }

        // 8. patch merge
        steps.push("merge-patch".to_string());
        if let Some(patch_file) = &manifest.runtime.profile.patch {
            let rows_text =
                fs::read_to_string(agent_dir.join(patch_file)).map_err(ForgeError::Io)?;
            merge_profile_patch(
                &profile_dir(&req.home, &req.profile_name).join("cordis.patch.yml"),
                &agent_id,
                &rows_text,
            )?;
        }

        // 9. state
        steps.push("save-state".to_string());
        let mut state = load_state(&req.home);
        state["agents"][&agent_id] = json!({
            "version": manifest.version,
            "profile": req.profile_name,
            "installedAt": iso_utc_colon(),
            "snapshot": { "ts": snap.ts, "snapDir": snap.snap_dir.to_string_lossy() },
            "presetIds": preset_ids.clone(),
            "skillNames": skill_names.clone(),
            "bundles": manifest.runtime.components.bundles.iter().map(|b| json!({"package": b.package, "version": b.version})).collect::<Vec<_>>(),
            "permissions": { "network": manifest.permissions.network, "env": manifest.permissions.env },
            "trust": trust,
            "score": scan.score,
        });
        save_state(&req.home, &state)?;

        // 10. health
        steps.push("health-check".to_string());
        let expect_rows: Vec<String> = manifest
            .runtime
            .health
            .iter()
            .flat_map(|h| h.expect_rows.clone())
            .collect();
        let health = run_health(
            &req.bin,
            &req.home,
            &req.profile_name,
            &expect_rows,
            req.smoke,
        );

        Ok(InstallResult {
            manifest: manifest.clone(),
            steps: steps.clone(),
            scan: scan.clone(),
            health,
            snapshot: snap.clone(),
        })
    })();

    match inner {
        Ok(r) => Ok(r),
        Err(err) => {
            let rb = restore_snapshot(
                &req.home,
                &agent_id,
                &snap.ts,
                &req.profile_name,
                &preset_ids,
                &skill_names,
            )
            .err()
            .map(|e| e.to_string());
            Err(InstallFailure::new(&err, steps, rb))
        }
    }
}

fn check_compatibility(manifest: &Package) -> Result<(), ForgeError> {
    let need = manifest
        .compatibility
        .node
        .clone()
        .unwrap_or_else(|| ">=20".to_string());
    let min: u32 = need
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(20);
    let node_major = current_node_major();
    if node_major < min {
        return Err(ForgeError::IncompatibleVersion(format!(
            "Node {node_major} 不满足 {need}"
        )));
    }
    Ok(())
}

fn current_node_major() -> u32 {
    match std::process::Command::new("node").arg("--version").output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .trim()
            .trim_start_matches('v')
            .split('.')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        _ => 0,
    }
}

/// Restore the latest snapshot for an installed agent (Node rollback).
/// 收录式插件（kind=plugin 且 imported=true）没有快照：卸载 = 移除状态登记。
pub fn rollback(home: &Path, agent_id: &str) -> Result<Value, ForgeError> {
    let mut state = load_state(home);
    let rec = state
        .get("agents")
        .and_then(|a| a.get(agent_id))
        .ok_or_else(|| ForgeError::PackageNotFound(format!("未安装：{agent_id}")))?;
    if rec.get("kind").and_then(|k| k.as_str()) == Some("plugin")
        && rec.get("imported").and_then(|v| v.as_bool()) == Some(true)
    {
        if let Some(agents) = state.get_mut("agents").and_then(|a| a.as_object_mut()) {
            agents.remove(agent_id);
        }
        save_state(home, &state)?;
        return Ok(json!({
            "agentId": agent_id,
            "restored": "import-removed",
            "state": null
        }));
    }
    let ts = rec
        .get("snapshot")
        .and_then(|s| s.get("ts"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| ForgeError::InvalidManifest("snapshot.ts missing".to_string()))?;
    let profile = rec
        .get("profile")
        .and_then(|p| p.as_str())
        .unwrap_or(agent_id)
        .to_string();
    let preset_ids: Vec<String> = rec
        .get("presetIds")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let skill_names: Vec<String> = rec
        .get("skillNames")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    restore_snapshot(home, agent_id, ts, &profile, &preset_ids, &skill_names)?;
    let state2 = load_state(home);
    Ok(json!({
        "agentId": agent_id,
        "restored": ts,
        "state": state2.get("agents").and_then(|a| a.get(agent_id))
    }))
}

/// Community catalog plugin install (Node installCatalogPlugin).
pub fn install_catalog_plugin(
    name: &str,
    source: &str,
    home: &Path,
    bin: &str,
    profile_name: &str,
) -> Result<Value, InstallFailure> {
    let snap = match snapshot(home, name, profile_name, &[], &[]) {
        Ok(s) => s,
        Err(e) => return Err(InstallFailure::new(&e, vec![], None)),
    };
    let inner: Result<(), ForgeError> = (|| {
        ensure_profile(home, profile_name, &["@deepseek-ai/dsh-base".to_string()])?;
        let r = run_dsh(
            bin,
            &["plugin", "--profile", profile_name, "add", source],
            home,
            300_000,
        );
        if r.status != Some(0) {
            let src = if r.stderr.trim().is_empty() {
                &r.stdout
            } else {
                &r.stderr
            };
            let tail = src
                .lines()
                .filter(|l| !l.trim().is_empty())
                .rev()
                .take(3)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" | ");
            return Err(ForgeError::RuntimeFailed(format!(
                "dsh plugin add 失败: {tail}"
            )));
        }
        let mut state = load_state(home);
        state["agents"][name] = json!({
            "kind": "plugin",
            "source": source,
            "profile": profile_name,
            "installedAt": iso_utc_colon(),
            "snapshot": { "ts": snap.ts, "snapDir": snap.snap_dir.to_string_lossy() },
            "presetIds": [], "skillNames": [], "bundles": [],
            "trust": "community",
            "permissions": { "network": [], "env": [] },
        });
        save_state(home, &state)?;
        Ok(())
    })();
    match inner {
        Ok(()) => Ok(json!({
            "name": name,
            "profile": profile_name,
            "snapshot": { "ts": snap.ts, "snapDir": snap.snap_dir.to_string_lossy() }
        })),
        Err(e) => {
            let rb = restore_snapshot(home, name, &snap.ts, profile_name, &[], &[])
                .err()
                .map(|x| x.to_string());
            Err(InstallFailure::new(&e, vec![], rb))
        }
    }
}
