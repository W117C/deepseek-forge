//! Composer dependency graph tests (Phase 6).

use forge_core::composer::{resolve_graph, validate_components, ComponentSpec, DependencySpec};

fn dep(package: &str, version: Option<&str>) -> DependencySpec {
    DependencySpec {
        package: package.to_string(),
        version: version.map(String::from),
    }
}

fn comp(name: &str, deps: Vec<DependencySpec>) -> ComponentSpec {
    ComponentSpec {
        name: name.to_string(),
        dependencies: deps,
    }
}

#[test]
fn resolves_happy_path_order() {
    // Research Agent → Browser → Node Runtime；PDF Reader → Python
    let components = vec![
        comp(
            "research-agent",
            vec![dep("browser", None), dep("pdf-reader", None)],
        ),
        comp("browser", vec![dep("node-runtime", Some(">=20"))]),
        comp("pdf-reader", vec![dep("python-runtime", Some(">=3.11"))]),
        comp("node-runtime", vec![]),
        comp("python-runtime", vec![]),
    ];
    let report = resolve_graph(&components).unwrap();
    assert!(report.conflicts.is_empty(), "{:?}", report.conflicts);
    assert!(report.missing.is_empty());
    // 依赖必须先于依赖者（拓扑序）
    let pos = |name: &str| report.order.iter().position(|n| n == name).unwrap();
    assert!(pos("node-runtime") < pos("browser"));
    assert!(pos("browser") < pos("research-agent"));
    assert!(pos("python-runtime") < pos("pdf-reader"));
}

#[test]
fn detects_version_conflict() {
    let components = vec![
        comp("a", vec![dep("shared", Some("1.0.0"))]),
        comp("b", vec![dep("shared", Some("2.0.0"))]),
        comp("shared", vec![]),
    ];
    let report = resolve_graph(&components).unwrap();
    assert!(
        report.conflicts.iter().any(|c| c.contains("版本冲突")),
        "{:?}",
        report.conflicts
    );
}

#[test]
fn detects_cycle_and_missing() {
    let components = vec![
        comp("a", vec![dep("b", None)]),
        comp("b", vec![dep("a", None)]),
        comp("c", vec![dep("not-included", None)]),
    ];
    let report = resolve_graph(&components).unwrap();
    assert!(
        report.conflicts.iter().any(|c| c.contains("循环依赖")),
        "{:?}",
        report.conflicts
    );
    assert!(report.missing.iter().any(|m| m.contains("not-included")));
}

#[test]
fn rejects_duplicate_components() {
    let components = vec![comp("a", vec![]), comp("a", vec![])];
    let err = validate_components(&components).unwrap_err();
    assert_eq!(err.code(), "INVALID_MANIFEST");
}
