// e2e-auth：强制鉴权模式（requirePublisherAuth + operatorToken）与安装上报幂等。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRegistry } from '../lib/registry-server.mjs';
import { locateDsh } from '../lib/dsh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const CLI = join(root, 'cli', 'agenthub.mjs');
const financeDir = join(root, 'bundles', 'finance-analyst');
const OP = 'op-secret-token';

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

console.log('== e2e-auth: 强制鉴权 + 安装上报幂等 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }
const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), operatorToken: OP, requirePublisherAuth: true });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);

// 1. 无令牌发布 → 401
const p0 = await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME]);
check('无令牌发布被拒（401）', p0.status !== 0 && /401/.test(p0.stdout + p0.stderr), (p0.stdout + p0.stderr).trim().split('\n').pop());

// 2. 注册发布者 → 令牌 → 发布成功
const rg = await run(['publisher-register', 'agenthub', '--registry', REG, '--home', TEST_HOME]);
check('注册发布者取得令牌', rg.status === 0 && /令牌已存储/.test(rg.stdout + rg.stderr), (rg.stdout + rg.stderr).split('\n').filter(Boolean).slice(-2).join(' | '));
const p1 = await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME]);
check('带令牌发布成功', p1.status === 0 && /published/.test(p1.stdout + p1.stderr), (p1.stdout + p1.stderr).trim().split('\n').pop());

// 3. 令牌与发布者不匹配 → 401（换 publisher 名但用他人令牌）
const v2Dir = join(TEST_HOME, 'finance-fake');
const { cpSync, writeFileSync } = await import('node:fs');
cpSync(financeDir, v2Dir, { recursive: true });
writeFileSync(join(v2Dir, 'agenthub.yaml'), readFileSync(join(v2Dir, 'agenthub.yaml'), 'utf8').replace('id: finance-analyst', 'id: finance-fake').replace('id: agenthub', 'id: not-agenthub'));
const p2 = await run(['publish', v2Dir, '--registry', REG, '--home', TEST_HOME]);
check('冒用他人令牌发布被拒（401）', p2.status !== 0 && /401/.test(p2.stdout + p2.stderr), (p2.stdout + p2.stderr).trim().split('\n').pop());

// 4. 审核端点：无运营令牌 401；带令牌可操作
const rNoAuth = await fetch(REG + '/v1/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'x', version: '0', approve: true }) });
check('无运营令牌审核被拒（401）', rNoAuth.status === 401, 'status=' + rNoAuth.status);
const rAuth = await fetch(REG + '/v1/review', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OP }, body: JSON.stringify({ id: 'x', version: '0', approve: true }) });
check('带运营令牌可操作（404=走到业务逻辑）', rAuth.status === 404, 'status=' + rAuth.status);

// 5. 制品下载限速：per-ip 每分钟 10 次，第 11 次 429
let lastArtStatus = null;
for (let i = 0; i < 11; i++) {
  const res = await fetch(REG + '/v1/agents/finance-analyst/0.1.0/artifact');
  lastArtStatus = res.status;
}
check('制品下载第 11 次被限速（429）', lastArtStatus === 429, 'status=' + lastArtStatus);

// 6. 安装上报幂等：同 eventId 只计一次
const ev = 'test-event-1';
const postInstall = (eventId) => fetch(REG + '/v1/installations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'finance-analyst', version: '0.1.0', eventId }) });
const e1 = await (await postInstall(ev)).json();
const e2 = await (await postInstall(ev)).json();
const e3 = await (await postInstall('test-event-2')).json();
check('安装上报幂等（重复 eventId 不重复计数）', e1.installs === 1 && e2.duplicate === true && e2.installs === 1 && e3.installs === 2, JSON.stringify({ e1, e2, e3 }));

// 7. 签名 URL（防盗链）：artifactSecret 下无签名 403、有效签名 200、篡改 403
const reg2 = createRegistry({ dir: join(TEST_HOME, 'registry-signed'), artifactSecret: 'test-secret' });
const port2 = await reg2.listen(0);
const REG2 = 'http://127.0.0.1:' + port2;
await run(['publish', financeDir, '--registry', REG2, '--home', TEST_HOME]);
const unsigned = await fetch(REG2 + '/v1/agents/finance-analyst/0.1.0/artifact');
check('无签名下载 403', unsigned.status === 403, 'status=' + unsigned.status);
const detail2 = await (await fetch(REG2 + '/v1/agents/finance-analyst')).json();
check('detail 返回 artifactUrl（含 exp&sig）', !!detail2.artifactUrl && /exp=/.test(detail2.artifactUrl) && /sig=/.test(detail2.artifactUrl), String(detail2.artifactUrl).slice(0, 60));
const signedRes = await fetch(REG2 + detail2.artifactUrl);
check('有效签名下载 200', signedRes.status === 200, 'status=' + signedRes.status);
const tampered = REG2 + detail2.artifactUrl.replace(/sig=[a-f0-9]+/, 'sig=' + '0'.repeat(64));
const tamperedRes = await fetch(tampered);
check('篡改签名下载 403', tamperedRes.status === 403, 'status=' + tamperedRes.status);
await reg2.close();

// 8. CLI registry 命令透传鉴权开关（子进程实测）
const { spawn: spawn2 } = await import('node:child_process');
const regCli = await new Promise((resolve) => {
  const child = spawn2('node', [CLI, 'registry', join(TEST_HOME, 'registry-cli'), '--require-publisher-auth', '--operator-token', 'op-cli'], { env: { ...process.env, DSH_HOME: TEST_HOME } });
  let out = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ child: null, out, err: 'timeout' }); }, 15000);
  child.stdout.on('data', (d) => {
    out += d;
    const m = out.match(/127\.0\.0\.1:(\d+)/);
    if (m) { clearTimeout(timer); resolve({ child, out, port: Number(m[1]) }); }
  });
  child.on('exit', () => { if (timer) clearTimeout(timer); });
});
check('CLI registry 启动并打印端口', !!regCli.port, regCli.out.trim().split('\n').pop());
if (regCli.port) {
  const REG3 = 'http://127.0.0.1:' + regCli.port;
  const pNoToken = await run(['publish', financeDir, '--registry', REG3, '--home', TEST_HOME]);
  check('CLI 启动的 Registry 强制发布鉴权（401）', pNoToken.status !== 0 && /401/.test(pNoToken.stdout + pNoToken.stderr), (pNoToken.stdout + pNoToken.stderr).trim().split('\n').pop());
  regCli.child.kill('SIGKILL');
}

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-auth: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
