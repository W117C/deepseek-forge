import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { agenthubStore } from './dsh.mjs';

export function loadState(home) {
  const p = join(agenthubStore(home), 'state.json');
  if (!existsSync(p)) return { agents: {} };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { agents: {} }; }
}

export function saveState(home, state) {
  const dir = agenthubStore(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, undefined, 2) + '\n');
}
