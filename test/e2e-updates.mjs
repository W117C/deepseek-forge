// e2e-updates：本地 Registry 更新执行（update check/apply）+ 反向依赖追踪（dependents）。
// 真实链路：plugin/imported 重新收录（克隆→扫描→登记新版本）；dependents 只读扫描 state + bundles。
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runForgeCore } from '../lib/forge-core-bin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-updates-home');
const REG = join(TEST_HOME, 'registry');
const financeDir = join(root, 'bundles', 'finance-analyst');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

function packageJson(id, version, deps) {
  return {
    schema: 'forge.package.v1',
    id,
    name: id,
    type: 'plugin',
    version,
    description: 'e2e updates fixture (真实代码：finance-analyst 目录作为扫描对象)',
    category: 'testing',
    tags: ['fixture'],
    publisher: { id: 'fixture-publisher', name: 'Fixture Publisher' },
    source: { type: 'github', repository: financeDir, ref: null, commit: null },
    upstream: {},
    license: { spdx: 'MIT', file: 'LICENSE' },
    compatibility: {
      forge: '0.4.0',
      dsh: { min: '0.1.0-rc.6', tested: [] },
      node: '>=22',
      platform: [],
    },
    capabilities: [],
    permissions: { network: [], env: [] },
    security: { scan: 'required', status: 'UNKNOWN', scannedAt: null, findings: [] },
    artifact: {
      filename: '',
      sha256: null,
      signature: null,
      signatureAlgorithm: null,
      publisherKeyId: null,
    },
    entrypoint: { type: 'harness-profile', profile: null, command: null, config: {} },
    dependencies: deps,
    runtime: {
      engine: 'deepseek-harness',
      profile: { name: 'default', bundles: [], patch: null },
      components: { bundles: [], presets: [], skills: [] },
      health: [],
    },
  };
}

console.log('== e2e-updates: update check/apply + dependents ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(join(REG, 'packages', 'fixture-plugin'), { recursive: true });
mkdirSync(join(REG, 'packages', 'fixture-helper'), { recursive: true });
mkdirSync(join(TEST_HOME, '.agenthub'), { recursive: true });
writeFileSync(
  join(REG, 'packages', 'fixture-plugin', 'package.json'),
  JSON.stringify(packageJson('fixture-plugin', '0.2.0', []), null, 2)
);
writeFileSync(
  join(REG, 'packages', 'fixture-helper', 'package.json'),
  JSON.stringify(packageJson('fixture-helper', '0.1.0', []), null, 2)
);
// 初始状态：fixture-plugin 已收录 0.1.0；fixture-consumer 声明依赖它
writeFileSync(
  join(TEST_HOME, '.agenthub', 'state.json'),
  JSON.stringify({
    agents: {
      'fixture-plugin': {
        kind: 'plugin',
        imported: true,
        version: '0.1.0',
        reviewStatus: 'pending',
        source: financeDir,
        license: 'MIT',
        dependencies: {},
      },
      'fixture-consumer': {
        kind: 'plugin',
        version: '0.1.0',
        dependencies: { 'fixture-plugin': '^0.2.0' },
      },
    },
  })
);

// 1. update check：plugin 类型也参与对比（STEP 12 修复），0.1.0 < 0.2.0 → outdated
const c1 = runForgeCore(['update', 'check', '--registry', REG, '--home', TEST_HOME]);
let entries = [];
try { entries = JSON.parse(c1.stdout); } catch { entries = []; }
const pl = entries.find(function (e) { return e.id === 'fixture-plugin'; });
check('update check 包含 plugin 条目', c1.status === 0 && !!pl, JSON.stringify(pl));
check('fixture-plugin outdated (0.1.0 < 0.2.0)', !!pl && pl.outdated === true && pl.installed === '0.1.0' && pl.latest === '0.2.0');

// 2. dependents：fixture-consumer 通过 dependencies 声明引用
const d1 = runForgeCore(['dependents', 'fixture-plugin', '--home', TEST_HOME]);
let dep1 = {};
try { dep1 = JSON.parse(d1.stdout); } catch { dep1 = {}; }
check(
  'dependents 找到 plugin 引用 (fixture-consumer ^0.2.0)',
  d1.status === 0 && Array.isArray(dep1.dependents) &&
    dep1.dependents.some(function (d) { return d.id === 'fixture-consumer' && d.kind === 'plugin' && d.requires === '^0.2.0'; }),
  JSON.stringify(dep1)
);

// 3. bundle create：组合引用也进入 dependents
const b1 = runForgeCore(['bundle', 'create', '--name', 'dbg', '--ids', 'fixture-plugin,fixture-helper', '--registry', REG, '--home', TEST_HOME]);
check('bundle create (fixture-plugin + fixture-helper)', b1.status === 0, (b1.stderr || b1.stdout || '').trim());
const d2 = runForgeCore(['dependents', 'fixture-plugin', '--home', TEST_HOME]);
let dep2 = {};
try { dep2 = JSON.parse(d2.stdout); } catch { dep2 = {}; }
check(
  'dependents 包含 bundle 引用',
  d2.status === 0 && Array.isArray(dep2.dependents) &&
    dep2.dependents.some(function (d) { return d.kind === 'bundle' && d.id === 'dbg'; }),
  JSON.stringify(dep2)
);

// 3.5 审核工作流：pending 拒绝更新 → 批准 → 放行
const a0 = runForgeCore(['update', 'apply', 'fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
check('待审核插件 update apply 被拒绝', a0.status !== 0 && /待审核/.test(a0.stderr || ''), (a0.stderr || '').trim().slice(0, 140));
const r0 = runForgeCore(['state', 'set-review', 'fixture-plugin', '--status', 'approved', '--home', TEST_HOME]);
let rv0 = {};
try { rv0 = JSON.parse(r0.stdout); } catch { rv0 = {}; }
check('set-review approved 写入', r0.status === 0 && rv0.reviewStatus === 'approved', JSON.stringify(rv0));
const st0 = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
check('state.json reviewStatus=approved', st0.agents['fixture-plugin'].reviewStatus === 'approved');

// 4. update apply：plugin/imported → 重新收录 → 状态升级到 0.2.0
const a1 = runForgeCore(['update', 'apply', 'fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
let applied = {};
try { applied = JSON.parse(a1.stdout); } catch { applied = {}; }
check(
  'update apply 真实升级 0.1.0 → 0.2.0',
  a1.status === 0 && applied.updated === true && applied.from === '0.1.0' && applied.to === '0.2.0',
  (a1.stderr || a1.stdout || '').trim()
);
const st = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
check('state.json 版本已更新为 0.2.0', st.agents['fixture-plugin'].version === '0.2.0');
check('重新收录保留 dependencies 登记', st.agents['fixture-plugin'].dependencies !== undefined);
// 更新 = 新版本收录 → 审核状态回到 pending（新版本需重新审核，诚实语义）
check('更新后 reviewStatus 回到 pending', st.agents['fixture-plugin'].reviewStatus === 'pending');
const r3 = runForgeCore(['state', 'set-review', 'fixture-plugin', '--status', 'approved', '--home', TEST_HOME]);
check('更新后重新批准', r3.status === 0);

// 5. 再次 apply → 已是最新
const a2 = runForgeCore(['update', 'apply', 'fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
let again = {};
try { again = JSON.parse(a2.stdout); } catch { again = {}; }
check('再次 apply 报已是最新', a2.status === 0 && again.updated === false);

// 6. 未安装包 → PACKAGE_NOT_FOUND
const a3 = runForgeCore(['update', 'apply', 'no-such-pkg', '--registry', REG, '--home', TEST_HOME]);
check('apply 未安装包 → 非零退出 + PACKAGE_NOT_FOUND', a3.status !== 0 && /PACKAGE_NOT_FOUND/.test(a3.stderr || ''));

// 7. check 复查：不再 outdated
const c2 = runForgeCore(['update', 'check', '--registry', REG, '--home', TEST_HOME]);
let entries2 = [];
try { entries2 = JSON.parse(c2.stdout); } catch { entries2 = []; }
const pl2 = entries2.find(function (e) { return e.id === 'fixture-plugin'; });
check('复查 check：fixture-plugin 已最新', !!pl2 && pl2.outdated === false);

// 7.5 拒绝（rejected）：更新被阻止 → 恢复 approved 供后续流程
const r1 = runForgeCore(['state', 'set-review', 'fixture-plugin', '--status', 'rejected', '--home', TEST_HOME]);
let rv1 = {};
try { rv1 = JSON.parse(r1.stdout); } catch { rv1 = {}; }
check('set-review rejected 写入', r1.status === 0 && rv1.reviewStatus === 'rejected');
const a5 = runForgeCore(['update', 'apply', 'fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
check('已拒绝插件 update apply 被阻止', a5.status !== 0 && /已被拒绝/.test(a5.stderr || ''), (a5.stderr || '').trim().slice(0, 140));
const r2 = runForgeCore(['state', 'set-review', 'fixture-plugin', '--status', 'approved', '--home', TEST_HOME]);
check('恢复 approved', r2.status === 0);

// 8. 禁用/启用：真实状态写入 + Forge 组合安装/更新拒绝使用被禁用插件
const s1 = runForgeCore(['state', 'set-enabled', 'fixture-plugin', '--enabled', 'false', '--home', TEST_HOME]);
let en1 = {};
try { en1 = JSON.parse(s1.stdout); } catch { en1 = {}; }
check('set-enabled false 写入成功', s1.status === 0 && en1.enabled === false, JSON.stringify(en1));
const st2 = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
check('state.json enabled=false', st2.agents['fixture-plugin'].enabled === false);

const a4 = runForgeCore(['update', 'apply', 'fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
check('禁用的插件 update apply 被拒绝', a4.status !== 0 && /禁用/.test(a4.stderr || ''), (a4.stderr || '').trim());

const b2 = runForgeCore(['bundle', 'install', 'dbg', '--registry', REG, '--home', TEST_HOME]);
let bin2 = {};
try { bin2 = JSON.parse(b2.stdout); } catch { bin2 = {}; }
check('禁用的组件使 bundle install 停止', b2.status === 0 && bin2.ok === false && /禁用/.test(JSON.stringify(bin2)), JSON.stringify(bin2));

const s2 = runForgeCore(['state', 'set-enabled', 'fixture-plugin', '--enabled', 'true', '--home', TEST_HOME]);
let en2 = {};
try { en2 = JSON.parse(s2.stdout); } catch { en2 = {}; }
check('set-enabled true 恢复', s2.status === 0 && en2.enabled === true);

const b3 = runForgeCore(['bundle', 'install', 'dbg', '--registry', REG, '--home', TEST_HOME]);
let bin3 = {};
try { bin3 = JSON.parse(b3.stdout); } catch { bin3 = {}; }
check('启用后 bundle install 全量成功', b3.status === 0 && bin3.ok === true, JSON.stringify(bin3));
check(
  'stderr 输出真实 install-progress 事件（组件级 + 阶段级）',
  /"event":"install-progress"/.test(b3.stderr || '') &&
    /"phase":"component"/.test(b3.stderr || '') &&
    /"phase":"installed"/.test(b3.stderr || ''),
  (b3.stderr || '').split('\n').filter((l) => l.includes('install-progress')).length + ' 条进度'
);
const stp = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
check(
  '收录登记真实权限来自扫描（network/filesystem/env 数组）',
  Array.isArray(stp.agents['fixture-plugin']?.permissions?.network) &&
    Array.isArray(stp.agents['fixture-plugin']?.permissions?.filesystem) &&
    Array.isArray(stp.agents['fixture-plugin']?.permissions?.env),
  JSON.stringify(stp.agents['fixture-plugin']?.permissions)
);

const b4 = runForgeCore(['bundle', 'uninstall', 'dbg', '--registry', REG, '--home', TEST_HOME]);
let bun4 = {};
try { bun4 = JSON.parse(b4.stdout); } catch { bun4 = {}; }
check('bundle uninstall 移除组件登记', b4.status === 0 && bun4.ok === true, JSON.stringify(bun4));
const st3 = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
check('卸载后 state 中组件已移除', st3.agents['fixture-plugin'] === undefined && st3.agents['fixture-helper'] === undefined);


const failed = results.filter(function (r) { return !r.ok; });
console.log('== e2e-updates: ' + (results.length - failed.length) + '/' + results.length + ' passed ==');
process.exit(failed.length > 0 ? 1 : 0);
