use std::path::Path;

use forge_core::registry::{LocalRegistry, RegistryProvider};

fn write(path: impl AsRef<Path>, content: &str) {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, content).unwrap();
}

fn manifest_json(id: &str, name: &str, version: &str) -> String {
    format!(
        r#"{{
  "schema": "forge.package.v1",
  "id": "{}",
  "name": "{}",
  "type": "agent",
  "version": "{}",
  "description": "",
  "category": "",
  "tags": [],
  "publisher": {{ "id": "agenthub" }},
  "source": {{ "type": "forge" }},
  "upstream": {{}},
  "license": {{ "spdx": "NOASSERTION" }},
  "compatibility": {{ "dsh": {{}} }},
  "capabilities": [],
  "permissions": {{}},
  "security": {{ "scan": "required", "status": "UNKNOWN", "findings": [] }},
  "artifact": {{ "filename": "{}-{}.tar.gz" }},
  "entrypoint": {{ "type": "harness-profile" }},
  "dependencies": [],
  "runtime": {{ "engine": "deepseek-harness", "profile": {{ "name": "default" }}, "components": {{}} }}
}}"#,
        id, name, version, id, version
    )
}

#[test]
fn local_registry_reads_fixture() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    write(
        root.join("registry.json"),
        r#"{"schemaVersion":1,"id":"forge-registry","name":"Forge Registry"}"#,
    );

    // pkg-a: two versions
    write(
        root.join("packages/pkg-a/package.json"),
        &manifest_json("pkg-a", "Package A", "0.2.0"),
    );
    for version in ["0.1.0", "0.2.0"] {
        let dir = root.join("packages/pkg-a/versions").join(version);
        write(
            &dir.join("manifest.json"),
            &manifest_json("pkg-a", "Package A", version),
        );
        write(
            &dir.join("artifact.json"),
            &format!(
                "{{\"sha256\":null,\"signature\":null,\"filename\":\"pkg-a-{}.tar.gz\"}}",
                version
            ),
        );
        write(
            &dir.join("security.json"),
            r#"{"status":"UNKNOWN","scannedAt":null,"findings":[]}"#,
        );
        write(
            &dir.join("compatibility.json"),
            r#"{"dsh":{"min":"0.1.0-rc.6"}}"#,
        );
    }

    // pkg-b: one version
    write(
        root.join("packages/pkg-b/package.json"),
        &manifest_json("pkg-b", "Package B", "1.0.0"),
    );
    let dir = root.join("packages/pkg-b/versions/1.0.0");
    write(
        &dir.join("manifest.json"),
        &manifest_json("pkg-b", "Package B", "1.0.0"),
    );
    write(
        &dir.join("artifact.json"),
        r#"{"filename":"pkg-b-1.0.0.tar.gz"}"#,
    );
    write(
        &dir.join("security.json"),
        r#"{"status":"PASS","findings":[]}"#,
    );
    write(&dir.join("compatibility.json"), r#"{}"#);

    let registry = LocalRegistry::open(root);

    let metadata = registry.get_registry().unwrap();
    assert_eq!(metadata.id, "forge-registry");
    assert_eq!(metadata.schema_version, 1);

    let packages = registry.list_packages().unwrap();
    assert_eq!(packages.len(), 2);

    let package = registry.get_package("pkg-a").unwrap();
    assert_eq!(package.id, "pkg-a");
    assert_eq!(package.version, "0.2.0");

    let versions = registry.get_versions("pkg-a").unwrap();
    assert_eq!(versions, vec!["0.2.0".to_string(), "0.1.0".to_string()]);

    let version = registry.get_version("pkg-a", "0.2.0").unwrap();
    assert_eq!(version.package.id, "pkg-a");
    assert!(version.artifact.is_some());
    assert!(version.security.is_some());
    assert!(version.compatibility.is_some());

    let err = registry.get_package("nope").unwrap_err();
    assert_eq!(err.code(), "PACKAGE_NOT_FOUND");

    let err = registry.get_version("pkg-a", "9.9.9").unwrap_err();
    assert_eq!(err.code(), "VERSION_NOT_FOUND");
}

#[test]
fn registry_schema_version_99_is_invalid() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root.join("registry.json"),
        r#"{"schemaVersion":99,"id":"x","name":"x"}"#,
    );
    let registry = LocalRegistry::open(root);
    let err = registry.get_registry().unwrap_err();
    assert_eq!(err.code(), "INVALID_SCHEMA");
}
