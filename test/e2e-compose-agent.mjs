// e2e-compose-agent：组合生成真实 Agent —— 官方 Agent 组件 → 生成目录 → 完整安装管线 → 可运行 profile。
// 同时验证诚实拒绝：未适配（非 Agent / 无运行 bundle）的组件不能伪装成可运行。
import { rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runForgeCore } from '../lib/forge-core-bin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-compose-home');
const REG = join(TEST_HOME, 'registry');
const financeDir = join(root, 'bundles', 'finance-analyst');
const researchDir = join(root, 'bundles', 'academic-researcher');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

console.log('== e2e-compose-agent: 组合生成可运行 Agent ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });

// 1. 临时 Registry：导入两个官方 Agent（真实制品）
const imp1 = runForgeCore(['registry', 'import', financeDir, '--registry', REG]);
const imp2 = runForgeCore(['registry', 'import', researchDir, '--registry', REG]);
check('registry import 两个官方 Agent', imp1.status === 0 && imp2.status === 0);

// 2. 未适配组件被诚实拒绝：写入一个 github 类型 plugin fixture（无运行 bundle）
mkdirSync(join(REG, 'packages', 'fixture-plugin'), { recursive: true });
writeFileSync(
  join(REG, 'packages', 'fixture-plugin', 'package.json'),
  JSON.stringify({
    schema: 'forge.package.v1',
    id: 'fixture-plugin',
    name: 'fixture-plugin',
    type: 'plugin',
    version: '0.1.0',
    description: 'fixture',
    publisher: { id: 'fixture', name: 'Fixture' },
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
    artifact: { filename: '', sha256: null, signature: null, signatureAlgorithm: null, publisherKeyId: null },
    entrypoint: { type: 'harness-profile', profile: null, command: null, config: {} },
    dependencies: [],
    runtime: {
      engine: 'deepseek-harness',
      profile: { name: 'default', bundles: [], patch: null },
      components: { bundles: [], presets: [], skills: [] },
      health: [],
    },
  }, null, 2)
);
const rej = runForgeCore(['composer', 'generate', '--name', 'Bad', '--ids', 'finance-analyst,fixture-plugin', '--registry', REG, '--home', TEST_HOME]);
check('未适配组件被拒绝（不伪装可运行）', rej.status !== 0 && /不是 Agent|尚未适配/.test(rej.stderr || ''), (rej.stderr || '').trim().slice(0, 160));

// 3. 真实组合生成 + 安装
const gen = runForgeCore(['composer', 'generate', '--name', 'Research Stack', '--ids', 'finance-analyst,academic-researcher', '--registry', REG, '--home', TEST_HOME]);
let out = {};
try { out = JSON.parse(gen.stdout); } catch { out = {}; }
check('composer generate 成功', gen.status === 0 && out.agentId === 'research-stack', (gen.stderr || gen.stdout || '').trim().slice(0, 200));
check(
  'profile bundles 合并两个组件',
  Array.isArray(out.profileBundles) &&
    out.profileBundles.includes('@agenthub/finance-core') &&
    out.profileBundles.includes('@agenthub/research-core'),
  JSON.stringify(out.profileBundles)
);
check('健康检查通过', out.result?.health?.passed === true, JSON.stringify(out.result?.health));
check(
  'stderr 输出 install-progress 事件',
  /"event":"install-progress"/.test(gen.stderr || '') && /"phase":"installed"/.test(gen.stderr || ''),
  (gen.stderr || '').split('\n').filter((l) => l.includes('install-progress')).length + ' 条'
);
const st = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'state.json'), 'utf8'));
const a = st.agents && st.agents['research-stack'];
check('state 登记 profile=research-stack', !!a && a.profile === 'research-stack', JSON.stringify(a));
const genDir = join(TEST_HOME, '.deepseek-forge', 'generated', 'research-stack');
const bdirs = [join(genDir, 'bundle', 'finance-core'), join(genDir, 'bundle', 'research-core')];
check('生成目录包含两个组件 bundle 源码', bdirs.every((d) => { try { return readdirSync(d).length > 0; } catch { return false; } }));

// 4. 缺失组件 → 明确报错
const miss = runForgeCore(['composer', 'generate', '--name', 'X', '--ids', 'finance-analyst,no-such', '--registry', REG, '--home', TEST_HOME]);
check('缺失组件报错', miss.status !== 0 && /PACKAGE_NOT_FOUND|not found/i.test(miss.stderr || ''));

const failed = results.filter((r) => !r.ok);
console.log('== e2e-compose-agent: ' + (results.length - failed.length) + '/' + results.length + ' passed ==');
process.exit(failed.length > 0 ? 1 : 0);
