//! AI provider resolution tests (increment ②). No HTTP is exercised:
//! without FORGE_AI_ENDPOINT/FORGE_AI_KEY the generator must stay "rules".

use forge_core::adapter::{propose, provider_from_env};
use forge_core::import::analyze_dir;

fn write(path: &std::path::Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

#[test]
fn provider_requires_both_endpoint_and_key() {
    assert!(provider_from_env(None, None).is_none());
    assert!(provider_from_env(Some("https://x"), None).is_none());
    assert!(provider_from_env(None, Some("k")).is_none());
    assert!(provider_from_env(Some("  "), Some("k")).is_none());
    let p = provider_from_env(Some(" https://x.example/v1 "), Some(" key ")).unwrap();
    assert_eq!(p.endpoint, "https://x.example/v1");
    assert_eq!(p.api_key, "key");
}

#[test]
fn rules_mode_is_explicit_without_provider() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("package.json"),
        r#"{"name":"x","version":"1.0.0","license":"MIT","main":"index.js"}"#,
    );
    write(&tmp.path().join("index.js"), "console.log(1)");
    write(&tmp.path().join("LICENSE"), "MIT License");
    let analysis = analyze_dir(tmp.path()).unwrap();
    let proposal = propose(&analysis).unwrap();
    // 无 AI 供应商环境：绝不伪造 AI，必须明示 rules
    assert_eq!(proposal.generator, "rules");
}

// ---- 三路径 HTTP fixture（本地 TcpListener 测试服务，非生产 mock）----

use std::io::{Read, Write};
use std::net::TcpListener;

use forge_core::adapter::{propose_with_provider, AiProvider};

fn fixture_analysis() -> forge_core::import::RepositoryAnalysis {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("package.json"),
        r#"{"name":"mcp-x","version":"1.0.0","license":"MIT","main":"index.js","dependencies":{"@modelcontextprotocol/sdk":"^1.0.0"}}"#,
    );
    write(&tmp.path().join("index.js"), "console.log(1)");
    write(&tmp.path().join("LICENSE"), "MIT License");
    analyze_dir(tmp.path()).unwrap()
}

fn serve_once(body: &str) -> (String, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let body = body.to_string();
    let h = std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 8192];
            let _ = stream.read(&mut buf);
            let resp = format!(
                "HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: {}
Connection: close

{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    (format!("http://{addr}"), h)
}

fn provider(url: &str) -> AiProvider {
    AiProvider {
        endpoint: url.to_string(),
        api_key: "test-key".to_string(),
    }
}

#[test]
fn ai_success_adopts_description_and_category() {
    let (url, h) = serve_once(r#"{"description":"AI 生成的描述","category":"research"}"#);
    let analysis = fixture_analysis();
    let proposal = propose_with_provider(&analysis, Some(&provider(&url))).unwrap();
    assert_eq!(proposal.generator, "ai");
    assert_eq!(proposal.manifest["description"], "AI 生成的描述");
    assert_eq!(proposal.manifest["category"], "research");
    h.join().unwrap();
}

#[test]
fn ai_protocol_failure_falls_back_to_rules_with_review() {
    let (url, h) = serve_once("not-json");
    let analysis = fixture_analysis();
    let proposal = propose_with_provider(&analysis, Some(&provider(&url))).unwrap();
    assert_eq!(proposal.generator, "rules");
    assert!(proposal.requires_human_review);
    h.join().unwrap();
}

#[test]
fn ai_unreachable_endpoint_falls_back() {
    let analysis = fixture_analysis();
    let dead = provider("http://127.0.0.1:1");
    let proposal = propose_with_provider(&analysis, Some(&dead)).unwrap();
    assert_eq!(proposal.generator, "rules");
    assert!(proposal.requires_human_review);
}
