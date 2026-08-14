// e2e-multi：两款 Agent（finance-analyst + academic-researcher）在同一 DSH_HOME 共存、
// profile 隔离、互不影响的回滚。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateDsh, dshVersion, profileDir, presetDir, skillsDir, runDsh } from '../lib/dsh.mjs';
import { install, rollback } from '../lib/installer.mjs';
import { loadState } from '../lib/state.mjs';
import { bootSmokeCheck } from '../lib/health.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const financeDir = join(root, 'bundles', 'finance-analyst');
const researchDir = join(root, 'bundles', 'academic-researcher');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

console.log('== e2e-multi: 两款 Agent 共存与隔离 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
check('dsh 定位', !!bin, bin ?? '');
if (!bin) process.exit(1);
check('dsh 版本', dshVersion(bin) === '0.1.0-rc.6', dshVersion(bin));

// 1. 双安装
const f = install({ agentDir: financeDir, home: TEST_HOME, bin, profileName: 'finance', yes: true });
const r = install({ agentDir: researchDir, home: TEST_HOME, bin, profileName: 'research', yes: true });
check('两款 Agent 安装成功', f.health.passed && r.health.passed, 'finance=' + f.health.passed + ' research=' + r.health.passed);

// 2. profile 隔离
const fm = JSON.parse(readFileSync(join(profileDir(TEST_HOME, 'finance'), 'package.json'), 'utf8'));
const rm = JSON.parse(readFileSync(join(profileDir(TEST_HOME, 'research'), 'package.json'), 'utf8'));
check('finance profile 只含 finance-core', fm.dsh.profile.bundles.includes('@agenthub/finance-core') && !fm.dsh.profile.bundles.includes('@agenthub/research-core'), JSON.stringify(fm.dsh.profile.bundles));
check('research profile 只含 research-core', rm.dsh.profile.bundles.includes('@agenthub/research-core') && !rm.dsh.profile.bundles.includes('@agenthub/finance-core'), JSON.stringify(rm.dsh.profile.bundles));

// 3. preset 共存
check('两个 preset 目录共存', existsSync(join(presetDir(TEST_HOME, 'finance-analyst'), 'agent.cordis.yml')) && existsSync(join(presetDir(TEST_HOME, 'academic-researcher'), 'agent.cordis.yml')));
const rp = readFileSync(join(presetDir(TEST_HOME, 'academic-researcher'), 'preset.yml'), 'utf8');
check('academic preset 显示名', rp.includes('学术研究员'), rp.split('\n')[0]);

// 4. skills 共存
const skills = ['financial-analysis', 'company-research', 'literature-review', 'paper-analysis'];
check('4 个 skills 全部安装', skills.every((s) => existsSync(join(skillsDir(TEST_HOME, s), 'SKILL.md'))), skills.filter((s) => !existsSync(join(skillsDir(TEST_HOME, s), 'SKILL.md'))).join(','));

// 5. 组合树隔离
const df = runDsh(bin, ['--profile', 'finance', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dr = runDsh(bin, ['--profile', 'research', '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const tf = (df.stdout || '') + (df.stderr || ''), tr = (dr.stdout || '') + (dr.stderr || '');
check('finance 组合树含 market-data、无 papers', df.status === 0 && tf.includes('mcp-market-data') && !tf.includes('mcp-papers'), 'exit=' + df.status);
check('research 组合树含 papers、无 market-data', dr.status === 0 && tr.includes('mcp-papers') && !tr.includes('mcp-market-data'), 'exit=' + dr.status);
check('两个组合树均启用 fetch', tf.includes('fetch: true') && tr.includes('fetch: true'));

// 6. 状态
const state = loadState(TEST_HOME);
check('状态记录两款 Agent', !!state.agents['finance-analyst'] && !!state.agents['academic-researcher'], Object.keys(state.agents).join(','));

// 7. 单点回滚不影响另一款
rollback(TEST_HOME, 'finance-analyst');
check('回滚 finance 后：finance profile 移除', !existsSync(profileDir(TEST_HOME, 'finance')));
check('回滚 finance 后：research profile 完好', existsSync(join(profileDir(TEST_HOME, 'research'), 'package.json')));
check('回滚 finance 后：research preset 完好', existsSync(join(presetDir(TEST_HOME, 'academic-researcher'), 'agent.cordis.yml')));
check('回滚 finance 后：finance preset 移除', !existsSync(presetDir(TEST_HOME, 'finance-analyst')));
check('回滚 finance 后：finance skills 移除', !existsSync(skillsDir(TEST_HOME, 'financial-analysis')) && !existsSync(skillsDir(TEST_HOME, 'company-research')));
check('回滚 finance 后：research skills 完好', existsSync(join(skillsDir(TEST_HOME, 'literature-review'), 'SKILL.md')) && existsSync(join(skillsDir(TEST_HOME, 'paper-analysis'), 'SKILL.md')));
const state2 = loadState(TEST_HOME);
check('状态只剩 research', Object.keys(state2.agents).join(',') === 'academic-researcher', Object.keys(state2.agents).join(','));

// 8. research profile 启动冒烟
console.log('== boot smoke（research，12s，port 3998）==');
const smoke = await bootSmokeCheck(bin, TEST_HOME, 'research', { port: 3998, waitMs: 12000 });
check('research 启动冒烟 PASS', smoke.passed, (smoke.checks ?? []).map((c) => c.name + (c.ok ? '=ok' : '=FAIL(' + (c.detail || '') + ')')).join('; '));

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-multi: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
