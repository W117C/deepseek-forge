// e2e-lifecycle：版本生命周期（钉选安装 → 升级 → 升级回滚）、社区目录插件、极简 Web 页。
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRegistry } from '../lib/registry-server.mjs';
import { locateDsh, profileDir, runDsh } from '../lib/dsh.mjs';
import { loadState } from '../lib/state.mjs';

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

console.log('== e2e-lifecycle: 版本生命周期 + 目录插件 + Web 页 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

// 1. Registry + 密钥 + 发布 0.1.0
const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data') });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);
const p1 = await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME]);
check('发布 0.1.0', p1.status === 0, (p1.stdout + p1.stderr).trim().split('\n').pop());

// 2. 制作并发布 0.2.0（含新行 mcp-news）
const v2Dir = join(TEST_HOME, 'finance-v2');
cpSync(financeDir, v2Dir, { recursive: true });
writeFileSync(join(v2Dir, 'agenthub.yaml'), readFileSync(join(v2Dir, 'agenthub.yaml'), 'utf8').replace('version: 0.1.0', 'version: 0.2.0'));
writeFileSync(join(v2Dir, 'bundle', 'finance-core', 'package.json'), readFileSync(join(v2Dir, 'bundle', 'finance-core', 'package.json'), 'utf8').replace('"version": "0.1.0"', '"version": "0.2.0"'));
writeFileSync(join(v2Dir, 'bundle', 'finance-core', 'cordis.patch.yml'), readFileSync(join(v2Dir, 'bundle', 'finance-core', 'cordis.patch.yml'), 'utf8') + [
'' , '- insert:',
    '    # v0.2.0 新增：新闻数据 seam（默认禁用）',
    '    - id: mcp-news',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      disabled: true',
    '      config:',
    '        serverName: news',
    '        transport: streamable-http',
    "        url: 'http://localhost:3113/mcp'",
    '        failOnStartupError: false',
''].join('\n'));
const p2 = await run(['publish', v2Dir, '--registry', REG, '--home', TEST_HOME]);
check('发布 0.2.0', p2.status === 0, (p2.stdout + p2.stderr).trim().split('\n').pop());
const vs = await (await fetch(REG + '/v1/agents/finance-analyst/versions')).json();
check('versions 含 0.1.0 与 0.2.0', vs.length === 2 && vs.some((v) => v.version === '0.1.0') && vs.some((v) => v.version === '0.2.0'), JSON.stringify(vs.map((v) => v.version)));

// 3. 钉选安装 0.1.0
const i1 = await run(['install', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes', '--version', '0.1.0']);
check('钉选安装 0.1.0', i1.status === 0 && /version=0\.1\.0/.test(i1.stdout + i1.stderr), (i1.stdout + i1.stderr).split('\n').filter((l) => /version=|失败/.test(l)).slice(0, 2).join(' | '));
const dump1 = runDsh(bin, ['--profile', 'finance', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const d1 = (dump1.stdout || '') + (dump1.stderr || '');
check('0.1.0 组合树无 mcp-news', dump1.status === 0 && !d1.includes('mcp-news'));
check('本地状态 version=0.1.0', loadState(TEST_HOME).agents['finance-analyst']?.version === '0.1.0');

// 4. info
const info = await run(['info', 'finance-analyst', '--registry', REG, '--home', TEST_HOME]);
check('info 本地 0.1.0 + 远端 0.2.0', /0\.1\.0/.test(info.stdout) && /0\.2\.0/.test(info.stdout), (info.stdout + info.stderr).split('\n').filter((l) => /0\.1|0\.2|latest/.test(l)).slice(0, 3).join(' | '));

// 5. 升级到 0.2.0
const up = await run(['update', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('升级到 0.2.0', up.status === 0 && /0\.1\.0 → 0\.2\.0/.test(up.stdout + up.stderr), (up.stdout + up.stderr).split('\n').filter((l) => /升级|校验|失败/.test(l)).slice(0, 3).join(' | '));
const dump2 = runDsh(bin, ['--profile', 'finance', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const d2 = (dump2.stdout || '') + (dump2.stderr || '');
check('0.2.0 组合树含 mcp-news', dump2.status === 0 && d2.includes('mcp-news'));
check('本地状态 version=0.2.0', loadState(TEST_HOME).agents['finance-analyst']?.version === '0.2.0');
const up2 = await run(['update', 'finance-analyst', '--registry', REG, '--home', TEST_HOME]);
check('再次升级提示已最新', up2.status === 0 && /已是最新/.test(up2.stdout + up2.stderr), (up2.stdout + up2.stderr).trim());

// 6. 升级回滚 → 回到 0.1.0
const rb = await run(['rollback', 'finance-analyst', '--home', TEST_HOME]);
check('升级回滚成功', rb.status === 0, (rb.stdout + rb.stderr).trim().split('\n').pop());
const st = loadState(TEST_HOME).agents['finance-analyst'];
check('回滚后状态回到 0.1.0', st?.version === '0.1.0', 'version=' + st?.version);
const dump3 = runDsh(bin, ['--profile', 'finance', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const d3 = (dump3.stdout || '') + (dump3.stderr || '');
check('回滚后组合树无 mcp-news（bundle 实体已恢复）', dump3.status === 0 && !d3.includes('mcp-news'));

// 7. 社区目录：ingest + 信任门禁 + 官方路径安装
const demoDir = join(TEST_HOME, 'demo-tool');
mkdirSync(demoDir, { recursive: true });
writeFileSync(join(demoDir, 'package.json'), JSON.stringify({ name: 'demo-tool', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2) + '\n');
writeFileSync(join(demoDir, 'cordis.patch.yml'), ['- insert:', '    - id: demo-marker', "      name: '@deepseek-ai/dsh-tool-web'", '      config:', '        search: true', '        fetch: false', ''].join('\n'));
const seedPath = join(TEST_HOME, 'seed.json');
writeFileSync(seedPath, JSON.stringify([{ name: 'demo-tool', source: 'file:' + demoDir, description: '演示社区插件', category: 'tools' }]));
const ing = await run(['ingest', seedPath, '--registry', REG]);
check('ingest 收录 1 条', ing.status === 0 && /"ingested":1/.test(ing.stdout + ing.stderr), (ing.stdout + ing.stderr).trim());
const search = await (await fetch(REG + '/v1/search?q=demo')).json();
check('search 命中社区插件', search.some((x) => x.kind === 'plugin' && x.id === 'demo-tool'), JSON.stringify(search.map((x) => x.kind + ':' + x.id)));
const iNoTrust = await run(['install', 'demo-tool', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('社区插件无 --trust community 被拒', iNoTrust.status !== 0 && /--trust community/.test(iNoTrust.stdout + iNoTrust.stderr), (iNoTrust.stdout + iNoTrust.stderr).trim().split('\n').pop());
const iTrust = await run(['install', 'demo-tool', '--registry', REG, '--home', TEST_HOME, '--yes', '--trust', 'community']);
check('社区插件加信任后安装成功', iTrust.status === 0 && /官方 dsh plugin 安装/.test(iTrust.stdout + iTrust.stderr), (iTrust.stdout + iTrust.stderr).split('\n').filter(Boolean).slice(-2).join(' | '));
const dump4 = runDsh(bin, ['--profile', 'plugins', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const d4 = (dump4.stdout || '') + (dump4.stderr || '');
check('插件组合树含 demo-marker', dump4.status === 0 && d4.includes('demo-marker'), 'exit=' + dump4.status);
const rb2 = await run(['rollback', 'demo-tool', '--home', TEST_HOME]);
check('社区插件可回滚', rb2.status === 0, (rb2.stdout + rb2.stderr).trim().split('\n').pop());

// 8. 极简 Web 页
const home = await (await fetch(REG + '/')).text();
check('Web 首页含 Marketplace 与 Agent', home.includes('AgentHub Marketplace') && home.includes('finance-analyst') && home.includes('demo-tool'), home.slice(0, 80));

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-lifecycle: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
