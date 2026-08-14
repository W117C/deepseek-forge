//! DeepSeek Forge core: unified package model, manifest, registry, errors, and events.

pub mod adapter;
pub mod composer;
pub mod dsh;
pub mod errors;
pub mod events;
pub mod import;
pub mod installer;
pub mod manifest;
pub mod model;
pub mod registry;
pub mod security;
pub mod signing;
pub mod snapshot;
pub mod state;

pub use adapter::{generate, propose, AdapterProposal};
pub use composer::{
    resolve_graph, validate_components, ComponentSpec, DependencySpec, ResolveReport,
};
pub use dsh::{
    agenthub_store, dsh_home, has_pnpm, init_profile, locate_dsh, preset_dir, profile_dir,
    read_manifest, run_dsh, skills_dir, write_manifest, PROFILE_PATCH_TEMPLATE,
    PROFILE_PNPM_WORKSPACE,
};
pub use errors::{ErrorEnvelope, ForgeError};
pub use events::{EventBus, ForgeEvent};
pub use import::{analyze_dir, analyze_source, parse_github_url, RepositoryAnalysis};
pub use manifest::{
    load_legacy_agent_dir, load_package_file, normalize_legacy_agent, parse_package_json,
    LEGACY_SCHEMA, SCHEMA_V1,
};
pub use model::{
    Artifact, Compatibility, ComponentBundle, ComponentPreset, Components, Dependency, DshCompat,
    Entrypoint, EntrypointType, Finding, HealthCheck, License, Package, PackageType, Permissions,
    Publisher, Runtime, RuntimeProfile, ScanRequirement, Security, SecurityStatus, Source,
    SourceType, Upstream,
};
pub use registry::{
    ArtifactMeta, LocalRegistry, PackageSummary, PackageVersion, RegistryMetadata,
    RegistryProvider, SecurityMeta,
};
pub use security::{scan_agent_dir, scan_text, scan_text_report, ScanReport, SecurityFinding};
pub use signing::{canonical_payload, keygen, sha256hex, sign_payload, verify_payload, Keypair};
pub use snapshot::{restore_snapshot, snapshot, SnapshotInfo};
pub use state::{load_state, save_state};
