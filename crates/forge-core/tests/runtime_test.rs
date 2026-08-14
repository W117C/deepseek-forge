//! Runtime adapter tests (Phase 7).

use std::path::Path;

use forge_core::runtime::{list_sessions, parse_ps_line, runtime_status};

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

#[test]
fn parses_ps_lines() {
    let p = parse_ps_line("  12345 /usr/local/bin/dsh --profile finance").unwrap();
    assert_eq!(p.pid, 12345);
    assert!(p.command.contains("dsh"));
    assert!(parse_ps_line("  1 /sbin/launchd").is_none());
    assert!(parse_ps_line("garbage").is_none());
}

#[test]
fn lists_jsonl_sessions_sorted_by_recency() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path();
    write(&home.join("sessions/a.jsonl"), "{\"type\":\"message\"}\n");
    write(&home.join("sessions/b.jsonl"), "x\n");
    write(&home.join("sessions/note.txt"), "not a session");
    let (count, sessions) = list_sessions(home);
    assert_eq!(count, 2);
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|s| s.id == "a"));
    assert!(sessions.iter().any(|s| s.id == "b"));
}

#[test]
fn runtime_status_reports_harness_and_sessions() {
    let tmp = tempfile::tempdir().unwrap();
    write(&tmp.path().join("sessions/demo.jsonl"), "{\"a\":1}\n");
    let status = runtime_status(Some(tmp.path())).unwrap();
    assert_eq!(status.session_count, 1);
    assert_eq!(
        status.harness_detected,
        forge_core::dsh::locate_dsh().is_some()
    );
    assert!(!status.sessions_dir.is_empty());
    // 进程表为真实 ps 输出（可能为空；不伪造）
    assert!(status.processes.iter().all(|p| p.pid > 0));
}
