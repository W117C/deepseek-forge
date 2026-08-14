// e2e-smoke：模型层冒烟——mock LLM 适配器下真实 headless 会话执行。
// 验证：agent loop 运行 → 模型路由（mock provider）→ 文本输出 → 会话持久化。
import { rmSync, existsSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { locateDsh } from '../lib/dsh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TEST_HOME = join(root, '.e2e-home');
const CLI = join(root, 'cli', 'agenthub.mjs');

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

console.log('== e2e-smoke: mock 模型层冒烟 ==');
rmSync(TEST_HOME, { recursive: true, force: true });
mkdirSync(TEST_HOME, { recursive: true });
const bin = locateDsh();
if (!bin) { console.error('dsh not found'); process.exit(1); }

// 1. 组装冒烟 Agent（headless profile + mock 模型路由 + finance bundle）
const agentDir = join(TEST_HOME, 'smoke-finance');
mkdirSync(join(agentDir, 'bundle', 'mock-llm'), { recursive: true });
mkdirSync(join(agentDir, 'bundle', 'finance-core'), { recursive: true });
cpSync(join(root, 'bundles', 'test-fixtures', 'mock-llm'), join(agentDir, 'bundle', 'mock-llm'), { recursive: true });
cpSync(join(root, 'bundles', 'finance-analyst', 'bundle', 'finance-core'), join(agentDir, 'bundle', 'finance-core'), { recursive: true });
writeFileSync(join(agentDir, 'agenthub.yaml'), [
  'schema: agenthub.dev/agent/v1',
  'id: smoke-finance',
  'name: Smoke Finance',
  'category: 测试 Test',
  'version: 0.1.0',
  'description: headless 冒烟：mock 模型路由 + finance 组合。',
  'publisher:',
  '  id: agenthub',
  '  name: AgentHub',
  'runtime: deepseek-harness',
  'compatibility:',
  '  dsh:',
  '    min: "0.1.0-rc.6"',
  '    tested: ["0.1.0-rc.6"]',
  '  node: ">=22"',
  'platform: [darwin, linux]',
  'components:',
  '  bundles:',
  '    - package: "@agenthub/mock-llm"',
  '      version: "0.1.0"',
  '    - package: "@agenthub/finance-core"',
  '      version: "0.1.0"',
  '  presets: []',
  '  skills: []',
  'profile:',
  '  name: smoke',
  '  bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@agenthub/finance-core"]',
  '  patch: ./profile.patch.yml',
  'permissions:',
  '  network: []',
  '  env: []',
  'secrets: []',
  'health:',
  '  - kind: dump-config',
  '    expect-rows: [agent-default-model]',
  'updatePolicy: notify',
  'trust: official',
  '',
].join('\n'));
writeFileSync(join(agentDir, 'profile.patch.yml'), [
  '# 冒烟：挂载 mock 适配器插件行 + 把默认模型路由切到 mock provider。',
  '- insert:',
  '    - id: mock-llm',
  "      name: '@agenthub/mock-llm'",
  '- id: agent-default-model',
  '  config:',
  '    provider: mock',
  '    model: mock-1',
  '',
].join('\n'));

// 2. 安装
const i = await run(['install', agentDir, '--home', TEST_HOME, '--yes']);
check('冒烟 Agent 安装健康 PASS', i.status === 0 && /健康检查：PASS/.test(i.stdout + i.stderr), (i.stdout + i.stderr).split('\n').filter((l) => /健康|失败/.test(l)).slice(0, 2).join(' | '));

// 3. 真实 headless 会话执行（mock 模型）
const sessionsBefore = existsSync(join(TEST_HOME, 'sessions')) ? readdirSync(join(TEST_HOME, 'sessions')).length : 0;
const headless = await new Promise((resolve) => {
  const child = spawn(bin, ['--profile', 'smoke', 'ping'], { env: { ...process.env, DSH_HOME: TEST_HOME }, timeout: 120000 });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ status: 'timeout', stdout: out, stderr: err }); }, 115000);
  child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout: out, stderr: err }); });
});
check('headless 会话执行退出码 0', headless.status === 0, 'status=' + headless.status + '\n' + (headless.stdout + headless.stderr).split('\n').slice(-8).join('\n'));
const all = headless.stdout + headless.stderr;
check('模型层输出 MOCK-OK（loop 跑通）', all.includes('MOCK-OK'), all.split('\n').filter((l) => /MOCK|error|Error/.test(l)).slice(0, 3).join(' | '));
const sessionsAfter = existsSync(join(TEST_HOME, 'sessions')) ? readdirSync(join(TEST_HOME, 'sessions')).length : 0;
check('会话已持久化', sessionsAfter > sessionsBefore, 'sessions ' + sessionsBefore + '→' + sessionsAfter);

const failed = results.filter((x) => !x.ok);
console.log('\n== e2e-smoke: ' + (results.length - failed.length) + '/' + results.length + ' PASS ==');
if (failed.length) { for (const x of failed) console.log('  - ' + x.name); process.exit(1); }
process.exit(0);
