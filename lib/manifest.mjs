import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from './yamllite.mjs';

export function loadAgentManifest(agentDir) {
  const p = join(agentDir, 'agenthub.yaml');
  if (!existsSync(p)) throw new Error(`manifest not found: ${p}`);
  const m = parseYaml(readFileSync(p, 'utf8'));
  const required = ['id', 'name', 'version', 'components'];
  for (const k of required) {
    if (m[k] === undefined) throw new Error(`manifest missing required field: ${k}`);
  }
  if (m.schema !== 'agenthub.dev/agent/v1') throw new Error(`unsupported schema: ${m.schema}`);
  if (m.runtime && m.runtime !== 'deepseek-harness') throw new Error(`unsupported runtime: ${m.runtime}`);
  m.components = m.components ?? {};
  m.components.bundles = m.components.bundles ?? [];
  m.components.presets = m.components.presets ?? [];
  m.components.skills = m.components.skills ?? [];
  m.profile = m.profile ?? {};
  m.profile.bundles = m.profile.bundles ?? [];
  m.permissions = m.permissions ?? { network: [], env: [] };
  return m;
}
