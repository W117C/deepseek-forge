import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { profileDir, runDsh } from './dsh.mjs';

// dump-config 健康检查：组合树可解析且包含期望行 → PASS
export function dumpConfigCheck(bin, home, profile, expectRows = []) {
  const r = runDsh(bin, ['--profile', profile, '--dump-config'], { home, timeoutMs: 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const checks = [];
  checks.push({ name: 'dump-config 退出码 0', ok: r.status === 0, detail: 'exit=' + r.status });
  for (const rowId of expectRows) {
    const present = new RegExp('- id: ' + rowId + '(\n|\r|$|\s)').test(out) || out.includes('id: ' + rowId);
    checks.push({ name: '组合树含行 ' + rowId, ok: present, detail: present ? '' : '未找到' });
  }
  const failed = checks.filter((c) => !c.ok);
  return { kind: 'dump-config', passed: failed.length === 0, checks, out };
}

export function runHealth(bin, home, profile, expectRows, smoke = false) {
  const results = [];
  results.push(dumpConfigCheck(bin, home, profile, expectRows));
  if (smoke) results.push(bootSmokeCheck(bin, home, profile));
  const passed = results.every((r) => r.passed);
  return { passed, results, profileDir: profileDir(home, profile), exists: existsSync(profileDir(home, profile)) };
}

// 启动冒烟：拉起 web profile，等 N 秒确认进程存活且无致命错误，然后终止。
export function bootSmokeCheck(bin, home, profile, { port = 3999, waitMs = 12000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['--profile', profile, '--port', String(port)], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', errOut = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errOut += d; });
    const timer = setTimeout(() => {
      const alive = child.exitCode === null;
      child.kill('SIGTERM');
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000);
      const fatal = /(fatal|FATAL|uncaught|Error:)/.test(errOut);
      resolve({ kind: 'boot-smoke', passed: alive && !fatal, checks: [
        { name: '进程存活 ' + waitMs + 'ms', ok: alive },
        { name: '无致命错误日志', ok: !fatal, detail: errOut.split('\n').slice(0, 5).join(' | ') },
      ], out: (out + errOut).split('\n').slice(0, 20).join('\n') });
    }, waitMs);
    child.on('exit', (code) => {
      if (timer._destroyed) return;
      clearTimeout(timer);
      resolve({ kind: 'boot-smoke', passed: false, checks: [
        { name: '进程存活', ok: false, detail: '提前退出 code=' + code },
      ], out: (out + errOut).split('\n').slice(0, 20).join('\n') });
    });
  });
}
