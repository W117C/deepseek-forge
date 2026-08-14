//! Phase 4: open-source repository analyzer (Local-first).
//!
//! Discovers and classifies GitHub open-source AI projects without executing
//! third-party code: license detection, dependency/entrypoint discovery,
//! capability and danger probing, and a Forge package-type classification.
//! Network fetching is out of scope in this phase; a github.com URL is parsed
//! and must resolve to an already-cloned local copy (or a local directory).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::errors::ForgeError;
use crate::security::{scan_agent_dir, scan_text, ScanReport};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryAnalysis {
    pub source: String,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub language: Option<String>,
    pub package_managers: Vec<String>,
    pub entry_point: Option<String>,
    pub readme: Option<String>,
    pub license: Option<String>,
    pub license_missing: bool,
    pub dependencies: Vec<String>,
    pub executable_files: Vec<String>,
    pub install_scripts: Vec<String>,
    pub network_usage: Vec<String>,
    pub filesystem_usage: Vec<String>,
    pub env_vars: Vec<String>,
    pub secrets_found: Vec<String>,
    pub dangerous_commands: Vec<String>,
    pub mcp_detected: bool,
    pub agent_detected: bool,
    pub skill_detected: bool,
    pub tool_detected: bool,
    pub package_type: String, // mcp|agent|skill|tool|plugin|bundle|unknown
    pub forge_compatibility: String, // full|partial|none
    pub security_risk: String, // low|medium|high
    pub scan: ScanReport,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "target",
    ".next",
    "build",
    "vendor",
    "__pycache__",
    ".venv",
];

/// Parse "https://github.com/owner/repo" (+ optional .git / tree suffix) into
/// (owner, repo). Returns None when not a github URL.
pub fn parse_github_url(url: &str) -> Option<(String, String)> {
    let u = url.trim().trim_end_matches('/');
    let rest = u
        .strip_prefix("https://github.com/")
        .or_else(|| u.strip_prefix("http://github.com/"))
        .or_else(|| u.strip_prefix("github.com/"))?;
    let mut parts = rest.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts
        .next()?
        .to_string()
        .trim_end_matches(".git")
        .to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

fn walk_files(dir: &Path) -> Result<Vec<PathBuf>, ForgeError> {
    let mut out = Vec::new();
    fn walk(d: &Path, out: &mut Vec<PathBuf>) -> Result<(), ForgeError> {
        for entry in fs::read_dir(d).map_err(ForgeError::Io)? {
            let entry = entry.map_err(ForgeError::Io)?;
            let p = entry.path();
            let ft = entry.file_type().map_err(ForgeError::Io)?;
            if ft.is_dir() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if !SKIP_DIRS.contains(&name.as_ref()) {
                    walk(&p, out)?;
                }
            } else {
                out.push(p);
            }
        }
        Ok(())
    }
    walk(dir, &mut out)?;
    Ok(out)
}

fn read_limited(p: &Path, max: usize) -> String {
    fs::read_to_string(p)
        .unwrap_or_default()
        .chars()
        .take(max)
        .collect()
}

fn text_files(files: &[PathBuf]) -> Vec<PathBuf> {
    let ext = |p: &Path| {
        p.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
    };
    files
        .iter()
        .filter(|p| {
            matches!(
                ext(p).as_str(),
                "ts" | "tsx"
                    | "js"
                    | "jsx"
                    | "mjs"
                    | "cjs"
                    | "py"
                    | "rs"
                    | "go"
                    | "java"
                    | "kt"
                    | "sh"
                    | "bash"
                    | "yml"
                    | "yaml"
                    | "json"
                    | "md"
                    | "toml"
                    | "txt"
                    | "cfg"
                    | "ini"
                    | "env"
                    | "css"
                    | "html"
            )
        })
        .cloned()
        .collect()
}

fn detect_language(files: &[PathBuf]) -> Option<String> {
    let mut counts: Vec<(&str, usize)> = vec![
        ("typescript", 0),
        ("javascript", 0),
        ("python", 0),
        ("rust", 0),
        ("go", 0),
        ("java", 0),
        ("shell", 0),
        ("markdown", 0),
    ];
    for p in files {
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let idx = match ext.as_str() {
            "ts" | "tsx" | "mts" => Some(0),
            "js" | "jsx" | "mjs" | "cjs" => Some(1),
            "py" => Some(2),
            "rs" => Some(3),
            "go" => Some(4),
            "java" | "kt" => Some(5),
            "sh" | "bash" => Some(6),
            "md" => Some(7),
            _ => None,
        };
        if let Some(i) = idx {
            counts[i].1 += 1;
        }
    }
    counts.retain(|(_, n)| *n > 0);
    counts.sort_by(|a, b| b.1.cmp(&a.1));
    counts.first().map(|(name, _)| name.to_string())
}

fn detect_package_managers(dir: &Path, files: &[PathBuf]) -> Vec<String> {
    let mut out = Vec::new();
    let has = |name: &str| {
        files
            .iter()
            .any(|p| p.file_name().and_then(|n| n.to_str()) == Some(name))
    };
    if has("package.json") {
        out.push("npm".to_string());
    }
    if has("pnpm-lock.yaml") {
        out.push("pnpm".to_string());
    }
    if has("yarn.lock") {
        out.push("yarn".to_string());
    }
    if has("Cargo.toml") {
        out.push("cargo".to_string());
    }
    if has("pyproject.toml") {
        out.push("pyproject".to_string());
    }
    if has("requirements.txt") {
        out.push("pip".to_string());
    }
    if has("go.mod") {
        out.push("go".to_string());
    }
    if out.is_empty() && has("README.md") {
        let _ = dir;
        out.push("unknown".to_string());
    }
    out
}

fn detect_dependencies(files: &[PathBuf]) -> Vec<String> {
    let mut deps = Vec::new();
    for p in files {
        match p.file_name().and_then(|n| n.to_str()) {
            Some("package.json") => {
                if let Ok(v) =
                    serde_json::from_str::<serde_json::Value>(&read_limited(p, 2_000_000))
                {
                    for section in ["dependencies", "devDependencies"] {
                        if let Some(obj) = v.get(section).and_then(|d| d.as_object()) {
                            for (k, ver) in obj {
                                deps.push(format!("{k}@{}", ver.as_str().unwrap_or("*")));
                            }
                        }
                    }
                }
            }
            Some("requirements.txt") => {
                for line in read_limited(p, 500_000).lines() {
                    let l = line.trim();
                    if !l.is_empty() && !l.starts_with('#') {
                        deps.push(l.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    deps.sort();
    deps.dedup();
    deps
}

fn detect_entry_point(files: &[PathBuf]) -> Option<String> {
    for p in files {
        if p.file_name().and_then(|n| n.to_str()) == Some("package.json") {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&read_limited(p, 2_000_000)) {
                if let Some(main) = v.get("main").and_then(|m| m.as_str()) {
                    return Some(main.to_string());
                }
                if let Some(bin) = v.get("bin").and_then(|b| b.as_str()) {
                    return Some(bin.to_string());
                }
                if let Some(bin) = v.get("bin").and_then(|b| b.as_object()) {
                    if let Some(first) = bin.values().next().and_then(|x| x.as_str()) {
                        return Some(first.to_string());
                    }
                }
            }
        }
    }
    let candidates = [
        "src/index.ts",
        "src/index.js",
        "index.ts",
        "index.js",
        "main.py",
        "src/main.py",
        "src/main.rs",
        "main.go",
    ];
    for c in candidates {
        if files.iter().any(|p| {
            p.to_string_lossy()
                .replace('\\', "/")
                .ends_with(&format!("/{c}"))
        }) {
            return Some(c.to_string());
        }
    }
    // 任何目录下的 index/main 入口文件
    for p in files {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if matches!(
            name,
            "index.ts" | "index.js" | "main.py" | "main.rs" | "main.go"
        ) {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

fn spdx_of(text: &str) -> Option<String> {
    let t = text.to_ascii_lowercase();
    let pairs: &[(&str, &str)] = &[
        ("apache license", "Apache-2.0"),
        ("gnu affero general public license", "AGPL-3.0"),
        ("gnu general public license", "GPL-3.0"),
        ("mit license", "MIT"),
        ("the mit license", "MIT"),
        ("bsd 3-clause", "BSD-3-Clause"),
        ("bsd 2-clause", "BSD-2-Clause"),
        ("isc license", "ISC"),
        ("mozilla public license", "MPL-2.0"),
        ("unlicense", "Unlicense"),
    ];
    for (needle, spdx) in pairs {
        if t.contains(needle) {
            return Some(spdx.to_string());
        }
    }
    None
}

fn detect_license(files: &[PathBuf]) -> (Option<String>, bool) {
    // 遍历全部文件：LICENSE 通常无扩展名，不能被 text 过滤掉
    for p in files {
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if name.starts_with("license") || name.starts_with("licence") || name == "copying" {
            if let Some(spdx) = spdx_of(&read_limited(p, 200_000)) {
                return (Some(spdx), false);
            }
            return (Some("NOASSERTION".to_string()), false);
        }
    }
    for p in files {
        if p.file_name().and_then(|n| n.to_str()) == Some("package.json") {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&read_limited(p, 2_000_000)) {
                if let Some(l) = v.get("license").and_then(|l| l.as_str()) {
                    return (Some(spdx_of(l).unwrap_or_else(|| l.to_string())), false);
                }
            }
        }
    }
    (None, true)
}

fn collect_patterns(
    files: &[PathBuf],
) -> (
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
) {
    let mut network = Vec::new();
    let mut fs_usage = Vec::new();
    let mut env_vars = Vec::new();
    let mut secrets = Vec::new();
    let mut dangerous = Vec::new();
    let url_re = regex::Regex::new(r#"https?://[^\s"'\x60\)\]\}]+"#).unwrap();
    let env_re = regex::Regex::new(
        r#"process\.env\.([A-Za-z_][A-Za-z0-9_]*)|os\.environ|getenv\(\s*["']([A-Za-z_]+)"#,
    )
    .unwrap();
    let danger_re = regex::Regex::new(r"(?i)(rm\s+-rf\s+/|curl\s+[^|]*\|\s*(ba)?sh|wget\s+[^|]*\|\s*(ba)?sh|sudo\s+|chmod\s+[0-7]{3,4}|launchctl\s+load|crontab\s|reg\s+add)").unwrap();
    let fs_re = regex::Regex::new(r#"(?i)(writeFileSync|createWriteStream|unlinkSync|rmSync|fs\.writeFile|open\([^)]*['"]w|shutil\.rmtree)"#).unwrap();
    for p in files {
        let text = read_limited(p, 1_000_000);
        if text.is_empty() {
            continue;
        }
        let rel = p.to_string_lossy().to_string();
        for m in url_re.find_iter(&text) {
            let u = m.as_str();
            let rest = u.split("://").nth(1).unwrap_or("");
            if !(rest.starts_with("localhost")
                || rest.starts_with("127.0.0.1")
                || rest.starts_with("0.0.0.0")
                || rest.starts_with("[::1]"))
            {
                network.push(format!("{}: {}", rel, u));
            }
        }
        for m in env_re.find_iter(&text) {
            let cap = m.as_str();
            env_vars.push(format!("{}: {}", rel, cap));
        }
        for m in danger_re.find_iter(&text) {
            dangerous.push(format!("{}: {}", rel, m.as_str()));
        }
        for m in fs_re.find_iter(&text) {
            fs_usage.push(format!("{}: {}", rel, m.as_str()));
        }
        let findings = scan_text(&text, &rel);
        for f in findings.iter().filter(|f| f.rule == "secret") {
            secrets.push(format!("{}: {} x{}", rel, f.label, f.count));
        }
    }
    (network, fs_usage, env_vars, secrets, dangerous)
}

fn detect_install_scripts(files: &[PathBuf]) -> Vec<String> {
    let mut out = Vec::new();
    for p in files {
        if p.file_name().and_then(|n| n.to_str()) == Some("package.json") {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&read_limited(p, 2_000_000)) {
                if let Some(scripts) = v.get("scripts").and_then(|s| s.as_object()) {
                    for key in ["preinstall", "install", "postinstall", "prepare"] {
                        if let Some(cmd) = scripts.get(key).and_then(|c| c.as_str()) {
                            out.push(format!("package.json scripts.{key}: {cmd}"));
                        }
                    }
                }
            }
        }
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if matches!(ext.as_str(), "sh" | "bash") {
            out.push(format!("script: {}", p.to_string_lossy()));
        }
    }
    out
}

fn detect_executables(files: &[PathBuf]) -> Vec<String> {
    use std::os::unix::fs::PermissionsExt;
    files
        .iter()
        .filter(|p| {
            p.extension()
                .map(|e| matches!(e.to_str(), Some("sh") | Some("bash") | Some("py")))
                .unwrap_or(false)
                && fs::metadata(p)
                    .map(|m| m.permissions().mode() & 0o111 != 0)
                    .unwrap_or(false)
        })
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

fn detect_features(files: &[PathBuf], dir: &Path) -> (bool, bool, bool, bool) {
    let has_skill = files
        .iter()
        .any(|p| p.file_name().and_then(|n| n.to_str()) == Some("SKILL.md"));
    let has_agent = dir.join("agenthub.yaml").exists() || dir.join("forge.manifest.json").exists();
    let mut mcp = false;
    let mut tool = false;
    let all_text: String = files
        .iter()
        .map(|p| read_limited(p, 400_000))
        .collect::<Vec<_>>()
        .join(
            "
",
        );
    let lower = all_text.to_ascii_lowercase();
    if lower.contains("modelcontextprotocol")
        || lower.contains("mcp_server")
        || lower.contains("mcp server")
    {
        mcp = true;
    }
    if !has_agent && !has_skill && !mcp {
        if let Some(entry) = detect_entry_point(files) {
            if entry.ends_with(".ts")
                || entry.ends_with(".js")
                || entry.ends_with(".py")
                || entry.ends_with(".rs")
                || entry.ends_with(".go")
            {
                tool = true;
            }
        }
    }
    (mcp, has_agent, has_skill, tool)
}

/// Analyze a local directory (or a locally-cloned git repository).
pub fn analyze_dir(dir: &Path) -> Result<RepositoryAnalysis, ForgeError> {
    let canonical = fs::canonicalize(dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            ForgeError::ArtifactNotFound(format!("目录不存在：{}", dir.display()))
        } else {
            ForgeError::Io(e)
        }
    })?;
    let files = walk_files(&canonical)?;
    let texts = text_files(&files);

    let gh = if canonical.join(".git").exists() {
        let out = std::process::Command::new("git")
            .args(["-C"])
            .arg(&canonical)
            .args(["remote", "get-url", "origin"])
            .output();
        match out {
            Ok(o) if o.status.success() => {
                let url = String::from_utf8_lossy(&o.stdout).trim().to_string();
                parse_github_url(&url)
            }
            _ => None,
        }
    } else {
        None
    };
    let owner = gh.as_ref().map(|(o, _)| o.clone());
    let repo = gh.as_ref().map(|(_, r)| r.clone());

    let (license, license_missing) = detect_license(&files);
    let (network, fs_usage, env_vars, secrets, dangerous) = collect_patterns(&texts);
    let (mcp, agent, skill, tool) = detect_features(&texts, &canonical);
    let scan = scan_agent_dir(&canonical, "community")?;

    let package_type = if agent {
        "agent"
    } else if skill {
        "skill"
    } else if mcp {
        "mcp"
    } else if tool {
        "tool"
    } else if !dangerous.is_empty() && files.len() > 4 {
        "plugin"
    } else {
        "unknown"
    }
    .to_string();

    let forge_compatibility = if license_missing {
        "none"
    } else if agent {
        "full"
    } else {
        "partial"
    }
    .to_string();

    let security_risk = if scan.verdict == "block" {
        "high"
    } else if scan.verdict == "warn" || !dangerous.is_empty() || !secrets.is_empty() {
        "medium"
    } else {
        "low"
    }
    .to_string();

    let readme = files
        .iter()
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("readme.md"))
                .unwrap_or(false)
        })
        .map(|p| p.to_string_lossy().to_string());

    Ok(RepositoryAnalysis {
        source: if let (Some(o), Some(r)) = (&owner, &repo) {
            format!("https://github.com/{o}/{r}")
        } else {
            canonical.to_string_lossy().to_string()
        },
        owner,
        repo,
        language: detect_language(&texts),
        package_managers: detect_package_managers(&canonical, &files),
        entry_point: detect_entry_point(&texts),
        readme,
        license,
        license_missing,
        dependencies: detect_dependencies(&texts),
        executable_files: detect_executables(&files),
        install_scripts: detect_install_scripts(&texts),
        network_usage: network,
        filesystem_usage: fs_usage,
        env_vars,
        secrets_found: secrets,
        dangerous_commands: dangerous,
        mcp_detected: mcp,
        agent_detected: agent,
        skill_detected: skill,
        tool_detected: tool,
        package_type,
        forge_compatibility,
        security_risk,
        scan,
    })
}

/// Analyze a source: github URL (must resolve to a local clone) or local path.
pub fn analyze_source(source: &str) -> Result<RepositoryAnalysis, ForgeError> {
    if let Some((owner, repo_name)) = parse_github_url(source) {
        let home = std::env::var_os("HOME").unwrap_or_default();
        let cache = PathBuf::from(home)
            .join(".deepseek-forge")
            .join("cache")
            .join("repos")
            .join(format!("{owner}__{repo_name}"));
        if cache.exists() {
            return analyze_dir(&cache);
        }
        // 网络闭环：浅克隆到本地缓存后分析（只读分析，不执行第三方代码）
        let clone_status = std::process::Command::new("git")
            .args(["clone", "--depth", "1", source])
            .arg(&cache)
            .output();
        match clone_status {
            Ok(o) if o.status.success() => return analyze_dir(&cache),
            Ok(o) => {
                return Err(ForgeError::RegistryUnavailable(format!(
                    "git clone 失败：{}（源：{}）。可手动克隆到 {} 后重试。",
                    String::from_utf8_lossy(&o.stderr)
                        .lines()
                        .last()
                        .unwrap_or(""),
                    source,
                    cache.display()
                )))
            }
            Err(e) => return Err(ForgeError::Io(e)),
        }
    }
    analyze_dir(Path::new(source))
}
