// e2e-sqlite：v0.3 Phase A 存储层验证（SQLite schema/迁移/重启持久化/旧 JSON 迁移/令牌哈希/审计）。
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createRegistry } from '../lib/registry-server.mjs';
import { locateDsh } from '../lib/dsh.mjs';
import { sha256hex } from '../lib/signing.mjs';

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

console.log('== e2e-sqlite: Phase A 存储层 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }

const dataDir = join(TEST_HOME, 'registry-data');
const reg1 = createRegistry({ dir: dataDir });
const port1 = await reg1.listen(0);
const REG1 = 'http://127.0.0.1:' + port1;
await run(['keygen', '--home', TEST_HOME]);
await run(['publisher-register', 'agenthub', '--registry', REG1, '--home', TEST_HOME]);
const p = await run(['publish', financeDir, '--registry', REG1, '--home', TEST_HOME]);
check('发布成功', p.status === 0, (p.stdout + p.stderr).trim().split('\n').pop());

// 1. forge.db + schema
check('forge.db 已创建', existsSync(join(dataDir, 'forge.db')));
const sdb = new DatabaseSync(join(dataDir, 'forge.db'));
const sv = sdb.prepare('SELECT MAX(version) AS v FROM schema_version').get();
check('schema_version = 1', sv?.v === 1, JSON.stringify(sv));
const tables = sdb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
const expectTables = ['api_tokens','artifacts','audit_logs','dependencies','installations','package_versions','packages','publishers','ratings','schema_version','security_scans'];
const missing = expectTables.filter((t) => !tables.includes(t));
check('v0.3 十表齐备', missing.length === 0, '缺失: ' + missing.join(','));
const pkgRow = sdb.prepare('SELECT id, type, status, trust FROM packages WHERE id = ?').get('finance-analyst');
check('packages 行：agent/published/official', pkgRow?.type === 'agent' && pkgRow?.status === 'published' && pkgRow?.trust === 'official', JSON.stringify(pkgRow));
const verRow = sdb.prepare('SELECT COUNT(*) AS c FROM package_versions WHERE package_id = ?').get('finance-analyst');
check('package_versions 有行', verRow?.c >= 1, JSON.stringify(verRow));
const artRow = sdb.prepare('SELECT COUNT(*) AS c FROM artifacts WHERE package_id = ?').get('finance-analyst');
check('artifacts 有行', artRow?.c >= 1, JSON.stringify(artRow));
const scanRow = sdb.prepare('SELECT score, verdict FROM security_scans WHERE package_id = ?').get('finance-analyst');
check('security_scans 有行（score=99）', scanRow?.score === 99, JSON.stringify(scanRow));

// 2. 令牌哈希存储
const tokRow = sdb.prepare('SELECT token_hash FROM api_tokens WHERE publisher_id = ?').get('agenthub');
const storedToken = JSON.parse(readFileSync(join(TEST_HOME, '.agenthub', 'publisher.json'), 'utf8'))[REG1].token;
check('api_tokens 存哈希（非明文）', tokRow?.token_hash === sha256hex(storedToken) && tokRow?.token_hash !== storedToken, tokRow?.token_hash?.slice(0, 12) + '…');

// 3. 审计日志
const audits = sdb.prepare('SELECT action, subject FROM audit_logs ORDER BY id').all();
check('audit_logs 记录 publish', audits.some((a) => a.action === 'publish' && a.subject === 'finance-analyst'), JSON.stringify(audits.map((a) => a.action)));
sdb.close();

// 4. 重启持久化（关 → 开 → 数据完整）
await reg1.close();
const reg2 = createRegistry({ dir: dataDir });
const port2 = await reg2.listen(0);
const REG2 = 'http://127.0.0.1:' + port2;
const list2 = await (await fetch(REG2 + '/v1/agents')).json();
check('重启后 Agent 完整（SQLite 恢复）', list2.some((a) => a.id === 'finance-analyst' && a.trust === 'official'), JSON.stringify(list2.map((a) => a.id)));
const detail2 = await (await fetch(REG2 + '/v1/agents/finance-analyst')).json();
check('重启后版本/签名/扫描完整', detail2.versions?.includes('0.1.0') && !!detail2.signature && detail2.scan?.score === 99, '');
const art2 = await fetch(REG2 + '/v1/agents/finance-analyst/0.1.0/artifact');
check('重启后制品可下载', art2.status === 200, 'status=' + art2.status);
await reg2.close();

// 5. 旧 registry.json 一次性迁移
const legacyDir = join(TEST_HOME, 'legacy-data');
mkdirSync(legacyDir, { recursive: true });
mkdirSync(join(legacyDir, 'artifacts'), { recursive: true });
writeFileSync(join(legacyDir, 'registry.json'), JSON.stringify({
  publishers: { legacypub: 'FAKEKEY' },
  agents: { 'legacy-agent': { id: 'legacy-agent', name: 'Legacy', publisher: 'legacypub', trust: 'community', score: 80, installs: 7, ratings: { sum: 12, count: 3 }, manifest: { version: '0.1.0', description: 'legacy' }, versions: {} } },
  catalog: [], pending: [], publisherTokens: { legacypub: 'raw-token-legacy' },
}));
const reg3 = createRegistry({ dir: legacyDir });
check('旧 JSON 已迁移（改名 .migrated）', existsSync(join(legacyDir, 'registry.json.migrated')) && !existsSync(join(legacyDir, 'registry.json')));
const port3 = await reg3.listen(0);
const list3 = await (await fetch('http://127.0.0.1:' + port3 + '/v1/agents')).json();
check('迁移后旧 Agent 可用', list3.some((a) => a.id === 'legacy-agent' && a.trust === 'community'), JSON.stringify(list3.map((a) => a.id)));
await reg3.close();
const sdb3 = new DatabaseSync(join(legacyDir, 'forge.db'));
const tok3 = sdb3.prepare('SELECT token_hash FROM api_tokens WHERE publisher_id = ?').get('legacypub');
check('旧明文令牌迁移时已哈希', tok3?.token_hash === sha256hex('raw-token-legacy'), '');
sdb3.close();

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-sqlite: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
