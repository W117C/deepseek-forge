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
