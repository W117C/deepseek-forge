// e2e-compose-publish：compose-server 一键发布闭环（服务端组合 → 本地签名 → 发布上架 → 远端安装）。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRegistry } from '../lib/registry-server.mjs';
import { locateDsh, runDsh } from '../lib/dsh.mjs';
import { loadAgentManifest } from '../lib/manifest.mjs';

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

console.log('== e2e-compose-publish: 组合一键发布闭环 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), requirePublisherAuth: true, officialPublishers: ['agenthub', 'combo-demo'] });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);
await run(['publisher-register', 'agenthub', '--registry', REG, '--home', TEST_HOME]);
const agenthubToken = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'publisher.json'), 'utf8'))[REG].token;
await run(['publisher-register', 'combo-demo', '--registry', REG, '--home', TEST_HOME]);
await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME, '--token', agenthubToken]);
await run(['publish', researchDir, '--registry', REG, '--home', TEST_HOME, '--token', agenthubToken]);

// 1. compose-server 仅下载
const outA = join(TEST_HOME, 'combo-a');
const c1 = await run(['compose-server', 'Combo Download', '--ids', 'finance-analyst,academic-researcher', '--registry', REG, '--out', outA, '--home', TEST_HOME]);
check('compose-server 下载成功', c1.status === 0 && /组合包已就绪/.test(c1.stdout + c1.stderr) && existsSync(join(outA, 'agenthub.yaml')), (c1.stdout + c1.stderr).split('\n').filter(Boolean).slice(-2).join(' | '));
const mA = loadAgentManifest(outA);
check('组合 manifest 并集正确', mA.components.bundles.length === 2 && mA.components.presets.length === 2 && mA.components.skills.length === 4, '');
const iA = await run(['install', outA, '--home', TEST_HOME, '--yes']);
check('组合包本地安装健康 PASS', iA.status === 0 && /健康检查：PASS/.test(iA.stdout + iA.stderr));

// 2. compose-server --publish 一键发布（publisher=combo-demo，官方白名单 → 200 直发）
const outB = join(TEST_HOME, 'combo-b');
const c2 = await run(['compose-server', 'Combo Published', '--ids', 'finance-analyst', '--ids', 'academic-researcher', '--publisher', 'combo-demo', '--registry', REG, '--out', outB, '--publish', '--home', TEST_HOME]);
check('compose-server --publish 成功', c2.status === 0 && /已发布/.test(c2.stdout + c2.stderr) && /HTTP 200/.test(c2.stdout + c2.stderr), (c2.stdout + c2.stderr).split('\n').filter((l) => /发布|HTTP/.test(l)).slice(-3).join(' | '));
const list = await (await fetch(REG + '/v1/agents')).json();
check('组合 Agent 上架', list.some((a) => a.id === 'combo-published'), JSON.stringify(list.map((a) => a.id)));
const detail = await (await fetch(REG + '/v1/agents/combo-published')).json();
check('组合 Agent 定级 official（组合发布者在白名单）', detail.trust === 'official', JSON.stringify({ trust: detail.trust, scan: detail.scan?.score }));
const iB = await run(['install', 'combo-published', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('组合 Agent 远端安装成功', iB.status === 0 && /校验通过/.test(iB.stdout + iB.stderr), (iB.stdout + iB.stderr).split('\n').filter((l) => /校验|失败/.test(l)).slice(0, 2).join(' | '));
const dump = runDsh(bin, ['--profile', 'combo-published', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dt = (dump.stdout || '') + (dump.stderr || '');
check('远端组合树含两个数据 seam', dump.status === 0 && dt.includes('mcp-market-data') && dt.includes('mcp-papers'), 'exit=' + dump.status);
const rb = await run(['rollback', 'combo-published', '--home', TEST_HOME]);
check('组合 Agent 可回滚', rb.status === 0, (rb.stdout + rb.stderr).trim().split('\n').pop());

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-compose-publish: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
