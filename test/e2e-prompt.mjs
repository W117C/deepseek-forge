// e2e-prompt：交互式确认（无 --yes 时询问；n 取消 / y 安装）。
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { locateDsh } from '../lib/dsh.mjs';
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
function runInteractive(args, stdinText) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { env: { ...process.env, DSH_HOME: TEST_HOME } });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.stdin.write(stdinText + '\n');
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 300000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout: out, stderr: err }); });
  });
}

console.log('== e2e-prompt: 交互式确认 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
if (!locateDsh()) { console.error('dsh not found'); process.exit(1); }

// 1. 回答 n → 取消
const n = await runInteractive(['install', financeDir, '--home', TEST_HOME], 'n');
check('回答 n 取消安装', n.status === 0 && /已取消/.test(n.stdout + n.stderr), (n.stdout + n.stderr).split('\n').filter((l) => /取消|将写入/.test(l)).slice(0, 2).join(' | '));
check('取消后无安装记录', Object.keys(loadState(TEST_HOME).agents).length === 0, JSON.stringify(loadState(TEST_HOME).agents));

// 2. 回答 y → 安装
const y = await runInteractive(['install', financeDir, '--home', TEST_HOME], 'y');
check('回答 y 完成安装', y.status === 0 && /健康检查：PASS/.test(y.stdout + y.stderr), (y.stdout + y.stderr).split('\n').filter((l) => /健康|取消|失败/.test(l)).slice(0, 2).join(' | '));
check('确认后状态记录存在', !!loadState(TEST_HOME).agents['finance-analyst']);

// 3. 空 stdin（EOF）→ 默认取消
const eof = await runInteractive(['install', join(root, 'bundles', 'academic-researcher'), '--home', TEST_HOME], '');
check('空输入默认取消', eof.status === 0 && /已取消/.test(eof.stdout + eof.stderr), (eof.stdout + eof.stderr).split('\n').filter((l) => /取消|将写入/.test(l)).slice(0, 2).join(' | '));

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-prompt: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
