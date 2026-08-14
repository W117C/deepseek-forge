import { invoke } from "@tauri-apps/api/core";

/**
 * IPC-safe error shape returned by the Rust commands as a JSON string
 * (target-state §21). The frontend parses it and surfaces the human message
 * plus the recovery hint.
 */
export interface ErrorEnvelope {
  code: string;
  human: string;
  technical: string;
  recovery: string;
}

/** Mirror of the Rust `SystemStatus` payload (serde camelCase). */
export interface SystemStatus {
  coreVersion: string;
  registryPath: string;
  registryAvailable: boolean;
  registryName: string | null;
  dshDetected: boolean;
}

/** Mirror of `forge_core::registry::PackageSummary` (serde camelCase). */
export interface RegistrySummary {
  id: string;
  name: string;
  type: string;
  versionLatest: string;
  description: string;
}

/**
 * Convert a rejected invoke value into a human-readable Error. The Rust
 * commands return errors as `Result<T, String>`, where the String is a
 * serialized {@link ErrorEnvelope}.
 */
function toError(err: unknown): Error {
  if (typeof err === "string") {
    try {
      const env = JSON.parse(err) as ErrorEnvelope;
      if (env && typeof env.code === "string" && typeof env.human === "string") {
        return new Error(
          (`${env.human} (${env.code}) ${env.recovery ?? ""}`).trim()
        );
      }
    } catch {
      // Not JSON; fall through to the raw string.
    }
    return new Error(err);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

async function call<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw toError(err);
  }
}

export function systemStatus(): Promise<SystemStatus> {
  return call<SystemStatus>("system_status");
}

export function registryList(): Promise<RegistrySummary[]> {
  return call<RegistrySummary[]>("registry_list");
}

export function registryInfo(id: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("registry_info", { id });
}

export function registryVersions(id: string): Promise<string[]> {
  return call<string[]>("registry_versions", { id });
}

export function registryGetVersion(
  id: string,
  version: string
): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("registry_get_version", { id, version });
}

/** Mirror of forge_core::import::RepositoryAnalysis (serde camelCase). */
export interface RepositoryAnalysis {
  source: string;
  owner: string | null;
  repo: string | null;
  language: string | null;
  packageManagers: string[];
  entryPoint: string | null;
  readme: string | null;
  license: string | null;
  licenseMissing: boolean;
  dependencies: string[];
  executableFiles: string[];
  installScripts: string[];
  networkUsage: string[];
  filesystemUsage: string[];
  envVars: string[];
  secretsFound: string[];
  dangerousCommands: string[];
  mcpDetected: boolean;
  agentDetected: boolean;
  skillDetected: boolean;
  toolDetected: boolean;
  packageType: string;
  forgeCompatibility: string;
  securityRisk: string;
  scan: {
    score: number;
    verdict: string;
    findings: unknown[];
    high: number;
    medium: number;
    low: number;
    files: number;
  };
}

export function importAnalyze(source: string): Promise<RepositoryAnalysis> {
  return call<RepositoryAnalysis>("import_analyze", { source });
}

/** Mirror of forge_core::adapter::AdapterProposal. */
export interface AdapterProposal {
  packageType: string;
  risk: string;
  generator: string;
  requiresHumanReview: boolean;
  manifest: Record<string, unknown>;
}

export function adapterPropose(source: string): Promise<AdapterProposal> {
  return call<AdapterProposal>("adapter_propose", { source });
}

/** Mirror of forge_core::runtime::RuntimeStatus. */
export interface RuntimeStatus {
  harnessDetected: boolean;
  harnessBin: string | null;
  harnessVersion: string | null;
  sessionsDir: string;
  sessionCount: number;
  sessions: { id: string; sizeBytes: number; modifiedAt: string }[];
  processes: { pid: number; command: string }[];
}

export function runtimeStatus(): Promise<RuntimeStatus> {
  return call<RuntimeStatus>("runtime_status_cmd");
}
