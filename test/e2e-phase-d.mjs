// e2e-phase-d：Phase D 收尾（forge bin 别名、状态管理、令牌轮换、yanked 门禁）。
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
const OP = 'op-d-token';

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

console.log('== e2e-phase-d: 收尾（状态机管理 / 令牌轮换 / forge 别名） ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }

// 1. forge bin 别名（package.json 声明）
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
check('bin 别名 forge 存在且指向同一 CLI', rootPkg.bin?.forge === './cli/agenthub.mjs' && rootPkg.bin?.agenthub === './cli/agenthub.mjs', JSON.stringify(rootPkg.bin));
check('版本号 0.3.0', rootPkg.version === '0.3.0', rootPkg.version);

// 2. 发布 + 令牌轮换（requirePublisherAuth + operatorToken 全开）
const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), requirePublisherAuth: true, operatorToken: OP });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);
const reg1 = await run(['publisher-register', 'agenthub', '--registry', REG, '--home', TEST_HOME]);
const tokens = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'publisher.json'), 'utf8'));
const oldToken = tokens[REG].token;
check('注册取得令牌', reg1.status === 0 && !!oldToken, '');
// 轮换
const rot = await (await fetch(REG + '/v1/publishers/agenthub/rotate-token', { method: 'POST', headers: { authorization: 'Bearer ' + oldToken } })).json();
check('轮换返回新令牌', !!rot.token && rot.token !== oldToken, '');
const oldPub = await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME, '--token', oldToken]);
check('旧令牌发布被拒（401）', oldPub.status !== 0 && /401/.test(oldPub.stdout + oldPub.stderr), (oldPub.stdout + oldPub.stderr).trim().split('\n').pop());
const newPub = await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME, '--token', rot.token]);
check('新令牌发布成功', newPub.status === 0, (newPub.stdout + newPub.stderr).trim().split('\n').pop());
const noAuthRot = await fetch(REG + '/v1/publishers/agenthub/rotate-token', { method: 'POST' });
check('无令牌轮换被拒（401）', noAuthRot.status === 401, 'status=' + noAuthRot.status);

// 3. 状态管理：yank → 客户端拒绝 → 恢复 published
const yank = await fetch(REG + '/v1/packages/finance-analyst/status', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OP }, body: JSON.stringify({ status: 'yanked' }) });
check('运营 yank 成功', yank.status === 200 && (await yank.json()).status === 'yanked', 'status=' + yank.status);
const d1 = await (await fetch(REG + '/v1/packages/finance-analyst')).json();
check('列表视图 status=yanked', d1.status === 'yanked', d1.status);
const iYank = await run(['install', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('yanked 包安装被阻断', iYank.status !== 0 && /yanked/.test(iYank.stdout + iYank.stderr), (iYank.stdout + iYank.stderr).trim().split('\n').pop());
const dep = await fetch(REG + '/v1/packages/finance-analyst/status', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OP }, body: JSON.stringify({ status: 'deprecated' }) });
check('deprecated 状态可设置', dep.status === 200, '');
const iDep = await run(['install', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('deprecated 仍可安装（带警告语义，不阻断）', iDep.status === 0 && /校验通过/.test(iDep.stdout + iDep.stderr), (iDep.stdout + iDep.stderr).split('\n').filter((l) => /校验|失败/.test(l)).slice(0, 2).join(' | '));
await run(['rollback', 'finance-analyst', '--home', TEST_HOME]);
const repub = await fetch(REG + '/v1/packages/finance-analyst/status', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OP }, body: JSON.stringify({ status: 'published' }) });
check('恢复 published', repub.status === 200, 'status=' + repub.status);
const noOp = await fetch(REG + '/v1/packages/finance-analyst/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'yanked' }) });
check('无运营令牌状态操作被拒（401）', noOp.status === 401, 'status=' + noOp.status);
const badStatus = await fetch(REG + '/v1/packages/finance-analyst/status', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OP }, body: JSON.stringify({ status: 'nonsense' }) });
check('非法状态 400', badStatus.status === 400, 'status=' + badStatus.status);

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-phase-d: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
