// e2e-compose：Agent Builder —— 组合 Finance + Academic → 新 Agent，端到端验证。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { locateDsh, profileDir, presetDir, skillsDir, runDsh } from '../lib/dsh.mjs';
import { loadAgentManifest } from '../lib/manifest.mjs';
import { loadState } from '../lib/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const CLI = join(root, 'cli', 'agenthub.mjs');
const financeDir = join(root, 'bundles', 'finance-analyst');
const researchDir = join(root, 'bundles', 'academic-researcher');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}
function run(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { env: { ...process.env, DSH_HOME: TEST_HOME } });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 300000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout: out, stderr: err }); });
  });
}

console.log('== e2e-compose: Agent Builder 组合 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

// 1. 组合
const comboDir = join(TEST_HOME, 'investment-research');
const c = await run(['compose', 'Investment Research', '--from', financeDir, '--from', researchDir, '--category', '投资研究 Invest', '--publisher', 'combo-demo', '--out', comboDir]);
check('compose 生成成功', c.status === 0 && existsSync(join(comboDir, 'agenthub.yaml')), (c.stdout + c.stderr).split('\n').filter(Boolean).slice(-1).join(' | '));
const m = loadAgentManifest(comboDir);
check('bundles 并集 2', m.components.bundles.length === 2, JSON.stringify(m.components.bundles.map((b) => b.package)));
check('presets 并集 2', m.components.presets.length === 2, JSON.stringify(m.components.presets.map((p) => p.id)));
check('skills 并集 4', m.components.skills.length === 4, JSON.stringify(m.components.skills));
check('网络权限并集', m.permissions.network.length === 2 && m.permissions.network.includes('localhost:3111') && m.permissions.network.includes('localhost:3112'), JSON.stringify(m.permissions.network));
check('profile.bundles 含两个 bundle 包', m.profile.bundles.includes('@agenthub/finance-core') && m.profile.bundles.includes('@agenthub/research-core'), JSON.stringify(m.profile.bundles));

// 2. 安装组合 Agent
const i = await run(['install', comboDir, '--home', TEST_HOME, '--yes']);
check('组合 Agent 安装健康 PASS', i.status === 0 && /健康检查：PASS/.test(i.stdout + i.stderr), (i.stdout + i.stderr).split('\n').filter((l) => /健康|失败/.test(l)).slice(0, 2).join(' | '));
const dump = runDsh(bin, ['--profile', 'investment-research', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dt = (dump.stdout || '') + (dump.stderr || '');
check('组合树同时含 market-data 与 papers', dump.status === 0 && dt.includes('mcp-market-data') && dt.includes('mcp-papers'), 'exit=' + dump.status);
check('两个 preset 均已安装', existsSync(join(presetDir(TEST_HOME, 'finance-analyst'), 'agent.cordis.yml')) && existsSync(join(presetDir(TEST_HOME, 'academic-researcher'), 'agent.cordis.yml')));
check('4 个 skills 均已安装', ['financial-analysis', 'company-research', 'literature-review', 'paper-analysis'].every((s) => existsSync(join(skillsDir(TEST_HOME, s), 'SKILL.md'))));
const st = loadState(TEST_HOME).agents['investment-research'];
check('状态记录组合 Agent', !!st && st.trust === 'community', JSON.stringify({ trust: st?.trust }));

// 3. 回滚
const rb = await run(['rollback', 'investment-research', '--home', TEST_HOME]);
check('组合 Agent 可回滚', rb.status === 0, (rb.stdout + rb.stderr).trim().split('\n').pop());
check('回滚后 profile 移除', !existsSync(profileDir(TEST_HOME, 'investment-research')));

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-compose: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
