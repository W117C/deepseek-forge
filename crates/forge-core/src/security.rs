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
            re: regex::Regex::new(
                r"\beval\(|new Function|Function\(|vm\.(runInNewContext|runInContext|runInThisContext|compileFunction|Script|createScript)\(",
            )
            .unwrap(),
            label: "动态代码求值（eval/Function/vm）",
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
            re: regex::Regex::new(
                r"writeFileSync|createWriteStream|unlinkSync|rmSync|writeFile\(|appendFile|unlink\(|mkdirSync|mkdir\(|promises\.(?:writeFile|appendFile|unlink|mkdir|rm)",
            )
            .unwrap(),
            label: "文件写入/删除调用",
        },
        Rule {
            id: "secret",
            level: "high",
            weight: 25,
            // password 分支的文档示例词（mypassword/userpassword/ownerpassword/…）
            // 在 scan_text 的 secret 后处理中过滤（regex crate 不支持 look-around）。
            // 正则需匹配到 `password=<值>` 的值部分，示例词才在匹配文本内可被过滤。
            re: regex::Regex::new(
                r#"sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|password\s*[:=]\s*["']?[A-Za-z0-9._-]{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]"#,
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
        if r.id == "secret" {
            // 过滤文档示例口令（--password=mypassword / userpassword / ownerpassword 等）：
            // 真实 skill 文档常含此类说明，误判会把可用组合阻断；真实密钥（sk-/AKIA/Bearer）不受影响。
            const EXAMPLE_PASSWORDS: [&str; 6] = [
                "mypassword",
                "userpassword",
                "ownerpassword",
                "yourpassword",
                "example",
                "changeme",
            ];
            count = matches
                .iter()
                .filter(|m| {
                    let s = m.as_str();
                    !EXAMPLE_PASSWORDS.iter().any(|w| s.contains(w))
                })
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

fn build_report(findings: Vec<SecurityFinding>, files: usize, _trust: &str) -> ScanReport {
    let mut score = 100i32;
    for f in &findings {
        score -= f.weight;
    }
    score = score.max(0);
    let high = findings.iter().filter(|f| f.level == "high").count();
    let medium = findings.iter().filter(|f| f.level == "medium").count();
    let low = findings.iter().filter(|f| f.level == "low").count();
    // 任何高危发现一律 block——official/verified 发布者同样不豁免（密钥被攻破时防线仍有效）
    let verdict = if high > 0 { "block" } else { "pass" };
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
    fn has_extension(name: &str) -> bool {
        // 只看 basename（父目录可能含点，如 tempdir/.tmpX）
        let base = name.rsplit('/').next().unwrap_or(name);
        base.rsplit_once('.')
            .map(|(_, ext)| !ext.is_empty())
            .unwrap_or(false)
    }
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
                    || name.ends_with(".jsonc")
                    || name.ends_with(".json5")
                    || name.ends_with(".md")
                    || name.ends_with(".mjs")
                    || name.ends_with(".cjs")
                    || name.ends_with(".js")
                    || name.ends_with(".jsx")
                    || name.ends_with(".ts")
                    || name.ends_with(".mts")
                    || name.ends_with(".cts")
                    || name.ends_with(".tsx")
                    // 无扩展名文本文件（LICENSE/Makefile/…）也纳入扫描，防载荷藏匿
                    || !has_extension(&name)
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
        // 非 UTF-8（二进制）文件跳过，不中断扫描
        let Ok(text) = fs::read_to_string(f) else {
            continue;
        };
        findings.extend(scan_text(&text, &rel));
    }
    Ok(build_report(findings, files.len(), trust))
}

/// Scan a single text blob and report it as a one-file scan.
pub fn scan_text_report(text: &str, label: &str, trust: &str) -> ScanReport {
    let findings = scan_text(text, label);
    build_report(findings, 1, trust)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_finding_blocks_even_for_official_or_verified_trust() {
        // P1-1 适应度函数：高危发现一律 block，official/verified 不豁免
        let official = scan_text_report("eval('x')", "t.js", "official");
        assert_eq!(official.verdict, "block");
        assert!(official.high >= 1);
        let verified = scan_text_report("new Function('return 1')", "t.js", "verified");
        assert_eq!(verified.verdict, "block");
    }

    #[test]
    fn vm_and_bare_function_and_async_fs_are_detected() {
        // P1-1 适应度函数：补齐的绕过通道都能命中
        assert!(scan_text("vm.runInNewContext('x')", "a.js")
            .iter()
            .any(|f| f.rule == "eval"));
        assert!(scan_text("vm.Script('x')", "b.js").iter().any(|f| f.rule == "eval"));
        assert!(scan_text("Function('return 1')()", "c.js")
            .iter()
            .any(|f| f.rule == "eval"));
        assert!(scan_text("fs.promises.writeFile('x','y')", "d.js")
            .iter()
            .any(|f| f.rule == "fs-write"));
        assert!(scan_text("fs.appendFile('x','y')", "e.js")
            .iter()
            .any(|f| f.rule == "fs-write"));
    }

    #[test]
    fn private_key_and_cloud_credential_patterns_are_secrets() {
        let pem = scan_text(
            "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
            "k.pem",
        );
        assert!(pem.iter().any(|f| f.rule == "secret"));
        let aws = scan_text("aws_key=AKIA0123456789ABCDEF", "e.env");
        assert!(aws.iter().any(|f| f.rule == "secret"));
    }

    #[test]
    fn extensionless_and_new_ext_files_are_scanned() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("payload.cjs"), "eval('x')").unwrap();
        fs::write(dir.path().join("payload"), "Function('return 1')").unwrap();
        fs::write(dir.path().join("LICENSE"), "MIT text").unwrap();
        let r = scan_agent_dir(dir.path(), "community").unwrap();
        assert!(r.high >= 2, "cjs + 无扩展名两个 eval 类命中应被扫到，high={}", r.high);
        assert_eq!(r.verdict, "block");
    }

    #[test]
    fn binary_extensionless_file_does_not_abort_scan() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("blob"), vec![0u8, 159, 146, 150]).unwrap();
        let r = scan_agent_dir(dir.path(), "community").unwrap();
        assert_eq!(r.verdict, "pass");
    }
}
