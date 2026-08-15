#!/usr/bin/env node
// agenthub —— DeepSeek Harness Agent Bundle Marketplace CLI（M2，零依赖）。
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { dshHome, locateDsh, dshVersion, profileDir, agenthubStore, runDsh } from '../lib/dsh.mjs';
import { install, rollback, installCatalogPlugin } from '../lib/installer.mjs';
import { loadAgentManifest } from '../lib/manifest.mjs';
import { scanAgentDir } from '../lib/security.mjs';
import { loadState } from '../lib/state.mjs';
import { runHealth } from '../lib/health.mjs';
import { keygen, signPayload, sha256hex, canonicalPayload } from '../lib/signing.mjs';
import { fetchAgent } from '../lib/registry-client.mjs';
import { runForgeCoreJson } from '../lib/forge-core-bin.mjs';
import { createRegistry } from '../lib/registry-server.mjs';
import { createAgent, composeAgent } from '../lib/scaffold.mjs';

const USAGE = `forge —— 一键把 DSH 变成专业 Agent（M2，bin 兼容别名 agenthub）

用法:
  forge doctor                        环境自检
  forge install <目录|id> [--registry <url>] [--version <v>] [--profile <name>] [--yes] [--smoke] [--trust <level>] [--home <dir>]
  forge update <id> --registry <url> [--home <dir>] [--yes]
  forge info <id> [--registry <url>] [--home <dir>]
  forge ingest <json 文件或 url> --registry <url>
  forge uninstall <id> [--home <dir>]
  forge rollback <id> [--home <dir>]
  forge list [--home <dir>]
  forge health <id> [--smoke] [--home <dir>]
  forge permissions <id> [--home <dir>]
  forge security <目录> [--trust <level>]
  forge keygen [--home <dir>]        生成发布者 ed25519 密钥对
  forge publish <目录> --registry <url> [--home <dir>]
  forge registry <dir> [--port <n>] [--require-publisher-auth] [--operator-token <t>] [--artifact-secret <s> | --allow-insecure]  启动本地注册中心（foreground）
`;

function flags(argv) {
  const f = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        if (f[k] === undefined) f[k] = next;
        else if (Array.isArray(f[k])) f[k].push(next);
        else f[k] = [f[k], next];
        i++;
      }
      else f[k] = true;
    } else f._.push(a);
  }
  return f;
}

function print(obj) {
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

// 交互式确认：无 --yes 时询问（stdin 可管道化，便于测试与 CI）
async function confirm(summary) {
  if (process.stdin.isTTY === undefined || process.stdin.isTTY) {
    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = await rl.question(summary + ' [y/N] ');
      rl.close();
      return /^y|yes$/i.test(ans.trim());
    } catch {
      rl.close();
      return false;
    }
  }
  // 非 TTY：从 stdin 读一行
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin });
  try {
    for await (const line of rl) {
      rl.close();
      return /^y|yes$/i.test(line.trim());
    }
  } catch { /* 空 stdin */ }
  return false;
}

function publisherTokenFile(home) {
  return join(agenthubStore(home), 'publisher.json');
}

function loadPublisherTokens(home) {
  const p = publisherTokenFile(home);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

// 发布（可被 publish 与 compose-server --publish 复用）：本地密钥签名 + 令牌鉴权
async function doPublish(agentDir, url, home, f) {
  const manifest = loadAgentManifest(agentDir);
  const keysPath = join(agenthubStore(home), 'keys.json');
  if (!existsSync(keysPath)) { console.error('错误：先运行 agenthub keygen 生成发布者密钥。'); process.exit(1); }
  const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
  const stored = loadPublisherTokens(home)[url.replace(/\/$/, '')];
  const token = f.token || stored?.token;
  const tmp = join(agenthubStore(home), 'publish-' + manifest.id + '-' + manifest.version + '.tgz');
  mkdirSync(agenthubStore(home), { recursive: true });
  const tar = spawnSync('tar', ['-czf', tmp, '--exclude', './node_modules', '-C', agentDir, '.'], { encoding: 'utf8' });
  if (tar.status !== 0) { console.error('打包失败: ' + tar.stderr); process.exit(1); }
  const artifact = readFileSync(tmp);
  const sha = sha256hex(artifact);
  const signature = signPayload(keys.privateKey, canonicalPayload(manifest, sha));
  console.log('发布 ' + manifest.id + ' v' + manifest.version + ' → ' + url);
  const res = await fetch(url.replace(/\/$/, '') + '/v1/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({
      publisher: manifest.publisher?.id ?? 'unknown',
      publicKey: keys.publicKey,
      manifest,
      artifactSha256: sha,
      artifactBase64: artifact.toString('base64'),
      signature,
    }),
  });
  const text = await res.text();
  console.log('HTTP ' + res.status + ' ' + text);
  if (res.status !== 200 && res.status !== 202) process.exit(1);
  if (res.status === 202) console.log('（非官方发布者已进入审核队列，运营审批后上架）');
  return { id: manifest.id, version: manifest.version, status: res.status };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(USAGE); return; }
  const f = flags(rest);
  const bin = locateDsh();
  const home = dshHome(f);

  if (cmd === 'doctor') {
    const r = {
      node: process.version,
      pnpm: spawnSync('pnpm', ['-v'], { encoding: 'utf8' }).status === 0,
      dsh: bin ? { bin, version: dshVersion(bin) } : null,
      dshHome: home,
      profiles: existsSync(join(home, 'profiles')) ? readdirSync(join(home, 'profiles')) : [],
      installed: loadState(home),
    };
    print(r); return;
  }

  if (cmd === 'install') {
    const target = f._[0];
    if (!target) { console.log(USAGE); process.exit(2); }
    if (!bin) { console.error('错误：找不到 dsh。请设置 AGENTHUB_DSH_BIN 指向 dsh 可执行文件。'); process.exit(1); }
    let agentDir;
    let registryTrust;
    if (f.registry) {
      const fetchDir = join(agenthubStore(home), 'fetch', target);
      console.log('从 Registry 拉取 ' + target + '（验签 + 验哈希 + 解包）…');
      let fetched;
      try {
        fetched = await fetchAgent(f.registry, target, join(fetchDir, target), f.version);
      } catch (err) {
        // 不是完整 Agent → 尝试社区目录插件（需显式信任确认）
        if (String(err.message).includes('404')) {
          const cat = await (await fetch(f.registry.replace(/\/$/, '') + '/v1/catalog')).json();
          const entry = cat.find((c) => c.name === target);
          if (!entry) throw err;
          if (f.trust !== 'community') {
            throw new Error('社区插件未经审核：安装需显式加 --trust community 确认（来源 ' + entry.source + '）');
          }
          console.log('社区插件安装：' + entry.source);
          const res = installCatalogPlugin({ name: entry.name, source: entry.source, home, bin, profileName: f.profile || 'plugins' });
          console.log('✓ 已通过官方 dsh plugin 安装（可 rollback：' + res.name + '）');
          return;
        }
        throw err;
      }
      agentDir = fetched.destDir;
      registryTrust = fetched.detail.trust;
      console.log('✓ 校验通过：sha256 ' + fetched.sha256.slice(0, 16) + '…，签名有效，registry trust=' + registryTrust + '，version=' + fetched.version);
    } else {
      agentDir = resolve(target);
    }
    if (!existsSync(join(agentDir, 'agenthub.yaml'))) {
      console.error('错误：' + agentDir + ' 缺少 agenthub.yaml');
      process.exit(1);
    }
    const manifest = loadAgentManifest(agentDir);
    const profileName = f.profile || manifest.profile?.name || manifest.id;
    console.log('安装 ' + manifest.name + ' v' + manifest.version + ' → profile "' + profileName + '"');
    console.log('DSH: ' + (bin ? bin + ' (' + dshVersion(bin) + ')' : '未找到'));
    console.log('DSH_HOME: ' + home);
    // P0-B：数据源 provider 选择（--data-source <id> 或交互；--yes 非交互用 default/first）
    let dataSource = f['data-source'];
    const dataSources = Array.isArray(manifest.dataSources) ? manifest.dataSources : [];
    if (dataSources.length > 0 && !dataSource && !f.yes && process.stdin.isTTY) {
      console.log('数据源 provider 选择：');
      dataSources.forEach((ds, i) => console.log(`  ${i + 1}) ${ds.id} — ${ds.label ?? ''}`));
      const pick = await confirm('选择数据源 provider（默认 1）: ');
      const idx = /^\d+$/.test(String(pick)) ? parseInt(pick, 10) - 1 : 0;
      dataSource = dataSources[Math.max(0, Math.min(idx, dataSources.length - 1))]?.id;
    }
    if (dataSource) console.log('数据源 provider：' + dataSource);
    if (!f.yes) {
      const ok = await confirm(
        '将写入 profiles/' + profileName + '/、.agent-presets/、skills/，权限声明 ' +
        JSON.stringify(manifest.permissions ?? {}) + '，trust=' + (f.trust || registryTrust || manifest.trust) + '。确认安装？');
      if (!ok) { console.log('已取消。'); process.exit(0); }
    }
    const result = install({ agentDir, home, bin, profileName, yes: f.yes, smoke: !!f.smoke, trust: f.trust || registryTrust, dataSource });
    // 匿名安装上报（默认开；--no-telemetry 关闭；失败不影响安装结果）
    if (f.registry && !f['no-telemetry']) {
      try {
        await fetch(f.registry.replace(/\/$/, '') + '/v1/installations', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: manifest.id, version: manifest.version, eventId: randomUUID() }),
        });
      } catch { /* 上报失败忽略 */ }
    }
    console.log('✓ 安装完成。步骤：' + result.steps.join(' → '));
    console.log('安全扫描：' + result.scan.score + '/100（' + result.scan.trust + '，高危 ' + result.scan.high + ' / 中危 ' + result.scan.medium + ' / 低危 ' + result.scan.low + '）');
    const h = result.health;
    console.log('健康检查：' + (h.passed ? 'PASS' : 'FAIL'));
    for (const r of h.results) {
      console.log('  [' + r.kind + '] ' + (r.passed ? 'PASS' : 'FAIL'));
      for (const c of r.checks ?? []) console.log('    ' + (c.ok ? '✓' : '✗') + ' ' + c.name + (c.detail ? ' — ' + c.detail : ''));
    }
    console.log('\n下一步：dsh --profile ' + profileName + '  （在会话里选择预设 "' + (manifest.components.presets[0]?.id ?? '') + '"）');
    return;
  }

  if (cmd === 'uninstall' || cmd === 'rollback') {
    const id = f._[0];
    if (!id) { console.log(USAGE); process.exit(2); }
    const r = rollback(home, id);
    console.log('✓ ' + cmd + ' 完成：' + id + '（恢复快照 ' + r.restored + '）');
    return;
  }

  if (cmd === 'list') {
    print(loadState(home));
    return;
  }

  if (cmd === 'health') {
    const id = f._[0];
    const state = loadState(home);
    const rec = state.agents?.[id];
    if (!rec) { console.error('未安装：' + id); process.exit(1); }
    const r = runHealth(bin, home, rec.profile, [], !!f.smoke);
    console.log('健康检查 ' + id + '：' + (r.passed ? 'PASS' : 'FAIL'));
    for (const res of r.results) {
      console.log('  [' + res.kind + '] ' + (res.passed ? 'PASS' : 'FAIL'));
      for (const c of res.checks ?? []) console.log('    ' + (c.ok ? '✓' : '✗') + ' ' + c.name + (c.detail ? ' — ' + c.detail : ''));
    }
    return;
  }

  if (cmd === 'permissions') {
    const id = f._[0];
    const state = loadState(home);
    const rec = state.agents?.[id];
    if (!rec) { console.error('未安装：' + id); process.exit(1); }
    console.log('权限（安装时声明）：');
    console.log('  network: ' + JSON.stringify(rec?.permissions?.network ?? []));
    console.log('  env:     ' + JSON.stringify(rec?.permissions?.env ?? []));
    console.log('  trust:   ' + rec.trust + '  安全分: ' + rec.score);
    return;
  }

  if (cmd === 'security') {
    const target = f._[0];
    if (!target) { console.log(USAGE); process.exit(2); }
    const s = scanAgentDir(resolve(target), { trust: f.trust || 'community' });
    print(s);
    return;
  }

  if (cmd === 'search') {
    const q = f._[0];
    if (!q) { console.log('用法: agenthub search <关键词> [--registry <url|路径>]'); process.exit(2); }
    if (f.registry && !/^https?:\/\//.test(f.registry)) {
      // 本地目录 Registry → 走 Rust 引擎
      print(runForgeCoreJson(['search', q, '--registry', f.registry]));
    } else if (f.registry) {
      const res = await fetch(f.registry.replace(/\/$/, '') + '/v1/search?q=' + encodeURIComponent(q));
      print(await res.json());
    } else {
      console.error('需要 --registry <url|本地路径>（桌面阶段 Local-first：本地目录经 forge-core search）');
      process.exit(2);
    }
    return;
  }

  if (cmd === 'info') {
    const id = f._[0];
    if (!id) { console.log(USAGE); process.exit(2); }
    const rec = loadState(home).agents?.[id];
    console.log('本地：' + (rec ? JSON.stringify({ kind: rec.kind ?? 'agent', version: rec.version, profile: rec.profile, installedAt: rec.installedAt, trust: rec.trust, score: rec.score, snapshot: rec.snapshot?.ts }, null, 2) : '未安装'));
    if (f.registry) {
      const d = await (await fetch(f.registry.replace(/\/$/, '') + '/v1/agents/' + encodeURIComponent(id))).json();
      if (d.error) console.log('Registry：' + d.error);
      else console.log('Registry：' + JSON.stringify({ id: d.id, latest: d.manifest?.version, versions: d.versions, trust: d.trust, score: d.score, scan: d.scan ? { score: d.scan.score, verdict: d.scan.verdict, high: d.scan.high, medium: d.scan.medium } : null }, null, 2));
    }
    return;
  }

  if (cmd === 'update') {
    const id = f._[0];
    const url = f.registry;
    if (!id || !url) { console.log(USAGE); process.exit(2); }
    const rec = loadState(home).agents?.[id];
    if (!rec) { console.error('未安装：' + id); process.exit(1); }
    const base = url.replace(/\/$/, '');
    const d = await (await fetch(base + '/v1/agents/' + encodeURIComponent(id))).json();
    if (d.error) { console.error('Registry：' + d.error); process.exit(1); }
    if (d.manifest?.version === rec.version) { console.log('已是最新版本 ' + rec.version); return; }
    console.log('升级 ' + id + '：' + (rec.version ?? '?') + ' → ' + d.manifest.version + '（trust=' + d.trust + '）');
    if (!f.yes) {
      const ok = await confirm('确认升级？失败会自动回滚到旧版本。');
      if (!ok) { console.log('已取消。'); process.exit(0); }
    }
    const fetched = await fetchAgent(url, id, join(agenthubStore(home), 'fetch', id), d.manifest.version);
    console.log('✓ 校验通过：sha256 ' + fetched.sha256.slice(0, 16) + '…，签名有效');
    const result = install({ agentDir: fetched.destDir, home, bin, profileName: rec.profile, yes: true, smoke: !!f.smoke, trust: d.trust });
    console.log('✓ 升级完成。健康检查：' + (result.health.passed ? 'PASS' : 'FAIL') + '（失败会自动回滚到旧版本）');
    return;
  }

  if (cmd === 'ingest') {
    const src = f._[0];
    const url = f.registry;
    if (!src || !url) { console.log(USAGE); process.exit(2); }
    const data = src.startsWith('http') ? await (await fetch(src)).text() : readFileSync(resolve(src), 'utf8');
    const obj = JSON.parse(data);
    // 自适应三种格式：alex（categories+plugins）/ bruc3van（repositories）/ 原生数组
    let entries;
    if (Array.isArray(obj.plugins)) {
      entries = obj.plugins.map((p) => ({
        name: p.name,
        source: 'github:' + String(p.url ?? '').replace(/^https?:\/\/github\.com\//, ''),
        description: typeof p.description === 'string' ? p.description : (p.description?.en || p.description?.['zh-CN'] || ''),
        category: p.category ?? '',
      })).filter((e) => e.name && e.source !== 'github:');
    } else if (Array.isArray(obj.repositories)) {
      const limit = Number(f.limit) || 100;
      entries = obj.repositories.slice(0, limit).map((r) => ({
        name: String(r.full_name ?? '').split('/')[1] || r.full_name,
        source: 'github:' + r.full_name,
        description: r.description ?? '',
        category: r.category_en || r.category || '',
      })).filter((e) => e.name && e.source !== 'github:');
    } else if (Array.isArray(obj)) {
      entries = obj;
    } else {
      console.error('无法识别的目录格式'); process.exit(2);
    }
    const res = await fetch(url.replace(/\/$/, '') + '/v1/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entries) });
    console.log('HTTP ' + res.status + ' ' + (await res.text()));
    return;
  }

  if (cmd === 'rate') {
    const id = f._[0];
    const score = Number(f._[1]);
    const url = f.registry;
    if (!id || !url || !Number.isInteger(score) || score < 1 || score > 5) { console.log('用法: agenthub rate <id> <1-5> --registry <url>'); process.exit(2); }
    const res = await fetch(url.replace(/\/$/, '') + '/v1/agents/' + encodeURIComponent(id) + '/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score }) });
    console.log('HTTP ' + res.status + ' ' + (await res.text()));
    return;
  }

  if (cmd === 'publisher-register') {
    const publisher = f._[0];
    const url = f.registry;
    if (!publisher || !url) { console.log('用法: agenthub publisher-register <publisher-id> --registry <url>'); process.exit(2); }
    const keysPath = join(agenthubStore(home), 'keys.json');
    if (!existsSync(keysPath)) { console.error('错误：先运行 agenthub keygen 生成发布者密钥。'); process.exit(1); }
    const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
    const base = url.replace(/\/$/, '');
    const res = await fetch(base + '/v1/publishers/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publisher, publicKey: keys.publicKey, name: publisher }),
    });
    const text = await res.text();
    console.log('HTTP ' + res.status + ' ' + text);
    if (res.status === 200) {
      const body = JSON.parse(text);
      if (body.token) {
        const tokens = loadPublisherTokens(home);
        tokens[base] = { publisher, token: body.token };
        mkdirSync(agenthubStore(home), { recursive: true });
        writeFileSync(publisherTokenFile(home), JSON.stringify(tokens, null, 2) + '\n');
        chmodSync(publisherTokenFile(home), 0o600);
        console.log('✓ 令牌已存储：' + publisherTokenFile(home) + '（后续 publish 自动携带）');
      } else {
        console.log('（该发布者已注册，保留既有令牌）');
      }
    }
    return;
  }

  if (cmd === 'review') {
    const id = f._[0];
    const version = f._[1];
    const url = f.registry;
    if (!id || !version || !url || (f.approve === undefined && f.reject === undefined)) {
      console.log('用法: agenthub review <id> <version> --approve|--reject --registry <url> [--operator-token <t>]');
      process.exit(2);
    }
    const token = f['operator-token'];
    const res = await fetch(url.replace(/\/$/, '') + '/v1/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ id, version, approve: !!f.approve }),
    });
    console.log('HTTP ' + res.status + ' ' + (await res.text()));
    return;
  }

  if (cmd === 'compose') {
    const name = f._[0];
    const froms = Array.isArray(f.from) ? f.from : (f.from ? [f.from] : []);
    if (!name || froms.length < 2) { console.log('用法: agenthub compose <名称> --from <Agent 目录> --from <Agent 目录> [--category <领域>] [--publisher <id>] [--out <目录>]'); process.exit(2); }
    const id = (f.id || name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id) { console.error('名称无法转为合法 id'); process.exit(1); }
    const outDir = f.out ? resolve(f.out) : resolve(id);
    const publisher = f.publisher || 'my-org';
    const r = composeAgent({ outDir, id, name, category: f.category || '组合 Combo', publisher, sources: froms.map((p) => resolve(p)) });
    console.log('✓ 组合完成：' + r.outDir + '（bundles ' + r.bundles + ' / presets ' + r.presets + ' / skills ' + r.skills + '）');
    console.log('下一步：');
    console.log('  node cli/agenthub.mjs install ' + r.outDir + ' --yes');
    console.log('  dsh --profile ' + id + '  （在会话里选择任一来源预设）');
    return;
  }

  if (cmd === 'create') {
    const name = f._[0];
    if (!name) { console.log('用法: agenthub create <名称> [--category <领域>] [--publisher <id>] [--out <目录>]'); process.exit(2); }
    const id = (f.id || name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id) { console.error('名称无法转为合法 id'); process.exit(1); }
    if (!bin) { console.error('错误：找不到 dsh（需要官方 standard preset 作为模板）。'); process.exit(1); }
    const outDir = f.out ? resolve(f.out) : resolve(id);
    const publisher = f.publisher || 'my-org';
    const r = createAgent({ outDir, id, name, category: f.category || '自定义 Custom', publisher, bin });
    console.log('✓ 已生成 Agent 脚手架：' + r.outDir + '（bundle: ' + r.corePkg + '）');
    console.log('下一步：');
    console.log('  node cli/agenthub.mjs install ' + r.outDir + ' --yes');
    console.log('  node cli/agenthub.mjs publish ' + r.outDir + ' --registry http://127.0.0.1:PORT');
    return;
  }

  if (cmd === 'keygen') {
    const keysPath = join(agenthubStore(home), 'keys.json');
    if (existsSync(keysPath)) { console.log('密钥已存在：' + keysPath); return; }
    mkdirSync(agenthubStore(home), { recursive: true });
    const keys = keygen();
    writeFileSync(keysPath, JSON.stringify(keys, null, 2) + '\n');
    chmodSync(keysPath, 0o600);
    console.log('✓ 发布者密钥已生成：' + keysPath);
    console.log('公钥（发布到 Registry 用，可公开）：');
    console.log(keys.publicKey);
    return;
  }

  if (cmd === 'registry') {
    const dir = f._[0];
    if (!dir) { console.log(USAGE); process.exit(2); }
    const op = f['operator-token'] || process.env.AGENTHUB_OPERATOR_TOKEN || null;
    const art = f['artifact-secret'] || process.env.AGENTHUB_ARTIFACT_SECRET || null;
    const pub = !!f['require-publisher-auth'];
    const insecure = !!f['allow-insecure'];
    // B2 安全门禁：无任何安全配置时拒绝裸启（特权端点默认 fail-closed）
    if (!pub && !op && !art && !insecure) {
      console.error('错误：Registry 需要至少一项安全配置才能启动（生产）：\n' +
        '  --require-publisher-auth   启用发布鉴权（发布需令牌）\n' +
        '  --operator-token <t>       运营鉴权令牌（审批 / 状态管理）\n' +
        '  --artifact-secret <s>       制品签名 URL 防盗链密钥\n' +
        '本地开发可显式加 --allow-insecure（特权端点仍会拒绝，除非同时传入）。');
      process.exit(1);
    }
    const reg = createRegistry({
      dir: resolve(dir),
      requirePublisherAuth: pub,
      operatorToken: op,
      artifactSecret: art,
      allowInsecure: insecure,
    });
    const port = await reg.listen(Number(f.port) || 0);
    console.log('Registry 已启动：http://127.0.0.1:' + port + '（数据目录 ' + resolve(dir) + '，发布鉴权 ' + (pub ? '开' : '关') + '，运营鉴权 ' + (op ? '开' : '关') + '，防盗链 ' + (art ? '开' : '关') + (insecure ? '，⚠ allowInsecure 开发模式' : '') + '）');
    return; // 进程常驻（事件循环由 server 保持）
  }

  if (cmd === 'publish') {
    const target = f._[0];
    const url = f.registry;
    if (!target || !url) { console.log(USAGE); process.exit(2); }
    await doPublish(resolve(target), url, home, f);
    return;
  }

  if (cmd === 'compose-server') {
    const name = f._[0];
    const url = f.registry;
    const rawIds = Array.isArray(f.ids) ? f.ids : (f.ids ? [f.ids] : []);
    const idList = rawIds.flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);
    if (!name || !url || idList.length < 2) {
      console.log('用法: agenthub compose-server <名称> --ids <id> --ids <id> [--category <领域>] [--publisher <id>] [--out <目录>] [--publish] --registry <url>');
      process.exit(2);
    }
    const res = await fetch(url.replace(/\/$/, '') + '/v1/compose', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, category: f.category, publisher: f.publisher, ids: idList }),
    });
    if (res.status !== 200) { console.error('HTTP ' + res.status + ' ' + (await res.text())); process.exit(1); }
    const j = await res.json();
    const outDir = f.out ? resolve(f.out) : resolve(j.composed.id);
    mkdirSync(outDir, { recursive: true });
    const tgz = join(outDir, '.composed.tgz');
    writeFileSync(tgz, Buffer.from(j.tgzBase64, 'base64'));
    const tar = spawnSync('tar', ['-xzf', tgz, '-C', outDir], { encoding: 'utf8' });
    rmSync(tgz, { force: true });
    if (tar.status !== 0) { console.error('解包失败: ' + tar.stderr); process.exit(1); }
    console.log('✓ 组合包已就绪：' + outDir + '（bundles ' + j.composed.bundles + ' / presets ' + j.composed.presets + ' / skills ' + j.composed.skills + '）');
    if (f.publish) {
      await doPublish(outDir, url, home, f);
      console.log('✓ 已发布。安装：node cli/agenthub.mjs install ' + j.composed.id + ' --registry ' + url + ' --yes');
    } else {
      console.log('下一步：node cli/agenthub.mjs install ' + outDir + ' --yes（或加 --publish 直接发布）');
    }
    return;
  }

  console.log(USAGE);
  process.exit(2);
}

main().catch((err) => {
  console.error('✗ 失败：' + err.message);
  if (err.installedSteps) console.error('  已完成步骤（已回滚）：' + err.installedSteps.join(' → '));
  if (err.rollbackError) console.error('  回滚异常：' + err.rollbackError);
  process.exit(1);
});
