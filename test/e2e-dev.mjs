// e2e-dev：开发者闭环——脚手架 → 本地安装验证 → 发布（审核队列）→ 审批 → 远端安装 → 回滚。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRegistry } from '../lib/registry-server.mjs';
import { locateDsh, profileDir, runDsh, systemPresetsDir } from '../lib/dsh.mjs';
import { loadState } from '../lib/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const CLI = join(root, 'cli', 'agenthub.mjs');

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

console.log('== e2e-dev: 开发者脚手架与发布闭环 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

// 1. 脚手架生成
const agentDir = join(TEST_HOME, 'travel-planner');
const c1 = await run(['create', 'Travel Planner', '--category', '旅行 Travel', '--publisher', 'dev-demo', '--out', agentDir]);
check('create 生成成功', c1.status === 0 && existsSync(join(agentDir, 'agenthub.yaml')), (c1.stdout + c1.stderr).split('\n').filter(Boolean).slice(-1).join(' | '));
check('生成 bundle 包（dsh.bundle 声明）', (() => { const p = JSON.parse(readFileSync(join(agentDir, 'bundle', 'travel-planner-core', 'package.json'), 'utf8')); return p.dsh?.bundle?.patch === './cordis.patch.yml'; })());
const ourPreset = readFileSync(join(agentDir, 'preset', 'travel-planner', 'agent.cordis.yml'), 'utf8');
check('生成 preset（含占位 persona）', ourPreset.includes('You are the Travel Planner agent') && ourPreset.includes('TODO:'));
check('生成 skill 与 profile patch 骨架', existsSync(join(agentDir, 'preset', 'travel-planner', 'skills', 'hello-skill', 'SKILL.md')) && existsSync(join(agentDir, 'profile.patch.yml')));

// 2. 本地安装验证（健康检查 + 组合树含 hello-row）
const i1 = await run(['install', agentDir, '--home', TEST_HOME, '--yes']);
check('本地安装健康 PASS', i1.status === 0 && /健康检查：PASS/.test(i1.stdout + i1.stderr), (i1.stdout + i1.stderr).split('\n').filter((l) => /健康|失败/.test(l)).slice(0, 2).join(' | '));
const dump = runDsh(bin, ['--profile', 'travel-planner', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dt = (dump.stdout || '') + (dump.stderr || '');
check('组合树含 hello-row', dump.status === 0 && dt.includes('hello-row'), 'exit=' + dump.status);
check('状态记录 trust=community', loadState(TEST_HOME).agents['travel-planner']?.trust === 'community');

// 3. 发布（非官方发布者 → 审核队列）
await run(['keygen', '--home', TEST_HOME]);
const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), allowInsecure: true });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
const p1 = await run(['publish', agentDir, '--registry', REG, '--home', TEST_HOME]);
check('发布进入审核队列（202）', p1.status === 0 && /审核队列/.test(p1.stdout + p1.stderr), (p1.stdout + p1.stderr).trim().split('\n').pop());
const list1 = await (await fetch(REG + '/v1/agents')).json();
check('审批前不可见', !list1.some((a) => a.id === 'travel-planner'), '');
const pend = await (await fetch(REG + '/v1/pending')).json();
check('待审队列含 travel-planner', pend.some((p) => p.id === 'travel-planner' && p.publisher === 'dev-demo'), JSON.stringify(pend.map((p) => p.id)));

// 4. 运营审批 → 远端安装
const rev = await (await fetch(REG + '/v1/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'travel-planner', version: '0.1.0', approve: true }) })).json();
check('审批通过', rev.approve === true, JSON.stringify(rev));
const i2 = await run(['install', 'travel-planner', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('审批后远端安装成功', i2.status === 0 && /校验通过/.test(i2.stdout + i2.stderr), (i2.stdout + i2.stderr).split('\n').filter((l) => /校验|失败/.test(l)).slice(0, 2).join(' | '));
const dump2 = runDsh(bin, ['--profile', 'travel-planner', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dt2 = (dump2.stdout || '') + (dump2.stderr || '');
check('远端安装组合树含 hello-row', dump2.status === 0 && dt2.includes('hello-row'));

// 5. 回滚
const rb = await run(['rollback', 'travel-planner', '--home', TEST_HOME]);
check('可回滚', rb.status === 0, (rb.stdout + rb.stderr).trim().split('\n').pop());

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-dev: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
