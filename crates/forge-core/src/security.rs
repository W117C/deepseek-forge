//! Static string-level security scan, ported 1:1 from lib/security.mjs.
//! The network rule (negative lookahead in JS) is replicated with an explicit
//! loopback-host filter, since the Rust regex crate has no lookahead.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::errors::ForgeError;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecurityFinding {
    pub rule: String,
    pub level: String,
    pub weight: i32,
    pub label: String,
    pub count: usize,
    pub file: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub score: i32,
    pub verdict: String, // "pass" | "warn" | "block"
    pub findings: Vec<SecurityFinding>,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
    pub files: usize,
}

struct Rule {
    id: &'static str,
    level: &'static str,
    weight: i32,
    re: regex::Regex,
    label: &'static str,
}

fn rules() -> Vec<Rule> {
    vec![
        Rule {
            id: "js-expr",
            level: "high",
            weight: 25,
            re: regex::Regex::new(r"!!js\s").unwrap(),
            label: "cordis 配置含 !!js 表达式（任意代码求值）",
        },
        Rule {
            id: "shell",
            level: "high",
            weight: 25,
            re: regex::Regex::new(r"child_process|execSync|spawnSync|spawn\(|exec\(").unwrap(),
            label: "疑似 shell/子进程调用",
        },
        Rule {
            id: "eval",
            level: "high",
            weight: 25,
            re: regex::Regex::new(r"\beval\(|new Function").unwrap(),
            label: "动态代码求值（eval/new Function）",
        },
        Rule {
            id: "network",
            level: "medium",
            weight: 10,
            re: regex::Regex::new(r#"https?://[^\s"'\x60\)\]\}]+"#).unwrap(),
            label: "含外网 URL（本机回环除外）",
        },
        Rule {
            id: "fs-write",
            level: "medium",
            weight: 10,
            re: regex::Regex::new(r"writeFileSync|createWriteStream|unlinkSync|rmSync").unwrap(),
            label: "文件写入/删除调用",
        },
        Rule {
            id: "secret",
            level: "high",
            weight: 25,
            re: regex::Regex::new(
                r"sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|password\s*[:=]",
            )
            .unwrap(),
            label: "疑似硬编码密钥/口令",
        },
        Rule {
            id: "env",
            level: "low",
            weight: 2,
            re: regex::Regex::new(r"process\.env").unwrap(),
            label: "读取环境变量",
        },
    ]
}

/// The canonical platform-check idiom (whitelisted in JS).
fn canonical_platform_re() -> &'static regex::Regex {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"!!js\s+process\.platform\s+[!=]==?\s*'win32'").unwrap())
}

fn is_loopback_url(url: &str) -> bool {
    let rest = url.split("://").nth(1).unwrap_or("");
    rest.starts_with("localhost")
        || rest.starts_with("127.0.0.1")
        || rest.starts_with("0.0.0.0")
        || rest.starts_with("[::1]")
}

/// Scan a single text blob (Node `scanText`).
pub fn scan_text(text: &str, label: &str) -> Vec<SecurityFinding> {
    let mut findings = Vec::new();
    for r in rules() {
        let matches: Vec<regex::Match<'_>> = r.re.find_iter(text).collect();
        if matches.is_empty() {
            continue;
        }
        let mut count = matches.len();
        if r.id == "js-expr" {
            let canonical = canonical_platform_re().find_iter(text).count();
            count = matches.len().saturating_sub(canonical);
            if canonical > 0 {
                findings.push(SecurityFinding {
                    rule: "js-expr-canonical".to_string(),
                    level: "low".to_string(),
                    weight: 1,
                    label: "官方平台判断惯用法（已白名单）".to_string(),
                    count: canonical,
                    file: label.to_string(),
                });
            }
        }
        if r.id == "network" {
            count = matches
                .iter()
                .filter(|m| !is_loopback_url(m.as_str()))
                .count();
        }
        if count > 0 {
            findings.push(SecurityFinding {
                rule: r.id.to_string(),
                level: r.level.to_string(),
                weight: r.weight,
                label: r.label.to_string(),
                count,
                file: label.to_string(),
            });
        }
    }
    findings
}

fn build_report(findings: Vec<SecurityFinding>, files: usize, trust: &str) -> ScanReport {
    let mut score = 100i32;
    for f in &findings {
        score -= f.weight;
    }
    score = score.max(0);
    let high = findings.iter().filter(|f| f.level == "high").count();
    let medium = findings.iter().filter(|f| f.level == "medium").count();
    let low = findings.iter().filter(|f| f.level == "low").count();
    let verdict = if high > 0 && trust != "official" && trust != "verified" {
        "block"
    } else if high > 0 {
        "warn"
    } else {
        "pass"
    };
    ScanReport {
        score,
        verdict: verdict.to_string(),
        findings,
        high,
        medium,
        low,
        files,
    }
}

/// Scan a directory tree (Node `scanAgentDir`). Symlinked dirs are not
/// recursed (Rust entry metadata does not follow symlinks; bundles contain none).
pub fn scan_agent_dir(dir: &Path, trust: &str) -> Result<ScanReport, ForgeError> {
    fn walk(d: &Path, out: &mut Vec<PathBuf>) -> Result<(), ForgeError> {
        for entry in fs::read_dir(d).map_err(ForgeError::Io)? {
            let entry = entry.map_err(ForgeError::Io)?;
            let p = entry.path();
            let ft = entry.file_type().map_err(ForgeError::Io)?;
            if ft.is_dir() {
                if entry.file_name() != "node_modules" {
                    walk(&p, out)?;
                }
            } else {
                let name = p.to_string_lossy();
                if name.ends_with(".yaml")
                    || name.ends_with(".yml")
                    || name.ends_with(".json")
                    || name.ends_with(".md")
                    || name.ends_with(".mjs")
                    || name.ends_with(".js")
                    || name.ends_with(".ts")
                {
                    out.push(p);
                }
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    walk(dir, &mut files)?;

    let mut findings = Vec::new();
    for f in &files {
        let rel = f
            .strip_prefix(dir)
            .unwrap_or(f)
            .to_string_lossy()
            .to_string();
        let text = fs::read_to_string(f).map_err(ForgeError::Io)?;
        findings.extend(scan_text(&text, &rel));
    }
    Ok(build_report(findings, files.len(), trust))
}

/// Scan a single text blob and report it as a one-file scan.
pub fn scan_text_report(text: &str, label: &str, trust: &str) -> ScanReport {
    let findings = scan_text(text, label);
    build_report(findings, 1, trust)
}
