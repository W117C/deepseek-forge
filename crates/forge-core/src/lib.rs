//! DeepSeek Forge core: unified package model, manifest, registry, errors, and events.

pub mod errors;
pub mod events;
pub mod manifest;
pub mod model;
pub mod registry;

pub use errors::{ErrorEnvelope, ForgeError};
pub use events::{EventBus, ForgeEvent};
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
