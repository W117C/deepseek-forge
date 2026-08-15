#!/usr/bin/env node
// 用 forge-core 的本地扫描器扫描 28 个新入库包，结果写回 package.json.security 字段。
// 用法：node lib/scan-batch.mjs [--home DIR] [--trust LEVEL]
// 默认：~/.deepseek-forge/registry/packages，trust=community
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const BIN =
  join(here, '..', 'crates', 'forge-core', 'target', 'release', 'forge-core') ||
  join(here, '..', 'crates', 'forge-core', 'target', 'debug', 'forge-core');
function flag(args, name, def) {
  const i = args.indexOf('--' + name);
  if (i < 0 || i + 1 >= args.length) return def;
  return args[i + 1];
}

const home = join(process.env.HOME || '', '.deepseek-forge', 'registry');
const pkgDir = join(home, 'packages');
const trust = flag(process.argv.slice(2), 'trust', 'community');

function scanOne(id) {
  const out = execSync(
    BIN + ' scan "' + join(pkgDir, id) + '" --trust ' + trust,
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  ).trim();
  try {
    return JSON.parse(out);
  } catch {
    return { code: 'PARSE', human: 'scan 输出解析失败', stdout: out };
  }
}

function writeBack(id, report) {
  const pj = join(pkgDir, id, 'package.json');
  const pkg = JSON.parse(readFileSync(pj, 'utf8'));
  if (report && report.verdict) {
    pkg.security = {
      scan: 'completed',
      status: report.verdict,
      scannedAt: new Date().toISOString(),
      score: report.score,
      findings: (report.findings || []).map((f) => ({
        rule: f.rule,
        level: f.level,
        weight: f.weight,
        label: f.label,
        count: f.count,
        file: f.file,
      })),
    };
  } else {
    pkg.security = {
      scan: 'error',
      status: 'unknown',
      scannedAt: new Date().toISOString(),
      score: 0,
      findings: [
        { rule: 'scan_engine', level: 'high', weight: 100, label: 'scan 引擎报错', count: 1, file: null },
      ],
    };
  }
  writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
}

const ids = [];
try {
  for (const s of require('fs').readdirSync(pkgDir)) ids.push(s);
} catch {}

const results = new Map();
let ok = 0, err = 0;
for (const id of ids) {
  process.stderr.write('\rscanning ' + id + '  ...');
  try {
    const r = scanOne(id);
    if (r && r.verdict) {
      results.set(id, r);
      ok++;
    } else {
      err++;
    }
  } catch (e) {
    results.set(id, { code: 'EXCEPTION', human: e.message, stdout: '' });
    err++;
  }
}
process.stderr.write('\n');

// write back
for (const id of ids) {
  if (!results.has(id)) continue;
  const r = results.get(id);
  if (r && r.verdict) writeBack(id, r);
}
console.log('scanned ' + ok + ' ok, ' + err + ' errors, wrote back to ' + pkgDir);
console.log('trust level: ' + trust);
console.log('forge-core binary: ' + BIN + ' (exists=' + existsSync(BIN) + ')');

// summary
const rows = [];
for (const id of ids) {
  const r = results.get(id);
  rows.push({
    id,
    score: r && r.score ? r.score : null,
    verdict: r && r.verdict ? r.verdict : null,
    high: r && typeof r.high === 'number' ? r.high : 0,
    medium: r && typeof r.medium === 'number' ? r.medium : 0,
    low: r && typeof r.low === 'number' ? r.low : 0,
    findingLabels: (r && r.findings && r.findings.map((f) => f.label).join('; ')) || '',
    scanStatus: (r && r.scan) || (r && r.code) || 'missing',
  });
}
const summary = {
  total: rows.length,
  pass: rows.filter((r) => r.verdict === 'pass').length,
  warn: rows.filter((r) => r.verdict === 'warn').length,
  block: rows.filter((r) => r.verdict === 'block').length,
  err: err,
  byScore: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s) => ({
    bucket: s + '-' + (s + 9),
    count: rows.filter((r) => r.score !== null && r.score >= s && r.score < s + 10).length,
  })),
  rows,
};
console.log(JSON.stringify(summary, null, 2));
