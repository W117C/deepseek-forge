// e2e-web：M3 Marketplace Web（分类首页/详情页/安装计数/评分/ingest 自适应）。
import { rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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

console.log('== e2e-web: M3 Marketplace Web ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

const reg = createRegistry({ dir: join(TEST_HOME, 'registry-data'), allowInsecure: true });
const port = await reg.listen(0);
const REG = 'http://127.0.0.1:' + port;
await run(['keygen', '--home', TEST_HOME]);
await run(['publish', financeDir, '--registry', REG, '--home', TEST_HOME]);
await run(['publish', researchDir, '--registry', REG, '--home', TEST_HOME]);

// 1. ingest 自适应：alex 格式 + bruc 格式（本地夹具）
const alex = { categories: [{ id: 'tools', title: { en: 'Tools' } }], plugins: [
  { name: 'alex-plugin-a', url: 'https://github.com/some/alex-plugin-a', category: 'tools', description: { en: 'Alex format plugin A', 'zh-CN': 'Alex 格式插件 A' } },
] };
const bruc = { repositories: [
  { id: 1, full_name: 'some/bruc-plugin-b', html_url: 'https://github.com/some/bruc-plugin-b', description: 'Bruc format plugin B', category_en: 'UI & Experience', category_zh: '界面与体验' },
  { id: 2, full_name: 'some/bruc-plugin-c', html_url: 'https://github.com/some/bruc-plugin-c', description: 'Bruc format plugin C', category_en: 'Tools' },
] };
writeFileSync(join(TEST_HOME, 'alex.json'), JSON.stringify(alex));
writeFileSync(join(TEST_HOME, 'bruc.json'), JSON.stringify(bruc));
const ing1 = await run(['ingest', join(TEST_HOME, 'alex.json'), '--registry', REG]);
const ing2 = await run(['ingest', join(TEST_HOME, 'bruc.json'), '--registry', REG]);
check('ingest 识别 alex 格式', ing1.status === 0 && /ingested\":1/.test(ing1.stdout + ing1.stderr), (ing1.stdout + ing1.stderr).trim());
check('ingest 识别 bruc 格式', ing2.status === 0 && /ingested\":2/.test(ing2.stdout + ing2.stderr), (ing2.stdout + ing2.stderr).trim());
const cat = await (await fetch(REG + '/v1/catalog')).json();
check('目录共 3 条社区插件', cat.length === 3, JSON.stringify(cat.map((c) => c.name)));

// 2. 首页：分类 + Agent + 插件计数
const home = await (await fetch(REG + '/')).text();
check('首页含领域分类', home.includes('金融 Finance') && home.includes('学术 Academic'), '');
check('首页含两款 Agent', home.includes('Finance Analyst') && home.includes('Academic Researcher') && home.includes('/agents/finance-analyst'), '');
check('首页含社区插件与计数', home.includes('收录 3 个') && home.includes('alex-plugin-a'), '');

// 3. 详情页
const detailHtml = await (await fetch(REG + '/agents/finance-analyst')).text();
check('详情页含描述', detailHtml.includes('金融研究与决策支持'), '');
check('详情页含安全分', detailHtml.includes('安全分 99'), '');
check('详情页含网络权限', detailHtml.includes('localhost:3111'), '');
check('详情页含版本表', detailHtml.includes('0.1.0') && detailHtml.includes('pass'), '');
check('详情页含安装命令', detailHtml.includes('agenthub install finance-analyst'), '');

// 4. 安装计数（匿名上报）
const i1 = await run(['install', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes']);
check('安装成功（含上报）', i1.status === 0, '');
const d1 = await (await fetch(REG + '/v1/agents/finance-analyst')).json();
check('安装计数=1', d1.installs === 1, 'installs=' + d1.installs);
const i2 = await run(['install', 'academic-researcher', '--registry', REG, '--home', TEST_HOME, '--yes']);
await (await fetch(REG + '/v1/agents/finance-analyst')).json();
await run(['install', 'finance-analyst', '--registry', REG, '--home', TEST_HOME, '--yes']);
const d2 = await (await fetch(REG + '/v1/agents/finance-analyst')).json();
check('重复安装计数=2', d2.installs === 2, 'installs=' + d2.installs);
const home2 = await (await fetch(REG + '/')).text();
check('首页按安装数排序（finance 在前）', home2.indexOf('finance-analyst') < home2.indexOf('academic-researcher'), '');

// 5. 评分
const r1 = await run(['rate', 'finance-analyst', '5', '--registry', REG]);
check('CLI 评分 5 星', r1.status === 0 && /average\":5/.test(r1.stdout + r1.stderr), (r1.stdout + r1.stderr).trim());
await (await fetch(REG + '/v1/agents/finance-analyst/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: 4 }) })).json();
const d3 = await (await fetch(REG + '/v1/agents/finance-analyst')).json();
check('平均分 4.5（5+4）', d3.ratings && d3.ratings.count === 2 && d3.ratings.sum === 9, JSON.stringify(d3.ratings));
const detailHtml2 = await (await fetch(REG + '/agents/finance-analyst')).text();
check('详情页显示评分 4.5', detailHtml2.includes('4.5'), '');

// 5c. 组合引导与综合排名
check('详情页含组合入口（带预选）', detailHtml2.includes('/compose?ids=finance-analyst'), '');
const composePage = await (await fetch(REG + '/compose?ids=finance-analyst')).text();
check('Builder 页预选 finance-analyst', composePage.includes('value=finance-analyst checked'), composePage.match(/value=finance-analyst[^>]*/)?.[0] ?? '未找到');
const listJson = await (await fetch(REG + '/v1/agents')).json();
check('列表含 rankScore 且 official 加成', listJson.every((a) => typeof a.rankScore === 'number' && a.rankScore >= 100), JSON.stringify(listJson.map((a) => a.id + ':' + a.rankScore)));
const home3 = await (await fetch(REG + '/')).text();
check('首页显示综合分并按排名排序', home3.includes('综合分') && home3.indexOf('finance-analyst') < home3.indexOf('academic-researcher'), '');

// 5b. 评分限流：同 ip 10 分钟窗口最多 5 次
for (let i = 0; i < 3; i++) {
  await (await fetch(REG + '/v1/agents/finance-analyst/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: 3 }) })).json();
}
const sixth = await fetch(REG + '/v1/agents/finance-analyst/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: 3 }) });
check('第 6 次评分被限流（429）', sixth.status === 429, 'status=' + sixth.status);

// 6. 搜索包含社区插件
const s = await (await fetch(REG + '/v1/search?q=bruc')).json();
check('搜索命中 bruc 插件', s.some((x) => x.kind === 'plugin' && x.id === 'bruc-plugin-b'), JSON.stringify(s.map((x) => x.id)));

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-web: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
await reg.close();
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
