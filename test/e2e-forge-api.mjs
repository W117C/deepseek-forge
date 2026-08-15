// e2e-forge-api：Marketplace 前端所依赖的 Registry API 契约测试（CORS + 各 api 模块等价调用）。
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

console.log('== e2e-forge-api: 前端 API 契约 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }

const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), corsOrigins: null, allowInsecure: true });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);
await run(['publisher-register', 'agenthub', '--registry', REG, '--home', TEST_HOME]);
await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME]);

// 1. CORS：带 Origin 的请求返回允许头；OPTIONS 预检 204
const origin = 'https://deepseek-forge-marketplace.vercel.app';
const corsRes = await fetch(REG + '/v1/packages', { headers: { origin } });
check('CORS 允许来源（* 模式）', corsRes.headers.get('access-control-allow-origin') === '*', corsRes.headers.get('access-control-allow-origin') ?? '缺失');
check('CORS 允许方法与头', (corsRes.headers.get('access-control-allow-methods') ?? '').includes('GET') && (corsRes.headers.get('access-control-allow-headers') ?? '').includes('authorization'), '');
const preflight = await fetch(REG + '/v1/publishers/register', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
check('OPTIONS 预检 204', preflight.status === 204, 'status=' + preflight.status);

// 2. 前端 api 模块等价调用（listPackages / search / versions / security / ratings / install）
const pkgs = await (await fetch(REG + '/v1/packages')).json();
const fa = pkgs.find((p) => p.id === 'finance-analyst');
check('listPackages：规范字段完整（映射层输入）', fa && fa.type === 'agent' && fa.status === 'published' && typeof fa.installs === 'number' && Array.isArray(fa.versions) && 'average' in fa.ratings, JSON.stringify(fa && { id: fa.id, type: fa.type, status: fa.status, latest: fa.latest }));
const hits = await (await fetch(REG + '/v1/search?q=finance')).json();
check('search：返回命中', hits.some((h) => h.id === 'finance-analyst'), JSON.stringify(hits.map((h) => h.id)));
const vers = await (await fetch(REG + '/v1/packages/finance-analyst/versions')).json();
check('versions：首项为最新版且含 artifactUrl', vers.length >= 1 && vers[0].version === fa.latest && !!vers[0].artifactUrl, JSON.stringify(vers.map((v) => v.version)));
const rating = await (await fetch(REG + '/v1/agents/finance-analyst/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: 5 }) })).json();
check('ratings：提交并返回均值', rating.average === 5, JSON.stringify(rating));
const inst = await (await fetch(REG + '/v1/installations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'finance-analyst', version: '0.1.0', eventId: 'web-' + Date.now() }) })).json();
check('install 上报：计数 +1', inst.installs >= 1, JSON.stringify(inst));
const pub = await (await fetch(REG + '/v1/publishers/agenthub')).json();
check('publisher：profile + publicKey + 包列表', !!pub.publicKey && pub.profile?.name === 'agenthub' && pub.packages.includes('finance-analyst'), '');

// 3. 错误路径（前端 error 展示所依赖）
const notFound = await fetch(REG + '/v1/packages/not-exist');
check('未知包 404 JSON', notFound.status === 404 && (await notFound.json()).error, 'status=' + notFound.status);

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-forge-api: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
