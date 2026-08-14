//! Installer semantics unit tests (light; the full pipeline is verified by
//! the parity e2e suite in 3c).

use std::path::Path;

use forge_core::installer::merge_profile_patch;
use forge_core::manifest::load_legacy_agent_dir_strict;

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

#[test]
fn merge_patch_into_empty_template_with_rows() {
    let tmp = tempfile::tempdir().unwrap();
    let patch = tmp.path().join("cordis.patch.yml");
    write(
        &patch, "[]
",
    );
    merge_profile_patch(
        &patch,
        "agent-x",
        "- insert:
    - id: hello-row
",
    )
    .unwrap();
    let text = std::fs::read_to_string(&patch).unwrap();
    assert_eq!(
        text,
        "# --- agenthub managed (begin): agent-x ---
- insert:
    - id: hello-row
# --- agenthub managed (end): agent-x ---
"
    );
}

#[test]
fn merge_patch_empty_template_without_rows_keeps_placeholder() {
    let tmp = tempfile::tempdir().unwrap();
    let patch = tmp.path().join("cordis.patch.yml");
    write(
        &patch, "[]
",
    );
    merge_profile_patch(&patch, "agent-x", "").unwrap();
    let text = std::fs::read_to_string(&patch).unwrap();
    assert_eq!(
        text,
        "[]
# --- agenthub managed (begin): agent-x ---
# --- agenthub managed (end): agent-x ---
"
    );
}

#[test]
fn merge_patch_appends_to_existing_content() {
    let tmp = tempfile::tempdir().unwrap();
    let patch = tmp.path().join("cordis.patch.yml");
    write(
        &patch,
        "# user
- insert:
    - id: user-row
",
    );
    merge_profile_patch(
        &patch,
        "agent-x",
        "- id: mine
",
    )
    .unwrap();
    let text = std::fs::read_to_string(&patch).unwrap();
    assert_eq!(
        text,
        "# user
- insert:
    - id: user-row

# --- agenthub managed (begin): agent-x ---
- id: mine
# --- agenthub managed (end): agent-x ---
"
    );
}

#[test]
fn merge_patch_replaces_existing_managed_block() {
    let tmp = tempfile::tempdir().unwrap();
    let patch = tmp.path().join("cordis.patch.yml");
    write(
        &patch,
        "# --- agenthub managed (begin): agent-x ---
old
# --- agenthub managed (end): agent-x ---
",
    );
    merge_profile_patch(
        &patch, "agent-x", "new
",
    )
    .unwrap();
    let text = std::fs::read_to_string(&patch).unwrap();
    assert_eq!(
        text,
        "# --- agenthub managed (begin): agent-x ---
new
# --- agenthub managed (end): agent-x ---
"
    );
}

#[test]
fn merge_patch_ignores_placeholder_rows_and_comment_only_rows() {
    let tmp = tempfile::tempdir().unwrap();
    let patch = tmp.path().join("cordis.patch.yml");
    write(
        &patch, "[]
",
    );
    // "[]" 占位行丢弃；纯注释不算真实行 → 模板分支
    merge_profile_patch(
        &patch,
        "agent-x",
        "[]
# just a comment
",
    )
    .unwrap();
    let text = std::fs::read_to_string(&patch).unwrap();
    assert_eq!(
        text,
        "[]
# --- agenthub managed (begin): agent-x ---
# just a comment
# --- agenthub managed (end): agent-x ---
"
    );
}

#[test]
fn strict_legacy_loader_requires_components() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("agenthub.yaml"),
        "schema: agenthub.dev/agent/v1
id: x
name: X
version: 0.1.0
",
    );
    let err = load_legacy_agent_dir_strict(tmp.path()).unwrap_err();
    assert_eq!(err.code(), "INVALID_MANIFEST");
}

#[test]
fn strict_legacy_loader_rejects_bad_runtime() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        &tmp.path().join("agenthub.yaml"),
        "schema: agenthub.dev/agent/v1
id: x
name: X
version: 0.1.0
runtime: something-else
components: {}
",
    );
    let err = load_legacy_agent_dir_strict(tmp.path()).unwrap_err();
    assert_eq!(err.code(), "INVALID_MANIFEST");
}
