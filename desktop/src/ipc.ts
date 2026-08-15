import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

/**
 * Structured error surfaced to the UI. The desktop shell renders
 * "what happened → why → what to do" from these fields instead of
 * one opaque string.
 */
export class ForgeError extends Error {
  readonly code?: string;
  readonly technical?: string;
  readonly recovery?: string;
  constructor(message: string, env?: ErrorEnvelope) {
    super(message);
    this.name = "ForgeError";
    this.code = env?.code;
    this.technical = env?.technical;
    this.recovery = env?.recovery;
  }
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
  stars?: number | null;
  category?: string | null;
  license?: string | null;
  publisher?: string | null;
  pushedAt?: string | null;
  capabilities?: string[];
  repository?: string | null;
}

export function installPackage(id: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("install_package", { id });
}

export function bundleCreate(name: string, ids: string[]): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("bundle_create", { name, ids });
}
export function bundleList(): Promise<Record<string, unknown>[]> {
  return call<Record<string, unknown>[]>("bundle_list");
}
export function bundleInstall(id: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("bundle_install", { id });
}
export function bundleUninstall(id: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("bundle_uninstall", { id });
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
        return new ForgeError(
          (`${env.human} (${env.code})`).trim(),
          env
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

export function adapterGenerate(
  source: string
): Promise<{ ok: boolean; packageDir: string }> {
  return call<{ ok: boolean; packageDir: string }>("adapter_generate", { source });
}

/** Adapter completion: which hooks are filled + whether the final agent form is present. */
export interface AdapterStatus {
  dir: string;
  exists: boolean;
  hooks: { name: string; filled: boolean }[];
  hooksFilled: number;
  hooksTotal: number;
  agentForm: boolean;
}

export function adapterStatus(dir: string): Promise<AdapterStatus> {
  return call<AdapterStatus>("adapter_status", { dir });
}

/** Register a finished agent directory into the local registry (real pipeline). */
export function registryImportAgent(dir: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("registry_import_agent", { dir });
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

/** Installed state (shared DSH store): { agents: Record<string, InstalledAgent> }. */
export interface InstalledAgent {
  version?: string;
  profile?: string;
  installedAt?: string;
  trust?: string;
  score?: number;
  kind?: string;
  permissions?: { network?: string[]; filesystem?: string[]; env?: string[] };
  presetIds?: string[];
  skillNames?: string[];
  imported?: boolean;
  source?: string;
  scanVerdict?: string;
  license?: string;
  enabled?: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewedAt?: string | null;
}

export function stateList(): Promise<{ agents: Record<string, InstalledAgent> }> {
  return call<{ agents: Record<string, InstalledAgent> }>("state_list");
}

export function packageRollback(id: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("package_rollback", { id });
}

export interface SourcesStats {
  registryPath: string;
  packages: number;
  githubSources: number;
  licenses: Record<string, number>;
  cacheRepos: number;
  cachePath: string;
}

export function sourcesStats(): Promise<SourcesStats> {
  return call<SourcesStats>("sources_stats");
}

/** install-progress 事件：forge-core 逐阶段推送（stderr NDJSON → Tauri event）。 */
export interface InstallProgressEvent {
  event: "install-progress";
  id: string;
  phase: string;
  step: number;
  total: number;
  meta?: Record<string, unknown>;
}

export function onInstallProgress(
  cb: (e: InstallProgressEvent) => void
): Promise<() => void> {
  return listen("install-progress", (ev) => cb(ev.payload as InstallProgressEvent));
}

export function setPluginReview(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<{ id: string; reviewStatus: string; note?: string }> {
  return call<{ id: string; reviewStatus: string; note?: string }>("state_set_review", {
    id,
    status,
  });
}

export function setPluginEnabled(
  id: string,
  enabled: boolean
): Promise<{ id: string; enabled: boolean; note?: string }> {
  return call<{ id: string; enabled: boolean; note?: string }>("state_set_enabled", {
    id,
    enabled,
  });
}

/** Mirror of forge_core::updater::UpdateEntry. */
export interface UpdateEntry {
  id: string;
  installed: string;
  latest: string;
  outdated: boolean;
}

export function updateCheck(): Promise<UpdateEntry[]> {
  return call<UpdateEntry[]>("update_check");
}

/** Mirror of `forge-core update apply` output. */
export interface UpdateApplyResult {
  id: string;
  updated: boolean;
  from?: string;
  to?: string;
  kind?: string;
  note?: string;
  imported?: Record<string, unknown>;
  install?: Record<string, unknown>;
}

export function updateApply(id: string): Promise<UpdateApplyResult> {
  return call<UpdateApplyResult>("update_apply", { id });
}

/** Mirror of `forge-core dependents` output. */
export interface DependentRef {
  kind: "plugin" | "agent" | "bundle";
  id: string;
  requires: string;
}

export function dependentsList(
  id: string
): Promise<{ id: string; dependents: DependentRef[] }> {
  return call<{ id: string; dependents: DependentRef[] }>("dependents_list", { id });
}

/** Mirror of forge_core::composer::ResolveReport. */
export interface ResolveReport {
  order: string[];
  conflicts: string[];
  missing: string[];
}

export interface ComposeGenerateResult {
  agentId: string;
  profile: string;
  dir: string;
  components: string[];
  profileBundles: string[];
  result?: { steps?: string[]; health?: { passed: boolean } };
  note?: string;
}

export function composeGenerate(
  name: string,
  ids: string[]
): Promise<ComposeGenerateResult> {
  return call<ComposeGenerateResult>("composer_generate", { name, ids });
}

export function composerResolve(ids: string[]): Promise<ResolveReport> {
  return call<ResolveReport>("composer_resolve", { ids });
}

/** Mirror of forge_core::logutil::LogEntry. */
export interface LogEntry {
  ts: string;
  id: string;
  kind: "install" | "security" | "harness";
  version: string;
  ok: boolean;
  steps: string[];
  code: string | null;
}

export function logsList(): Promise<LogEntry[]> {
  return call<LogEntry[]>("logs_list");
}

export function runtimeStop(pid: number): Promise<{ ok: boolean; pid: number }> {
  return call<{ ok: boolean; pid: number }>("runtime_stop", { pid });
}

/**
 * Open an external http(s) link in the system default browser.
 * Tauri's WebView blocks cross-origin navigation, so this goes through the
 * Rust `open_external` command; outside Tauri (plain browser preview) it
 * falls back to a normal new-tab popup.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    await invoke<void>("open_external", { url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function runtimeRestart(command: string): Promise<{ pid: number | null }> {
  return call<{ pid: number | null }>("runtime_restart", { command });
}

export interface AgentConfig {
  id: string;
  profile: string;
  path: string;
  text: string;
}

export function agentConfigGet(id: string): Promise<AgentConfig> {
  return call<AgentConfig>("agent_config_get", { id });
}

export function agentConfigSet(
  id: string,
  text: string
): Promise<{ id: string; saved: boolean; note?: string }> {
  return call<{ id: string; saved: boolean; note?: string }>("agent_config_set", {
    id,
    text,
  });
}

export function runtimeRun(
  profile: string
): Promise<{ pid: number; logFile: string }> {
  return call<{ pid: number; logFile: string }>("runtime_run", { profile });
}
