// e2e：在隔离 DSH_HOME 中验证 finance-analyst 的安装/验证/回滚/重装闭环。
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  locateDsh, dshVersion, profileDir, presetDir, skillsDir, runDsh, systemPresetsDir,
} from '../lib/dsh.mjs';
import { install, rollback } from '../lib/installer.mjs';
import { scanAgentDir } from '../lib/security.mjs';
import { loadState } from '../lib/state.mjs';
import { bootSmokeCheck } from '../lib/health.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const agentDir = join(root, 'bundles', 'finance-analyst');
const PROFILE = 'finance';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail ?? '' });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

function lineSet(path) {
  return new Set(readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#')));
}

console.log('== e2e: finance-analyst（隔离 DSH_HOME: ' + TEST_HOME + '）==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });

const bin = locateDsh();
check('dsh 定位', !!bin, bin ?? '未找到');
const dshVer = bin ? dshVersion(bin) : null;
check('dsh 版本', !!dshVer, dshVer ?? '未知');
if (!bin) process.exit(1);

// 1. 安全扫描（安装前）
const scan = scanAgentDir(agentDir, { trust: 'official' });
check('安装前安全扫描无高危', scan.high === 0, '高危 ' + scan.high + ' 中危 ' + scan.medium + ' 低危 ' + scan.low + ' 分 ' + scan.score + ' 判定 ' + scan.verdict);
check('安全分 ≥ 90', scan.score >= 90, 'score=' + scan.score);

// 2. 安装
let res;
try { res = install({ agentDir, home: TEST_HOME, bin, profileName: PROFILE, yes: true }); }
catch (err) { check('安装成功', false, err.message); console.error(err); process.exit(1); }
check('安装成功', true, '步骤: ' + res.steps.join(' → '));
check('健康检查 PASS', res.health.passed, JSON.stringify(res.health.results.map((r) => r.kind + '=' + r.passed)));

// 3. profile manifest
const pm = JSON.parse(readFileSync(join(profileDir(TEST_HOME, PROFILE), 'package.json'), 'utf8'));
check('dsh.profile.bundles 含 finance-core', pm.dsh.profile.bundles.includes('@agenthub/finance-core'), JSON.stringify(pm.dsh.profile.bundles));
check('bundle 包已落盘（profile 内或平铺回退位）', existsSync(join(TEST_HOME, 'profiles', 'node_modules', '@agenthub', 'finance-core', 'cordis.patch.yml')) || existsSync(join(profileDir(TEST_HOME, PROFILE), 'node_modules', '@agenthub', 'finance-core', 'cordis.patch.yml')));

// 4. dump-config：组合树含 finance 行 + 覆盖生效
const dump = runDsh(bin, ['--profile', PROFILE, '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
check('dump-config 退出码 0', dump.status === 0, 'exit=' + dump.status);
const dumpText = (dump.stdout || '') + (dump.stderr || '');
check('组合树含 mcp-market-data 行', dumpText.includes('mcp-market-data'), '');
check('组合树含 schedule 行', dumpText.includes('schedule'), '');
check('tool-web fetch 已启用（bundle 覆盖生效）', dumpText.includes('fetch: true'), dumpText.split('\n').filter((l) => l.includes('fetch')).slice(0, 3).join(' | '));

// 5. preset 安装 + 与官方 standard 的差异约束
const ourPreset = join(presetDir(TEST_HOME, 'finance-analyst'), 'agent.cordis.yml');
check('preset 已安装', existsSync(ourPreset));
const ourPmeta = readFileSync(join(presetDir(TEST_HOME, 'finance-analyst'), 'preset.yml'), 'utf8');
check('preset 显示名正确', ourPmeta.includes('金融分析师'), ourPmeta.split('\n')[0]);
const stdPreset = join(systemPresetsDir(bin), 'standard', 'agent.cordis.yml');
if (existsSync(stdPreset)) {
  const ours = lineSet(ourPreset), std = lineSet(stdPreset);
  const extra = [...ours].filter((l) => !std.has(l));
  const missing = [...std].filter((l) => !ours.has(l));
  const allowedExtra = (l) => /You are a financial research/.test(l) || /You research companies/.test(l) || /Always cite data sources/.test(l) || l === 'fetch: true' || l === 'text: |-';
  const allowedMissing = (l) => /You are a coding agent/.test(l) || l === 'fetch: false' || l === 'text: >-';
  check('与官方 standard 仅两处差异', extra.every(allowedExtra) && missing.every(allowedMissing), 'extra=' + JSON.stringify(extra) + ' missing=' + JSON.stringify(missing));
} else check('找到官方 standard preset 作对照', false, stdPreset);

// 6. skills
check('skill financial-analysis 已安装', existsSync(join(skillsDir(TEST_HOME, 'financial-analysis'), 'SKILL.md')));
check('skill company-research 已安装', existsSync(join(skillsDir(TEST_HOME, 'company-research'), 'SKILL.md')));
check('preset 目录内自带 skills', existsSync(join(presetDir(TEST_HOME, 'finance-analyst'), 'skills', 'financial-analysis', 'SKILL.md')));

// 7. patch 合并
const userPatch = readFileSync(join(profileDir(TEST_HOME, PROFILE), 'cordis.patch.yml'), 'utf8');
check('profile patch 含托管段', userPatch.includes('agenthub managed') && userPatch.includes('mcp-market-data'), '');

// 8. 状态
const state = loadState(TEST_HOME);
check('状态记录 agent', !!state.agents['finance-analyst'], '');
check('状态记录安全分与信任级', state.agents['finance-analyst']?.score >= 90 && state.agents['finance-analyst']?.trust === 'official', '');

// 9. 启动冒烟
console.log('== boot smoke（15s，port 3999）==');
const smoke = await bootSmokeCheck(bin, TEST_HOME, PROFILE, { port: 3999, waitMs: 15000 });
check('启动冒烟 PASS', smoke.passed, (smoke.checks ?? []).map((c) => c.name + (c.ok ? '=ok' : '=FAIL(' + (c.detail || '') + ')')).join('; ') + '\n' + (smoke.out || '').slice(0, 1500));

// 10. 回滚
rollback(TEST_HOME, 'finance-analyst');
check('回滚后 profile 移除', !existsSync(profileDir(TEST_HOME, PROFILE)));
check('回滚后 preset 移除', !existsSync(presetDir(TEST_HOME, 'finance-analyst')));
check('回滚后 skills 移除', !existsSync(skillsDir(TEST_HOME, 'financial-analysis')) && !existsSync(skillsDir(TEST_HOME, 'company-research')));
check('回滚后状态清空', Object.keys(loadState(TEST_HOME).agents).length === 0);

// 11. 重装（可重复性）
const res2 = install({ agentDir, home: TEST_HOME, bin, profileName: PROFILE, yes: true });
check('重装成功且健康 PASS', res2.health.passed, '');

const failed = results.filter((r) => !r.ok);
console.log('\n== 结果: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { console.log('失败项:'); for (const f of failed) console.log('  - ' + f.name + ' ' + f.detail); process.exit(1); }
process.exit(0);
