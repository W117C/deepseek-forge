// 安装器：快照 → 兼容检查 → 安全扫描 → 落盘（bundle/preset/skills/patch）→ 对账 → 健康检查。
// 任一步失败 → 自动恢复快照。所有写操作先快照，用户自有内容永不删除。
import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  dshHome, profileDir, presetDir, skillsDir, agenthubStore,
  initProfile, readManifest, writeManifest, runDsh, hasPnpm,
} from './dsh.mjs';
import { loadAgentManifest } from './manifest.mjs';
import { scanAgentDir } from './security.mjs';
import { loadState, saveState } from './state.mjs';
import { runHealth } from './health.mjs';

const MANAGED_BEGIN = (id) => `# --- agenthub managed (begin): ${id} ---`;
const MANAGED_END = (id) => `# --- agenthub managed (end): ${id} ---`;

export function ensureProfile(home, bin, name, bundles) {
  const dir = profileDir(home, name);
  if (!existsSync(join(dir, 'package.json'))) {
    initProfile(dir, bundles.filter((b) => !b.startsWith('@agenthub/')));
    // 官方 initProfile 只写 in-box bundles；第三方 bundle 由本安装器追加。
    const m = readManifest(dir);
    m.dsh.profile.bundles = [...bundles];
    writeManifest(dir, m);
  }
  return dir;
}

// 解引用复制：符号链接展开为真实内容（回滚后不依赖可能被删除/改写的链接目标）。
function copyDeref(src, dst) {
  rmSync(dst, { recursive: true, force: true });
  const st = statSync(src);
  if (!st.isDirectory()) { cpSync(src, dst); return; }
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const sst = statSync(s);
    if (sst.isDirectory()) copyDeref(s, d);
    else cpSync(s, d);
  }
}

// 快照：profile 关键文件 + 将被覆盖的 preset/skills 目录。
export function snapshot(home, { agentId, profileName, presetIds, skillNames }) {
  const store = agenthubStore(home);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapDir = join(store, 'snapshots', agentId, ts);
  mkdirSync(snapDir, { recursive: true });
  const pdir = profileDir(home, profileName);
  if (existsSync(pdir)) {
    mkdirSync(join(snapDir, 'profile'), { recursive: true });
    for (const f of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'cordis.yml']) {
      const src = join(pdir, f);
      if (existsSync(src)) cpSync(src, join(snapDir, 'profile', f));
    }
    if (existsSync(join(pdir, 'node_modules'))) {
      writeFileSync(join(snapDir, 'profile', '.had-node-modules'), '1');
    }
    // bundle 解析状态（升级回滚需要恢复 bundle 实体：symlink 或复制内容）
    const scopeProfile = join(pdir, 'node_modules', '@agenthub');
    if (existsSync(scopeProfile)) copyDeref(scopeProfile, join(snapDir, 'profile', '.nm-scope-agenthub'));
    const scopeFlat = join(join(pdir, '..'), 'node_modules', '@agenthub');
    if (existsSync(scopeFlat)) copyDeref(scopeFlat, join(snapDir, 'profile', '.nm-flat-agenthub'));
  } else {
    writeFileSync(join(snapDir, '.profile-missing'), '1');
  }
  for (const id of presetIds ?? []) {
    const src = presetDir(home, id);
    if (existsSync(src)) cpSync(src, join(snapDir, 'preset-' + id), { recursive: true });
  }
  for (const name of skillNames ?? []) {
    const src = skillsDir(home, name);
    if (existsSync(src)) cpSync(src, join(snapDir, 'skill-' + name), { recursive: true });
  }
  // 记录安装前的状态（升级回滚时恢复旧版本记录）
  const prior = loadState(home).agents?.[agentId];
  if (prior) writeFileSync(join(snapDir, 'prior-state.json'), JSON.stringify(prior, null, 2) + '\n');
  return { ts, snapDir };
}

export function restoreSnapshot(home, { agentId, ts, profileName, presetIds, skillNames }) {
  const snapDir = join(agenthubStore(home), 'snapshots', agentId, ts);
  const pdir = profileDir(home, profileName);
  if (existsSync(join(snapDir, '.profile-missing'))) {
    if (existsSync(pdir)) rmSync(pdir, { recursive: true, force: true });
  } else {
    mkdirSync(pdir, { recursive: true });
    for (const f of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'cordis.yml']) {
      const src = join(snapDir, 'profile', f);
      if (existsSync(src)) cpSync(src, join(pdir, f));
      else rmSync(join(pdir, f), { force: true });
    }
    if (!existsSync(join(snapDir, 'profile', '.had-node-modules'))) {
      rmSync(join(pdir, 'node_modules'), { recursive: true, force: true });
    }
    // 恢复 bundle 解析状态
    const sScope = join(snapDir, 'profile', '.nm-scope-agenthub');
    const scopeProfile = join(pdir, 'node_modules', '@agenthub');
    rmSync(scopeProfile, { recursive: true, force: true });
    if (existsSync(sScope)) cpSync(sScope, scopeProfile, { recursive: true });
    const sFlat = join(snapDir, 'profile', '.nm-flat-agenthub');
    const scopeFlat = join(join(pdir, '..'), 'node_modules', '@agenthub');
    rmSync(scopeFlat, { recursive: true, force: true });
    if (existsSync(sFlat)) cpSync(sFlat, scopeFlat, { recursive: true });
  }
  for (const id of presetIds ?? []) {
    const dst = presetDir(home, id);
    rmSync(dst, { recursive: true, force: true });
    const src = join(snapDir, 'preset-' + id);
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  }
  for (const name of skillNames ?? []) {
    const dst = skillsDir(home, name);
    rmSync(dst, { recursive: true, force: true });
    const src = join(snapDir, 'skill-' + name);
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  }
  // 恢复状态：有旧记录则回滚到旧记录（升级回滚），无则删除条目（卸载）
  const state = loadState(home);
  const priorPath = join(snapDir, 'prior-state.json');
  if (existsSync(priorPath)) state.agents[agentId] = JSON.parse(readFileSync(priorPath, 'utf8'));
  else delete state.agents[agentId];
  saveState(home, state);
}

// 把 bundle 包复制进 profile 的 node_modules（无需 npm/pnpm：插件依赖由 dsh 启动时的
// flat module fallback 解析，见 dsh-app-boot healProfilesModuleFallback）。
export function installBundleIntoProfile(home, bundleSrcDir, packageName) {
  const dest = join(home, 'profiles', 'node_modules', ...packageName.split('/'));
  mkdirSync(dest, { recursive: true });
  // 若已有同包，仅覆盖我们管理的文件（保留用户手工改动的风险：M1 直接覆盖，快照兜底）
  rmSync(dest, { recursive: true, force: true });
  cpSync(bundleSrcDir, dest, { recursive: true, filter: (src) => !basename(src).startsWith('.') });
  return dest;
}

function mergeProfilePatch(patchPath, agentId, rowsText) {
  const begin = MANAGED_BEGIN(agentId), end = MANAGED_END(agentId);
  let content = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  content = content.replace(new RegExp(esc(begin) + '[\\s\\S]*?' + esc(end) + '\\n?'), '');
  // profile.patch.yml 里用于保持独立文件合法性的 [] 只作占位，合并时丢弃，
  // 保证最终文件有且只有一个 YAML 文档根（真实行直接成为列表内容，纯注释保留 []）。
  const rows = rowsText.split('\n').filter((l) => l.trim() !== '[]').join('\n').trim();
  const hasRealRows = rows.split('\n').some((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const block = begin + '\n' + (rows ? rows + '\n' : '') + end + '\n';
  // 模板判断只看有效内容（忽略注释/空行），否则带头部注释的模板永远不匹配
  const effective = content.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#')).map((l) => l.trim()).join('\n');
  if (effective === '' || effective === '[]') {
    content = hasRealRows ? (begin + '\n' + rows + '\n' + end + '\n') : ('[]\n' + block);
  } else {
    content = content.replace(/\s*$/, '\n\n') + block;
  }
  writeFileSync(patchPath, content);
  return patchPath;
}

export function install({ agentDir, home, bin, profileName, yes = false, smoke = false, trust }) {
  const manifest = loadAgentManifest(agentDir);
  const agentId = manifest.id;
  const steps = [];
  const step = (name, fn) => {
    steps.push(name);
    const r = fn();
    return r;
  };

  // 1. 兼容检查
  step('compatibility', () => {
    const node = process.versions.node.split('.')[0];
    const need = manifest.compatibility?.node ?? '>=20';
    const min = Number((need.match(/\d+/) || ['20'])[0]);
    if (Number(node) < min) throw new Error('Node ' + node + ' 不满足 ' + need);
    const dv = manifest.compatibility?.dsh;
    return { node, dshDeclared: dv ?? null };
  });

  // 2. 安全扫描（trust 默认取 manifest.trust）
  const scan = step('security-scan', () => {
    const t = trust || manifest.trust || 'community';
    const s = scanAgentDir(agentDir, { trust: t });
    if (s.verdict === 'block') {
      throw new Error('安全扫描阻断：' + s.high + ' 个高危发现。用 --trust official 仅限官方包；第三方高危包拒绝安装。');
    }
    return { ...s, trust: t };
  });

  // 3. 快照
  const presetIds = manifest.components.presets.map((p) => p.id);
  const skillNames = manifest.components.skills ?? [];
  const snap = step('snapshot', () =>
    snapshot(home, { agentId, profileName, presetIds, skillNames }));

  try {
    // 4. profile 初始化 + bundles 列表
    const pdir = step('init-profile', () =>
      ensureProfile(home, bin, profileName, manifest.profile.bundles));

    // 5. 安装 bundles：pnpm 官方路径（dsh plugin，官方对账）优先；无 pnpm 时复制兜底。
    step('install-bundles', () => {
      const useOfficial = hasPnpm();
      const m = readManifest(pdir);
      for (const b of manifest.components.bundles) {
        const pkgName = b.package;
        // 约定：bundle 包源码位于 <agentDir>/bundle/<包名末段>/，或单包布局 <agentDir>/bundle/
        let bundleSrc = join(agentDir, 'bundle', pkgName.split('/').pop());
        if (!existsSync(join(bundleSrc, 'package.json'))) {
          const alt = join(agentDir, 'bundle');
          if (existsSync(join(alt, 'package.json'))) bundleSrc = alt;
        }
        if (!existsSync(join(bundleSrc, 'package.json'))) throw new Error('找不到 bundle 包目录：' + pkgName);
        if (useOfficial) {
          // 官方路径：写 link: 依赖规格 → dsh plugin install（pnpm install + 官方对账）。
          // 注意：不用 file:——pnpm 会缓存目录内容，同名跨版本升级不刷新（e2e 实测）；
          // link: 生成符号链接，永远解析到最新目录内容。
          m.dependencies = m.dependencies ?? {};
          m.dependencies[pkgName] = 'link:' + bundleSrc;
          writeManifest(pdir, m);
          const r = runDsh(bin, ['plugin', '--profile', profileName, 'install'], { home, timeoutMs: 300000 });
          if (r.status !== 0) throw new Error('dsh plugin install 失败: ' + ((r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-3).join(' | ')));
        } else {
          installBundleIntoProfile(home, bundleSrc, pkgName);
          const list = m.dsh.profile.bundles;
          if (!list.includes(pkgName)) list.push(pkgName);
          m.dependencies = m.dependencies ?? {};
          m.dependencies[pkgName] = b.version ?? '0.0.0';
        }
      }
      if (!useOfficial) writeManifest(pdir, m);
      return { pdir, path: useOfficial ? 'dsh-plugin(pnpm install)' : 'copy(fallback)' };
    });

    // 6. 安装 presets（含 preset 目录内 skills）
    step('install-presets', () => {
      for (const p of manifest.components.presets) {
        const src = join(agentDir, 'preset', p.id);
        let from = src;
        if (!existsSync(join(from, 'agent.cordis.yml'))) {
          // 支持单预设目录布局 <agentDir>/preset/
          const alt = join(agentDir, 'preset');
          if (existsSync(join(alt, 'agent.cordis.yml'))) from = alt;
        }
        if (!existsSync(join(from, 'agent.cordis.yml'))) throw new Error('找不到 preset 组合文件：' + p.id);
        const dst = presetDir(home, p.id);
        rmSync(dst, { recursive: true, force: true });
        cpSync(from, dst, { recursive: true });
      }
      return presetIds;
    });

    // 7. 安装 skills 到用户 skills 根（跨 preset 可见；同时保留 preset 目录内副本）
    step('install-skills', () => {
      for (const name of manifest.components.skills) {
        const srcCandidates = [
          join(agentDir, 'skills', name),
          join(agentDir, 'preset', 'skills', name),
          join(agentDir, 'preset', manifest.components.presets[0]?.id, 'skills', name),
        ];
        const src = srcCandidates.find((s) => existsSync(join(s, 'SKILL.md')));
        if (!src) throw new Error('找不到 skill：' + name);
        const dst = skillsDir(home, name);
        rmSync(dst, { recursive: true, force: true });
        cpSync(src, dst, { recursive: true });
      }
      return skillNames;
    });

    // 8. profile patch 合并
    step('merge-patch', () => {
      const patchFile = manifest.profile?.patch;
      const pdir = profileDir(home, profileName);
      const patchPath = join(pdir, 'cordis.patch.yml');
      if (patchFile) {
        const rowsText = readFileSync(join(agentDir, patchFile), 'utf8');
        mergeProfilePatch(patchPath, agentId, rowsText);
      }
      return patchPath;
    });

    // 9. 状态落盘
    step('save-state', () => {
      const state = loadState(home);
      state.agents[agentId] = {
        version: manifest.version,
        profile: profileName,
        installedAt: new Date().toISOString(),
        snapshot: snap,
        presetIds, skillNames,
        bundles: manifest.components.bundles,
        permissions: manifest.permissions,
        trust: scan.trust, score: scan.score,
      };
      saveState(home, state);
      return state;
    });

    // 10. 健康检查
    const health = step('health-check', () =>
      runHealth(bin, home, profileName, (manifest.health ?? []).flatMap((h) => h['expect-rows'] ?? []), smoke));

    return { manifest, steps, scan, health, snapshot: snap };
  } catch (err) {
    // 失败即回滚
    try { restoreSnapshot(home, { agentId, ts: snap.ts, profileName, presetIds, skillNames }); }
    catch (rb) { err.rollbackError = String(rb); }
    err.installedSteps = steps;
    throw err;
  }
}

export function rollback(home, agentId) {
  const state = loadState(home);
  const rec = state.agents?.[agentId];
  if (!rec) throw new Error('未安装：' + agentId);
  restoreSnapshot(home, { agentId, ts: rec.snapshot.ts, profileName: rec.profile, presetIds: rec.presetIds, skillNames: rec.skillNames });
  return { agentId, restored: rec.snapshot.ts, state: loadState(home).agents?.[agentId] ?? null };
}

// 社区目录插件安装：官方 dsh plugin add <source> + 快照 + 状态记录（可回滚）。
export function installCatalogPlugin({ name, source, home, bin, profileName }) {
  const snap = snapshot(home, { agentId: name, profileName, presetIds: [], skillNames: [] });
  try {
    ensureProfile(home, bin, profileName, ['@deepseek-ai/dsh-base']);
    const r = runDsh(bin, ['plugin', '--profile', profileName, 'add', source], { home, timeoutMs: 300000 });
    if (r.status !== 0) throw new Error('dsh plugin add 失败: ' + ((r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-3).join(' | ')));
    const state = loadState(home);
    state.agents[name] = {
      kind: 'plugin', source, profile: profileName, installedAt: new Date().toISOString(),
      snapshot: snap, presetIds: [], skillNames: [], bundles: [], trust: 'community', permissions: { network: [], env: [] },
    };
    saveState(home, state);
    return { name, profile: profileName, snapshot: snap };
  } catch (err) {
    try { restoreSnapshot(home, { agentId: name, ts: snap.ts, profileName, presetIds: [], skillNames: [] }); }
    catch (e2) { err.rollbackError = String(e2); }
    throw err;
  }
}
