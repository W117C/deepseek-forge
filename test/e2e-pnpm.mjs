// e2e-pnpm：官方 dsh plugin（pnpm 转发 + 对账）路径对 AgentHub bundle 的兼容性回归。
// pnpm 不可用时 SKIP（exit 0，不算失败）。
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { locateDsh, runDsh, profileDir } from '../lib/dsh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-pnpm-home');
const PROFILE = 'finplug';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
}

console.log('== e2e-pnpm: 官方 dsh plugin 路径回归 ==');
const pnpm = spawnSync('pnpm', ['-v'], { encoding: 'utf8' });
if (pnpm.status !== 0) { console.log('SKIP：pnpm 不可用（官方路径回归需要 pnpm）'); process.exit(0); }
check('pnpm 可用', true, pnpm.stdout.trim());

const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const env = { ...process.env, DSH_HOME: TEST_HOME };

// 1. 官方命令安装本地 bundle（file: 绝对路径）
const bundleAbs = resolve(join(root, 'bundles', 'finance-analyst', 'bundle', 'finance-core'));
const add = spawnSync(bin, ['plugin', '--profile', PROFILE, 'add', 'file:' + bundleAbs], { encoding: 'utf8', env, timeout: 300000 });
check('dsh plugin add <file:> 退出码 0', add.status === 0, (add.stdout + add.stderr).split('\n').filter(Boolean).slice(-3).join(' | '));

// 2. 官方对账：bundle 自动加入 dsh.profile.bundles
const pmPath = join(profileDir(TEST_HOME, PROFILE), 'package.json');
check('profile 已初始化', existsSync(pmPath));
const pm = JSON.parse(readFileSync(pmPath, 'utf8'));
check('对账加入 @agenthub/finance-core', pm.dsh.profile.bundles.includes('@agenthub/finance-core'), JSON.stringify(pm.dsh.profile.bundles));

// 3. dump-config 验证组合树
const dump = runDsh(bin, ['--profile', PROFILE, '--dump-config'], { home: TEST_HOME, timeoutMs: 60000 });
const dt = (dump.stdout || '') + (dump.stderr || '');
check('官方路径的组合树含 finance 行', dump.status === 0 && dt.includes('mcp-market-data') && dt.includes('schedule'), 'exit=' + dump.status);
check('官方路径 fetch 覆盖生效', dt.includes('fetch: true'));

// 4. 官方路径卸载 + 对账移除
const rm = spawnSync(bin, ['plugin', '--profile', PROFILE, 'remove', '@agenthub/finance-core'], { encoding: 'utf8', env, timeout: 300000 });
check('dsh plugin remove 退出码 0', rm.status === 0, (rm.stdout + rm.stderr).split('\n').filter(Boolean).slice(-3).join(' | '));
const pm2 = JSON.parse(readFileSync(pmPath, 'utf8'));
check('对账移除 finance-core', !pm2.dsh.profile.bundles.includes('@agenthub/finance-core'), JSON.stringify(pm2.dsh.profile.bundles));

// 5. 与 agenthub 复制路径并存（同一 profile 两种方式混装）
const add2 = spawnSync(bin, ['plugin', '--profile', PROFILE, 'add', 'file:' + bundleAbs], { encoding: 'utf8', env, timeout: 300000 });
check('重新 add 成功（复装）', add2.status === 0);

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-pnpm: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
