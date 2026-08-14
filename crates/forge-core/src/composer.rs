//! Phase 6: composer dependency graph resolution with early conflict detection.
//!
//! Pure functions over package/component specs: cycle detection, duplicate
//! version conflicts, and a deterministic topological install order.

use serde::{Deserialize, Serialize};

use crate::errors::ForgeError;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DependencySpec {
    pub package: String,
    pub version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentSpec {
    pub name: String,
    pub dependencies: Vec<DependencySpec>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolveReport {
    /// Deterministic install order (topological; stable tie-break by name).
    pub order: Vec<String>,
    pub conflicts: Vec<String>,
    pub missing: Vec<String>,
}

/// Resolve a set of components into an install order.
/// - duplicate package with conflicting version requirements -> conflict entry
/// - dependency cycles -> conflict entry with the cycle path
/// - dependencies on packages that no component provides -> missing entry
pub fn resolve_graph(components: &[ComponentSpec]) -> Result<ResolveReport, ForgeError> {
    let provided: std::collections::BTreeSet<String> =
        components.iter().map(|c| c.name.clone()).collect();
    let mut conflicts: Vec<String> = Vec::new();
    let mut missing: Vec<String> = Vec::new();

    // 1. version conflicts: same package requested with different versions
    let mut version_requirements: std::collections::BTreeMap<
        String,
        std::collections::BTreeSet<String>,
    > = std::collections::BTreeMap::new();
    for c in components {
        for d in &c.dependencies {
            let v = d.version.clone().unwrap_or_else(|| "*".to_string());
            let set = version_requirements.entry(d.package.clone()).or_default();
            let exact = if v == "*" { "*".to_string() } else { v.clone() };
            set.insert(exact);
        }
    }
    for (pkg, versions) in &version_requirements {
        let concrete: Vec<&String> = versions.iter().filter(|v| v.as_str() != "*").collect();
        if concrete.len() > 1 {
            conflicts.push(format!(
                "版本冲突：{} 同时要求 {} —— 必须统一版本",
                pkg,
                concrete
                    .iter()
                    .map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join(" vs ")
            ));
        }
    }

    // 2. missing deps (dependency references a package that no component provides)
    for c in components {
        for d in &c.dependencies {
            if !provided.contains(&d.package) {
                let entry = format!("{} 依赖缺失的包：{}", c.name, d.package);
                if !missing.contains(&entry) {
                    missing.push(entry);
                }
            }
        }
    }

    // 3. cycle detection (DFS with colors over component name -> deps)
    let mut adj: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for c in components {
        adj.insert(
            c.name.clone(),
            c.dependencies
                .iter()
                .map(|d| d.package.clone())
                .filter(|p| provided.contains(p))
                .collect(),
        );
    }
    #[derive(Clone, Copy, PartialEq)]
    enum Color {
        White,
        Gray,
        Black,
    }
    let mut color: std::collections::BTreeMap<String, Color> =
        adj.keys().map(|k| (k.clone(), Color::White)).collect();
    for start in adj.keys().cloned().collect::<Vec<_>>() {
        if color[&start] != Color::White {
            continue;
        }
        let mut stack: Vec<(String, usize)> = vec![(start.clone(), 0)];
        let mut path: Vec<String> = Vec::new();
        color.insert(start.clone(), Color::Gray);
        path.push(start.clone());
        while let Some((node, idx)) = stack.pop() {
            let neighbors = adj.get(&node).cloned().unwrap_or_default();
            if idx >= neighbors.len() {
                color.insert(node.clone(), Color::Black);
                path.pop();
                continue;
            }
            stack.push((node.clone(), idx + 1));
            let next = &neighbors[idx];
            match color.get(next).copied().unwrap_or(Color::White) {
                Color::Gray => {
                    let cycle_start = path.iter().position(|p| p == next).unwrap_or(0);
                    let mut cycle = path[cycle_start..].to_vec();
                    cycle.push(next.clone());
                    conflicts.push(format!("循环依赖：{}", cycle.join(" → ")));
                }
                Color::White => {
                    color.insert(next.clone(), Color::Gray);
                    path.push(next.clone());
                    stack.push((next.clone(), 0));
                }
                Color::Black => {}
            }
        }
    }

    // 4. topological order (Kahn, stable)：依赖者必须先于被依赖者输出
    // indegree[node] = node 自身的依赖数量；dependents[pkg] = 依赖 pkg 的组件
    let mut dependents: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for (node, deps) in &adj {
        for d in deps {
            dependents.entry(d.clone()).or_default().push(node.clone());
        }
    }
    let mut indegree: std::collections::BTreeMap<String, usize> = adj
        .iter()
        .map(|(k, deps)| (k.clone(), deps.len()))
        .collect();
    let mut ready: std::collections::BTreeSet<String> = indegree
        .iter()
        .filter(|(_, d)| **d == 0)
        .map(|(k, _)| k.clone())
        .collect();
    let mut order = Vec::new();
    while !ready.is_empty() {
        let node = ready.iter().next().cloned().unwrap();
        ready.remove(&node);
        order.push(node.clone());
        if let Some(users) = dependents.get(&node) {
            for user in users {
                if let Some(deg) = indegree.get_mut(user) {
                    *deg = deg.saturating_sub(1);
                    if *deg == 0 {
                        ready.insert(user.clone());
                    }
                }
            }
        }
    }
    // 有环时 Kahn 无法全部输出；冲突列表已给出环路径，保留部分顺序

    Ok(ResolveReport {
        order,
        conflicts,
        missing,
    })
}

/// High-level bundle validation: duplicate component names are rejected loudly.
pub fn validate_components(components: &[ComponentSpec]) -> Result<(), ForgeError> {
    let mut seen = std::collections::BTreeSet::new();
    for c in components {
        if !seen.insert(c.name.clone()) {
            return Err(ForgeError::InvalidManifest(format!(
                "组合内重复组件：{}",
                c.name
            )));
        }
    }
    Ok(())
}
