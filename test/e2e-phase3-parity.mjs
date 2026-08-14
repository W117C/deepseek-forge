// e2e-phase3-parity —— Rust 安装引擎 vs 旧 Node 实现（git HEAD 版本）逐项 parity。
// 对照组：git show 6f07733:lib/*.mjs 提取到临时目录。
// 6f07733 = 委托桥提交（efe9d67）的父提交，即最后一个含原 Node 实现的 commit。
// 结论：18 套既有 e2e 现经 lib/installer.mjs 委托桥驱动 Rust 引擎，断言不变仍全绿。
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { locateDsh } from '../lib/dsh.mjs';
import { forgeCoreBin } from '../lib/forge-core-bin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

console.log('== e2e-phase3-parity: Rust 引擎 vs 旧 Node 实现 ==');

// 1. 提取旧实现（git HEAD）到临时 lib
const OLD_LIB = join(root, '.e2e-parity-oldlib');
rmSync(OLD_LIB, { recursive: true, force: true });
mkdirSync(OLD_LIB, { recursive: true });
const OLD_FILES = ['installer.mjs', 'signing.mjs', 'security.mjs', 'dsh.mjs', 'state.mjs', 'health.mjs', 'manifest.mjs', 'yamllite.mjs'];
for (const f of OLD_FILES) {
  writeFileSync(join(OLD_LIB, f), execSync(`git show 6f07733:lib/${f}`, { encoding: 'utf8' }));
}
const oldInstaller = await import(pathToFileURL(join(OLD_LIB, 'installer.mjs')).href);

const bin = locateDsh();
const core = forgeCoreBin();
check('dsh 定位', !!bin, bin ?? '未找到');
check('forge-core 定位', !!core, core ?? '未找到');
if (!bin || !core) process.exit(1);

function treeDigest(dir) {
  const out = [];
  const walk = (d, rel) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const r = rel ? rel + '/' + name : name;
      const st = statSync(p);
      if (st.isDirectory()) walk(p, r);
      else {
        const h = createHash('sha256').update(readFileSync(p)).digest('hex');
        out.push(r + ':' + h);
      }
    }
  };
  walk(dir, '');
  return out.sort();
}

function snapRelStruct(snapRoot) {
  // 忽略 ts 目录名：只对比快照内部相对结构
  const out = [];
  if (!existsSync(snapRoot)) return out;
  for (const ts of readdirSync(snapRoot)) {
    const walk = (d, rel) => {
      if (!existsSync(d)) return;
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        const r = rel ? rel + '/' + name : name;
        const st = statSync(p);
        if (st.isDirectory()) walk(p, r);
        else out.push(r);
      }
    };
    walk(join(snapRoot, ts), '');
  }
  return out.sort();
}

const stripTs = (s) => {
  const { installedAt, snapshot, ...rest } = s ?? {};
  return rest;
};

async function compare(agentName, profile) {
  const agentDir = join(root, 'bundles', agentName);
  const oldHome = join(root, '.e2e-parity-old', agentName);
  const newHome = join(root, '.e2e-parity-new', agentName);
  rmSync(oldHome, { recursive: true, force: true });
  rmSync(newHome, { recursive: true, force: true });
  mkdirSync(oldHome, { recursive: true });
  mkdirSync(newHome, { recursive: true });

  const oldRes = oldInstaller.install({ agentDir, home: oldHome, bin, profileName: profile, yes: true });
  const newRaw = spawnSync(core, ['install', agentDir, '--home', newHome, '--bin', bin, '--profile', profile, '--yes'], { encoding: 'utf8', timeout: 600000 });
  const newRes = newRaw.status === 0 ? JSON.parse(newRaw.stdout) : null;
  check(agentName + ' 旧引擎安装成功', !!oldRes && oldRes.health.passed, oldRes ? oldRes.steps.join('→') : '');
  check(agentName + ' Rust 引擎安装成功', !!newRes && newRes.health.passed, newRes ? newRes.steps.join('→') : String(newRaw.stderr).slice(0, 160));
  if (!oldRes || !newRes) return;

  check(agentName + ' steps 序列一致', JSON.stringify(oldRes.steps) === JSON.stringify(newRes.steps),
    JSON.stringify(oldRes.steps) + ' vs ' + JSON.stringify(newRes.steps));

  const sOld = JSON.parse(readFileSync(join(oldHome, '.agenthub/state.json'), 'utf8')).agents?.[agentName];
  const sNew = JSON.parse(readFileSync(join(newHome, '.agenthub/state.json'), 'utf8')).agents?.[agentName];
  check(agentName + ' state 记录一致', JSON.stringify(stripTs(sOld)) === JSON.stringify(stripTs(sNew)),
    JSON.stringify(stripTs(sOld)) + ' vs ' + JSON.stringify(stripTs(sNew)));

  const po = JSON.parse(readFileSync(join(oldHome, 'profiles', profile, 'package.json'), 'utf8'));
  const pn = JSON.parse(readFileSync(join(newHome, 'profiles', profile, 'package.json'), 'utf8'));
  check(agentName + ' profile.bundles 一致', JSON.stringify(po.dsh.profile.bundles) === JSON.stringify(pn.dsh.profile.bundles));
  check(agentName + ' profile.dependencies 一致', JSON.stringify(po.dependencies ?? {}) === JSON.stringify(pn.dependencies ?? {}));
  check(agentName + ' cordis.patch.yml 一致',
    readFileSync(join(oldHome, 'profiles', profile, 'cordis.patch.yml'), 'utf8') ===
    readFileSync(join(newHome, 'profiles', profile, 'cordis.patch.yml'), 'utf8'));

  for (const pid of sNew?.presetIds ?? []) {
    check(agentName + ' preset/' + pid + ' 树一致',
      JSON.stringify(treeDigest(join(oldHome, '.agent-presets', pid))) === JSON.stringify(treeDigest(join(newHome, '.agent-presets', pid))));
  }
  for (const sk of sNew?.skillNames ?? []) {
    check(agentName + ' skill/' + sk + ' 树一致',
      JSON.stringify(treeDigest(join(oldHome, 'skills', sk))) === JSON.stringify(treeDigest(join(newHome, 'skills', sk))));
  }

  check(agentName + ' 快照相对结构一致',
    JSON.stringify(snapRelStruct(join(oldHome, '.agenthub/snapshots', agentName))) ===
    JSON.stringify(snapRelStruct(join(newHome, '.agenthub/snapshots', agentName))));

  // rollback parity
  oldInstaller.rollback(oldHome, agentName);
  const rbNew = spawnSync(core, ['rollback', agentName, '--home', newHome], { encoding: 'utf8', timeout: 120000 });
  check(agentName + ' Rust rollback 成功', rbNew.status === 0, String(rbNew.stderr).slice(0, 160));
  const aOld = JSON.parse(readFileSync(join(oldHome, '.agenthub/state.json'), 'utf8')).agents ?? {};
  const aNew = JSON.parse(readFileSync(join(newHome, '.agenthub/state.json'), 'utf8')).agents ?? {};
  check(agentName + ' rollback 后双方 state 一致清空', !aOld[agentName] && !aNew[agentName],
    JSON.stringify(Object.keys(aOld)) + ' vs ' + JSON.stringify(Object.keys(aNew)));
}

function failRollbackParity() {
  const agentDir = join(root, '.e2e-parity-evil');
  rmSync(agentDir, { recursive: true, force: true });
  mkdirSync(join(agentDir, 'preset/evil-preset'), { recursive: true });
  writeFileSync(join(agentDir, 'agenthub.yaml'), [
    'schema: agenthub.dev/agent/v1',
    'id: evil-agent',
    'name: Evil Agent',
    'version: 0.1.0',
    'description: parity fixture',
    'publisher:',
    '  id: fixture',
    'runtime: deepseek-harness',
    'components:',
    '  bundles: []',
    '  presets:',
    '    - id: evil-preset',
    '      base: standard',
    '  skills: []',
    'profile:',
    '  name: evil',
    '  bundles: ["@deepseek-ai/dsh-base"]',
    'permissions:',
    '  network: []',
    '  env: []',
    '',
  ].join('\n'));
  writeFileSync(join(agentDir, 'preset/evil-preset/agent.cordis.yml'), 'hooks:\n  - !!js process.exit(1)\n');

  const oldHome = join(root, '.e2e-parity-old', 'evil');
  const newHome = join(root, '.e2e-parity-new', 'evil');
  rmSync(oldHome, { recursive: true, force: true });
  rmSync(newHome, { recursive: true, force: true });
  mkdirSync(oldHome, { recursive: true });
  mkdirSync(newHome, { recursive: true });

  let oldErr = null;
  try {
    oldInstaller.install({ agentDir, home: oldHome, bin, profileName: 'evil', yes: true, trust: 'community' });
  } catch (e) {
    oldErr = e;
  }
  check('高危 fixture 旧引擎阻断', !!oldErr && /安全扫描阻断/.test(String(oldErr.message)), String(oldErr?.message).slice(0, 120));

  const newRaw = spawnSync(core, ['install', agentDir, '--home', newHome, '--bin', bin, '--profile', 'evil', '--yes', '--trust', 'community'], { encoding: 'utf8', timeout: 300000 });
  const newEnv = (() => { try { return JSON.parse(newRaw.stderr); } catch { return null; } })();
  check('高危 fixture Rust 引擎阻断', newRaw.status !== 0 && newEnv?.code === 'SECURITY_BLOCKED', String(newRaw.stderr).slice(0, 160));
  check('旧引擎回滚无残留', !existsSync(join(oldHome, 'profiles/evil')) && !existsSync(join(oldHome, '.agent-presets/evil-preset')));
  check('Rust 引擎回滚无残留', !existsSync(join(newHome, 'profiles/evil')) && !existsSync(join(newHome, '.agent-presets/evil-preset')));
  const sNewPath = join(newHome, '.agenthub/state.json');
  const sNew = existsSync(sNewPath) ? (JSON.parse(readFileSync(sNewPath, 'utf8')).agents ?? {}) : {};
  check('Rust 引擎 state 无 evil 记录', !sNew['evil-agent']);
}

await compare('finance-analyst', 'finance');
await compare('academic-researcher', 'research');
failRollbackParity();

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-phase3-parity: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) {
  for (const x of failed) console.log('  - ' + x.name + ' ' + x.detail);
  process.exit(1);
}
process.exit(0);
