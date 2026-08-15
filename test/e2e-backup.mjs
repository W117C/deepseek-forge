// e2e-backup：备份 → 删除 → 恢复 → Registry 数据完整可用。
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
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

console.log('== e2e-backup: 备份与恢复 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }

// 1. 建库 + 发布
const dataDir = join(TEST_HOME, 'registry-data');
const reg1 = createRegistry({ dir: dataDir, allowInsecure: true });
const port1 = await reg1.listen(0);
const REG1 = 'http://127.0.0.1:' + port1;
await run(['keygen', '--home', TEST_HOME]);
const p = await run(['publish', financeDir, '--registry', REG1, '--home', TEST_HOME]);
check('发布成功（备份前）', p.status === 0, (p.stdout + p.stderr).trim().split('\n').pop());
await reg1.close();

// 2. 备份 → 删除 → 恢复
const backup = spawnSync('bash', [join(root, 'scripts', 'backup.sh'), dataDir], { encoding: 'utf8' });
check('备份脚本成功', backup.status === 0, (backup.stdout + backup.stderr).trim().split('\n').pop());
const tarball = (backup.stdout.match(/已备份：(\S+)/) || [])[1];
check('找到备份文件', !!tarball && existsSync(tarball), tarball ?? '');
rmSync(dataDir, { recursive: true, force: true });
const restore = spawnSync('bash', [join(root, 'scripts', 'restore.sh'), tarball, dataDir], { encoding: 'utf8' });
check('恢复脚本成功', restore.status === 0, (restore.stdout + restore.stderr).trim().split('\n').pop());

// 3. 恢复后 Registry 完整可用
const reg2 = createRegistry({ dir: dataDir, allowInsecure: true });
const port2 = await reg2.listen(0);
const REG2 = 'http://127.0.0.1:' + port2;
const list = await (await fetch(REG2 + '/v1/agents')).json();
check('恢复后 Agent 元数据完整', list.some((a) => a.id === 'finance-analyst'), JSON.stringify(list.map((a) => a.id)));
const art = await fetch(REG2 + '/v1/agents/finance-analyst/0.1.0/artifact');
check('恢复后制品可下载', art.status === 200, 'status=' + art.status);
const detail = await (await fetch(REG2 + '/v1/agents/finance-analyst')).json();
check('恢复后验签信息完整（signature 存在）', !!detail.signature && detail.scan?.score === 99, JSON.stringify({ sig: !!detail.signature, scan: detail.scan?.score }));
await reg2.close();

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-backup: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
