// 最小注册中心（M2）：内存索引 + JSON 持久化 + 制品 tgz 文件存储。
// 发布 = POST manifest+公钥+制品+签名；服务端验签 + 验哈希后入库。
// 信任策略：发布者公钥 trust-on-first-use（同 publisher 的 key 必须一致）。
import { createServer } from 'node:http';
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256hex, verifyPayload, canonicalPayload } from './signing.mjs';
import { scanAgentDir } from './security.mjs';
import { renderHome, renderDetail, renderCompose } from './webui.mjs';
import { composeAgent } from './scaffold.mjs';
import { openStore } from './db/sqlite.mjs';
import { isValidSemver, sortVersions } from './semver.mjs';

// 恒定时间比较（令牌/HMAC 一律走这里，防时序旁路）
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest();
  const hb = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ha, hb);
}

// 包 id 白名单：仅小写字母/数字/连字符，杜绝路径遍历（../ 等一律拒绝）
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isValidId = (id) => typeof id === 'string' && ID_RE.test(id);

// tar 条目安全检查：拒绝绝对路径与含 .. 的条目（防 tar-slip 越界解包）
function assertSafeTarEntries(tgz) {
  const r = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { ok: false, error: '无法列出 tar 内容: ' + (r.stderr || '') };
  for (const line of (r.stdout || '').split('\n')) {
    const e = line.trim();
    if (!e) continue;
    if (e.startsWith('/') || e.split('/').includes('..')) {
      return { ok: false, error: '制品包含不安全路径条目：' + e };
    }
  }
  return { ok: true };
}

export function createRegistry({ dir, officialPublishers = ['agenthub'], operatorToken = null, requirePublisherAuth = false, artifactSecret = null, corsOrigins = null, allowInsecure = false } = {}) {
  // 安全门禁：未显式配置鉴权且未显式进入开发模式时，特权端点 fail-closed（503）。
  if (allowInsecure) {
    console.warn('[forge-registry] ⚠ 以 allowInsecure 模式运行：发布/审核/状态管理端点未强制鉴权。仅限本地开发，严禁公网部署。');
  }
  // 制品签名 URL：HMAC-SHA256(secret, pathname:exp)，5 分钟有效期（防盗链）
  // 综合排名分（M3 初版）：安装数 + 评分×20 + 安全分×0.5 + 信任加成
  const rankScore = (a) => {
    const rating = a.ratings?.count ? (a.ratings.sum / a.ratings.count) : 0;
    const trustBonus = a.trust === 'official' ? 50 : a.trust === 'verified' ? 30 : a.trust === 'community' ? 10 : 0;
    return Math.round((a.installs ?? 0) + rating * 20 + (a.score ?? 0) * 0.5 + trustBonus);
  };
  const signUrl = (pathname) => {
    if (!artifactSecret) return pathname;
    const exp = Date.now() + 5 * 60 * 1000;
    const sig = createHmac('sha256', artifactSecret).update(pathname + ':' + exp).digest('hex');
    return pathname + '?exp=' + exp + '&sig=' + sig;
  };
  const verifySignedUrl = (url) => {
    if (!artifactSecret) return true;
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig');
    if (!exp || !sig) return false;
    const expect = createHmac('sha256', artifactSecret).update(url.pathname + ':' + exp).digest('hex');
    const now = Date.now();
    return exp > now && exp - now < 10 * 60 * 1000 && safeEqual(sig, expect);
  };
  mkdirSync(join(dir, 'artifacts'), { recursive: true });
  // v0.3 Phase A：SQLite 存储（schema v1 + 事务 + WAL + 旧 registry.json 一次性迁移）
  const store = openStore({ dir });
  const db = store.db;
  db.publisherProfiles = db.publisherProfiles ?? {};
  // 评分限流：ip+agent → 时间戳数组（10 分钟窗口最多 5 次，防刷）
  const ratingLog = new Map();
  // 安装上报幂等：eventId → 时间戳（24h 窗口，防重复计数）
  const installEvents = new Map();
  // 制品下载限速：ip → {count, windowStart}（每分钟 10 次，防批量爬取制品）
  const downloadLimits = new Map();
  const DOWNLOAD_MAX = 10;
  const DOWNLOAD_WINDOW_MS = 60 * 1000;
  const persist = () => store.persist();

  // P1-4：防内存泄漏 —— ratingLog/downloadLimits 以 IP 为键且无清理，超阈值时裁剪过期条目
  function pruneRateMaps() {
    const now = Date.now();
    if (ratingLog.size > 5000) {
      for (const [k, arr] of ratingLog) {
        const live = arr.filter((t) => now - t < 10 * 60 * 1000);
        if (live.length === 0) ratingLog.delete(k);
        else ratingLog.set(k, live);
      }
    }
    if (downloadLimits.size > 5000) {
      for (const [k, lim] of downloadLimits) {
        if (now - lim.windowStart >= DOWNLOAD_WINDOW_MS) downloadLimits.delete(k);
      }
    }
  }

  // 服务端安全扫描：对制品实体（不是自报元数据）解包并静态扫描。
  // 注意：spawnSync 会短暂阻塞事件循环（M2 单进程可接受，M3 换异步 worker）。
  function scanArtifact(artifact, extractDir) {
    rmSync(extractDir, { recursive: true, force: true });
    mkdirSync(extractDir, { recursive: true });
    // 临时 tgz 写入独立临时目录（唯一名），避免同 id+version 并发扫描互踩
    const tmpDir = mkdtempSync(join(dir, 'scan-tmp-'));
    const tgz = join(tmpDir, 'incoming.tgz');
    writeFileSync(tgz, artifact);
    // 先列条目做 tar-slip 检查（拒绝绝对路径 / ../），再解包
    const pre = assertSafeTarEntries(tgz);
    if (!pre.ok) {
      rmSync(tmpDir, { recursive: true, force: true });
      return { error: pre.error, verdict: 'block', score: 0, high: 1, medium: 0, low: 0, files: 0 };
    }
    const r = spawnSync('tar', ['-xzf', tgz, '-C', extractDir], { encoding: 'utf8' });
    rmSync(tmpDir, { recursive: true, force: true });
    if (r.status !== 0) return { error: '解包失败: ' + (r.stderr || '') };
    const scan = scanAgentDir(extractDir, { trust: 'community' });
    return { score: scan.score, verdict: scan.verdict, high: scan.high, medium: scan.medium, low: scan.low, files: scan.files };
  }

  // 信任定级：官方发布者白名单 + 服务端扫描结论，绝不信任自报 trust。
  function assignTrust(publisher, manifestTrust, scan) {
    if (scan?.error || scan?.verdict === 'block') return 'blocked';
    if (officialPublishers.includes(publisher)) return manifestTrust === 'official' || manifestTrust === 'verified' ? manifestTrust : 'official';
    return 'community';
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // CORS：corsOrigins 配置允许的来源列表；null = 全部放行（公共只读市场）。写端点仍有鉴权保护。
    const origin = req.headers.origin;
    if (origin) {
      const allowed = corsOrigins === null || (Array.isArray(corsOrigins) && corsOrigins.includes(origin));
      if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigins === null ? '*' : origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
        res.setHeader('Vary', 'Origin');
      }
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    pruneRateMaps(); // P1-4：限速 Map 惰性裁剪（每请求一次，超阈值才遍历）
    const send = (code, obj, headers = {}) => {
      const isBuf = Buffer.isBuffer(obj);
      const body = isBuf ? obj : Buffer.from(JSON.stringify(obj));
      res.writeHead(code, { 'content-type': isBuf ? 'application/gzip' : 'application/json', ...headers });
      res.end(body);
    };
    try {
      if (req.method === 'GET' && url.pathname === '/v1/health') return send(200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/v1/agents') {
        return send(200, Object.values(db.agents).map((a) => ({
          id: a.id, name: a.name, publisher: a.publisher, trust: a.trust, score: a.score,
          versions: Object.keys(a.versions), installs: a.installs ?? 0, ratings: a.ratings ?? { sum: 0, count: 0 },
          rankScore: rankScore(a),
        })).sort((x, y) => y.rankScore - x.rankScore));
      }
      // v0.3 Phase B：Package/Version/Artifact 泛化端点（规范模型视图；旧 /v1/agents 保留兼容）
      const packageView = (a) => {
        const vs = Object.values(a.versions ?? {});
        const sorted = sortVersions(vs.map((v) => v.version));
        const latest = sorted[0] ?? null;
        const times = vs.map((v) => v.publishedAt).filter(Boolean).sort();
        const rating = a.ratings?.count ? a.ratings.sum / a.ratings.count : null;
        return {
          id: a.id, slug: a.id, name: a.name, type: 'agent', description: a.manifest?.description ?? '',
          publisher: a.publisher, publisherProfile: db.publisherProfiles?.[a.publisher] ?? null,
          category: a.manifest?.category ?? '', tags: [],
          status: a.status ?? (a.trust === 'blocked' ? 'blocked' : 'published'),
          trust: a.trust, score: a.score, installs: a.installs ?? 0,
          ratings: { average: rating, count: a.ratings?.count ?? 0 },
          latest, versions: sorted,
          createdAt: times[0] ?? null, updatedAt: times[times.length - 1] ?? null,
        };
      };
      if (req.method === 'GET' && url.pathname === '/v1/packages') {
        return send(200, Object.values(db.agents).map(packageView));
      }
      let pm = url.pathname.match(/^\/v1\/packages\/([^/]+)$/);
      if (req.method === 'GET' && pm) {
        const a = db.agents[decodeURIComponent(pm[1])];
        if (!a) return send(404, { error: 'not found: ' + pm[1] });
        return send(200, packageView(a));
      }
      pm = url.pathname.match(/^\/v1\/packages\/([^/]+)\/versions$/);
      if (req.method === 'GET' && pm) {
        const a = db.agents[decodeURIComponent(pm[1])];
        if (!a) return send(404, { error: 'not found: ' + pm[1] });
        return send(200, sortVersions(Object.keys(a.versions ?? {})).map((ver) => {
          const v = a.versions[ver];
          return { version: ver, sha256: v.sha256, signature: v.signature, manifest: v.manifest, publishedAt: v.publishedAt, scan: v.scan, artifactUrl: signUrl('/v1/packages/' + encodeURIComponent(a.id) + '/' + encodeURIComponent(ver) + '/artifact') };
        }));
      }
      pm = url.pathname.match(/^\/v1\/publishers\/([^/]+)$/);
      if (req.method === 'GET' && pm) {
        const pid = decodeURIComponent(pm[1]);
        if (!db.publishers[pid]) return send(404, { error: 'publisher not found: ' + pid });
        return send(200, {
          id: pid, publicKey: db.publishers[pid],
          profile: db.publisherProfiles?.[pid] ?? { name: pid },
          packages: Object.values(db.agents).filter((a) => a.publisher === pid).map((a) => a.id),
        });
      }
      // v0.3 Phase D：包状态管理（运营者，operatorToken 鉴权）：published | deprecated | yanked
      if (req.method === 'POST' && url.pathname.match(/^\/v1\/packages\/([^/]+)\/status$/)) {
        // 未配置运营鉴权时 fail-closed（除非显式 allowInsecure 开发模式）
        if (!operatorToken && !allowInsecure) return send(503, { error: 'registry 未配置 operatorToken：状态管理已拒绝（生产请配置 --operator-token；本地开发请加 --allow-insecure）' });
        if (operatorToken && !safeEqual(bearer, operatorToken)) return send(401, { error: 'operator auth required' });
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const a = db.agents[id];
        if (!a) return send(404, { error: 'not found: ' + id });
        let body = '';
        for await (const chunk of req) body += chunk;
        const { status } = JSON.parse(body);
        if (!['published', 'deprecated', 'yanked'].includes(status)) return send(400, { error: 'status 必须是 published | deprecated | yanked' });
        if (status === 'published' && a.trust === 'blocked') return send(400, { error: 'blocked 包不可恢复为 published' });
        a.status = status;
        persist();
        store.audit('status-change', id, status);
        return send(200, { id, status });
      }
      if (req.method === 'GET' && url.pathname === '/v1/search') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const hits = Object.values(db.agents).filter((a) =>
          !q || a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
          (a.manifest?.description || '').toLowerCase().includes(q));
        const catHits = db.catalog.filter((c) =>
          q && (c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)));
        return send(200, [
          ...hits.map((a) => ({ kind: 'agent', id: a.id, name: a.name, publisher: a.publisher, trust: a.trust, score: a.score, description: a.manifest?.description })),
          ...catHits.map((c) => ({ kind: 'plugin', id: c.name, name: c.name, source: c.source, trust: c.trust, score: null, description: c.description })),
        ]);
      }
      let m = url.pathname.match(/^\/v1\/agents\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const a = db.agents[m[1]];
        if (!a) return send(404, { error: 'not found: ' + m[1] });
        const v = a.versions[a.manifest?.version];
        return send(200, {
          id: a.id, manifest: a.manifest, trust: a.trust, score: a.score, publisher: a.publisher,
          status: a.status ?? (a.trust === 'blocked' ? 'blocked' : 'published'),
          publisherProfile: db.publisherProfiles?.[a.publisher] ?? null,
          publicKey: db.publishers[a.publisher], signature: v?.signature, sha256: v?.sha256,
          scan: v?.scan, versions: Object.keys(a.versions),
          installs: a.installs ?? 0, ratings: a.ratings ?? { sum: 0, count: 0 },
          rankScore: rankScore(a),
          artifactUrl: v ? signUrl('/v1/agents/' + encodeURIComponent(a.id) + '/' + encodeURIComponent(v.version) + '/artifact') : null,
        });
      }
      m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/versions$/);
      if (req.method === 'GET' && m) {
        const a = db.agents[m[1]];
        if (!a) return send(404, { error: 'not found: ' + m[1] });
        return send(200, Object.values(a.versions).map((v) => ({ version: v.version, sha256: v.sha256, signature: v.signature, manifest: v.manifest, publishedAt: v.publishedAt, scan: v.scan, artifactUrl: signUrl('/v1/agents/' + encodeURIComponent(a.id) + '/' + encodeURIComponent(v.version) + '/artifact') })));
      }
      // 社区目录（收录的第三方插件，非完整 Agent）
      if (req.method === 'GET' && url.pathname === '/v1/catalog') {
        return send(200, db.catalog);
      }
      if (req.method === 'POST' && url.pathname === '/v1/ingest') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const entries = JSON.parse(body);
        if (!Array.isArray(entries)) return send(400, { error: 'expected JSON array' });
        let added = 0;
        for (const e of entries) {
          if (!e.name || !e.source) continue;
          const idx = db.catalog.findIndex((x) => x.name === e.name);
          const rec = { name: e.name, source: e.source, description: e.description ?? '', category: e.category ?? '', trust: 'community', ingestedAt: new Date().toISOString() };
          if (idx >= 0) db.catalog[idx] = rec; else { db.catalog.push(rec); added++; }
        }
        persist();
        return send(200, { ingested: added, total: db.catalog.length });
      }
      // Marketplace Web（M3）
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(200, Buffer.from(renderHome(db), 'utf8'), { 'content-type': 'text/html; charset=utf-8' });
      }
      // Agent Builder：服务端组合（复用 CLI compose 的合并核心；来源=已发布 Agent 的解包制品）
      if (req.method === 'POST' && url.pathname === '/v1/compose') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const ct = req.headers['content-type'] ?? '';
        let params;
        let idList;
        try {
          if (ct.includes('application/json')) {
            params = JSON.parse(body);
            idList = Array.isArray(params.ids) ? params.ids : (params.ids ? [params.ids] : []);
          } else {
            const sp = new URLSearchParams(body);
            params = { name: sp.get('name'), category: sp.get('category'), publisher: sp.get('publisher') };
            idList = sp.getAll('ids');
          }
        } catch {
          return send(400, { error: 'bad request body' });
        }
        const { name, category, publisher } = params;
        const id = String(name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
        if (!name || !id || idList.length < 2) return send(400, { error: 'name + ids(至少 2 个) required' });
        const sources = [];
        for (const sid of idList) {
          const a = db.agents[sid];
          if (!a) return send(404, { error: 'not found: ' + sid });
          if (a.trust === 'blocked') return send(403, { error: 'blocked 来源不可组合: ' + sid });
          const v = a.manifest?.version;
          const srcDir = join(dir, 'scan', sid, v);
          if (!existsSync(join(srcDir, 'agenthub.yaml'))) return send(500, { error: '来源未解包: ' + sid + '@' + v });
          sources.push(srcDir);
        }
        const tmp = mkdtempSync(join(dir, 'compose-'));
        const outDir = join(tmp, 'out');
        const composed = composeAgent({ outDir, id, name, category: category ?? '组合 Combo', publisher: publisher ?? 'compose', sources });
        const tgz = join(tmp, 'composed.tgz');
        const tar = spawnSync('tar', ['-czf', tgz, '-C', outDir, '.'], { encoding: 'utf8' });
        if (tar.status !== 0) return send(500, { error: 'tar failed: ' + (tar.stderr || '') });
        const buf = readFileSync(tgz);
        const summary = { id, name, bundles: composed.bundles, presets: composed.presets, skills: composed.skills };
        if (ct.includes('application/json')) return send(200, { composed: summary, tgzBase64: buf.toString('base64') });
        return send(200, buf, { 'content-type': 'application/gzip', 'content-disposition': 'attachment; filename="' + id + '.tgz"' });
      }
      if (req.method === 'GET' && url.pathname === '/compose') {
        return send(200, Buffer.from(renderCompose(db, url.searchParams.getAll('ids')), 'utf8'), { 'content-type': 'text/html; charset=utf-8' });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/agents/')) {
        const id = decodeURIComponent(url.pathname.slice(8));
        const html = renderDetail(db, id);
        if (!html) return send(404, Buffer.from('not found'), { 'content-type': 'text/plain; charset=utf-8' });
        return send(200, Buffer.from(html, 'utf8'), { 'content-type': 'text/html; charset=utf-8' });
      }
      m = url.pathname.match(/^\/v1\/(?:agents|packages)\/([^/]+)\/([^/]+)\/artifact$/);
      if (req.method === 'GET' && m) {
        const a = db.agents[m[1]];
        const v = a?.versions?.[m[2]];
        if (!v) return send(404, { error: 'artifact not found' });
        // 防盗链：配置 artifactSecret 后必须携带有效签名 URL
        if (!verifySignedUrl(url)) return send(403, { error: 'signed url required or invalid' });
        // 下载限速（per-ip 每分钟 10 次）
        const ip = req.socket.remoteAddress ?? 'unknown';
        const now = Date.now();
        const lim = downloadLimits.get(ip);
        if (lim && now - lim.windowStart < DOWNLOAD_WINDOW_MS && lim.count >= DOWNLOAD_MAX) {
          return send(429, { error: 'download rate limited' });
        }
        if (!lim || now - lim.windowStart >= DOWNLOAD_WINDOW_MS) downloadLimits.set(ip, { count: 1, windowStart: now });
        else lim.count += 1;
        const buf = readFileSync(v.artifactPath);
        return send(200, buf, { 'x-agenthub-sha256': v.sha256 });
      }
      // 匿名安装计数（客户端安装成功后上报；无用户标识；eventId 幂等防重复）
      if (req.method === 'POST' && url.pathname === '/v1/installations') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { id, version, eventId } = JSON.parse(body);
        const a = db.agents[id];
        if (!a) return send(404, { error: 'not found: ' + id });
        const now = Date.now();
        if (eventId) {
          const prev = installEvents.get(eventId);
          if (prev && now - prev < 24 * 3600 * 1000) {
            return send(200, { id, installs: a.installs ?? 0, duplicate: true });
          }
          installEvents.set(eventId, now);
          if (installEvents.size > 10000) {
            for (const k of installEvents.keys()) { installEvents.delete(k); if (installEvents.size <= 8000) break; }
          }
        }
        a.installs = (a.installs ?? 0) + 1;
        if (a.versions[version]) a.versions[version].installs = (a.versions[version].installs ?? 0) + 1;
        persist();
        return send(200, { id, installs: a.installs });
      }
      // 评分（1-5；ip+agent 10 分钟窗口最多 5 次，防刷）
      if (req.method === 'POST' && url.pathname.match(/^\/v1\/agents\/([^/]+)\/ratings$/)) {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const a = db.agents[id];
        if (!a) return send(404, { error: 'not found: ' + id });
        const ip = req.socket.remoteAddress ?? 'unknown';
        const key = ip + '|' + id;
        const now = Date.now();
        const recent = (ratingLog.get(key) ?? []).filter((t) => now - t < 10 * 60 * 1000);
        if (recent.length >= 5) return send(429, { error: 'rate limited：10 分钟内最多评 5 次' });
        let body = '';
        for await (const chunk of req) body += chunk;
        const { score } = JSON.parse(body);
        if (!Number.isInteger(score) || score < 1 || score > 5) return send(400, { error: 'score must be 1-5' });
        recent.push(now);
        ratingLog.set(key, recent);
        a.ratings = a.ratings ?? { sum: 0, count: 0 };
        a.ratings.sum += score;
        a.ratings.count += 1;
        persist();
        return send(200, { id, average: a.ratings.sum / a.ratings.count, count: a.ratings.count });
      }
      // 发布者令牌轮换（v0.3 Phase D）：旧 Bearer 有效 → 签发新令牌并失效旧的
      if (req.method === 'POST' && url.pathname.match(/^\/v1\/publishers\/([^/]+)\/rotate-token$/)) {
        const pid = decodeURIComponent(url.pathname.split('/')[3]);
        const tokenHash = db.publisherTokens[pid];
        if (!tokenHash || !safeEqual(sha256hex(bearer), tokenHash)) return send(401, { error: 'publisher auth required' });
        const raw = randomBytes(24).toString('base64url');
        db.publisherTokens[pid] = sha256hex(raw);
        persist();
        store.audit('token-rotate', pid, '');
        return send(200, { publisher: pid, token: raw });
      }
      // 发布者注册（幂等：同发布者同公钥返回同一 token）
      if (req.method === 'POST' && url.pathname === '/v1/publishers/register') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { publisher, publicKey, name, slug, website, github, avatar, description } = JSON.parse(body);
        if (!publisher || !publicKey) return send(400, { error: 'publisher + publicKey required' });
        if (db.publishers[publisher] && db.publishers[publisher] !== publicKey) {
          return send(409, { error: 'publisher public key mismatch' });
        }
        db.publishers[publisher] = publicKey;
        db.publisherProfiles[publisher] = { name: name ?? publisher, slug: slug ?? publisher, website: website ?? '', github: github ?? '', avatar: avatar ?? '', description: description ?? '', verified: false };
        let raw = null;
        if (!db.publisherTokens[publisher]) {
          raw = randomBytes(24).toString('base64url');
          db.publisherTokens[publisher] = sha256hex(raw); // 存储哈希，明文仅返回一次
        }
        persist();
        store.audit('publisher-register', publisher, name ?? '');
        return send(200, { publisher, name: name ?? publisher, token: raw ?? null });
      }
      if (req.method === 'POST' && url.pathname === '/v1/publish') {
        // B2 fail-closed 最先判断：未开启发布鉴权且非显式开发模式 → 任何发布都拒绝
        if (!requirePublisherAuth && !allowInsecure) return send(503, { error: 'registry 未开启发布鉴权（requirePublisherAuth）：发布已拒绝（生产请配置 --require-publisher-auth；本地开发请加 --allow-insecure）' });
        let body = '';
        for await (const chunk of req) body += chunk;
        const { publisher, publicKey, manifest, artifactSha256, artifactBase64, signature } = JSON.parse(body);
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return send(400, { error: 'manifest required' });
        if (!isValidId(manifest.id)) return send(400, { error: 'manifest.id 不合法：仅允许小写字母/数字/连字符（^[a-z0-9][a-z0-9-]{0,63}$），拒绝路径遍历' });
        if (!isValidSemver(manifest.version)) return send(400, { error: 'version 必须是合法 SemVer（如 1.0.0、1.0.0-rc.1）' });
        if (requirePublisherAuth) {
          const tokenHash = db.publisherTokens[publisher];
          if (!tokenHash || !safeEqual(sha256hex(bearer), tokenHash)) return send(401, { error: 'publisher auth required（先 agenthub publisher-register 获取令牌）' });
        }
        if (db.publishers[publisher] && db.publishers[publisher] !== publicKey) {
          return send(409, { error: 'publisher public key mismatch（同一发布者公钥不一致）' });
        }
        const payload = canonicalPayload(manifest, artifactSha256);
        if (!verifyPayload(publicKey, payload, signature)) {
          return send(403, { error: 'signature verification failed' });
        }
        const artifact = Buffer.from(artifactBase64, 'base64');
        if (sha256hex(artifact) !== artifactSha256) {
          return send(400, { error: 'artifact hash mismatch' });
        }
        db.publishers[publisher] = publicKey;
        const verDir = join(dir, 'artifacts', manifest.id);
        mkdirSync(verDir, { recursive: true });
        const artifactPath = join(verDir, manifest.version + '.tgz');
        writeFileSync(artifactPath, artifact);
        // 服务端扫描制品实体并定级信任（不信任自报值）
        const scan = scanArtifact(artifact, join(dir, 'scan', manifest.id, manifest.version));
        const trust = assignTrust(publisher, manifest.trust, scan);
        const versionRec = { version: manifest.version, sha256: artifactSha256, signature, manifest, artifactPath, publishedAt: new Date().toISOString(), scan, trust, score: scan?.score ?? null };
        if (officialPublishers.includes(publisher)) {
          // 官方发布者直发
          const a = db.agents[manifest.id] ??= { id: manifest.id, name: manifest.name, publisher, trust, score: versionRec.score, manifest: null, versions: {} };
          a.versions[manifest.version] = versionRec;
          a.manifest = manifest;
          a.name = manifest.name;
          a.trust = trust;
          a.score = versionRec.score;
          persist();
          store.audit('publish', manifest.id, manifest.version + ' trust=' + trust);
          return send(200, { published: manifest.id, version: manifest.version, trust, scan });
        }
        // 社区发布者：进审核队列，运营审批后才上架
        const idx = db.pending.findIndex((p) => p.id === manifest.id && p.version === manifest.version);
        const pendRec = { id: manifest.id, name: manifest.name, version: manifest.version, publisher, trust, score: versionRec.score, scan, artifactPath, signature, sha256: artifactSha256, manifest, submittedAt: new Date().toISOString() };
        if (idx >= 0) db.pending[idx] = pendRec; else db.pending.push(pendRec);
        persist();
        store.audit('publish-queued', manifest.id, manifest.version + ' trust=' + trust);
        return send(202, { queued: true, id: manifest.id, version: manifest.version, trust, scan });
      }
      // 审核队列与审批（运营者操作）
      if (req.method === 'GET' && url.pathname === '/v1/pending') {
        return send(200, db.pending.map((p) => ({ id: p.id, name: p.name, version: p.version, publisher: p.publisher, trust: p.trust, score: p.score, submittedAt: p.submittedAt })));
      }
      if (req.method === 'POST' && url.pathname === '/v1/review') {
        // 未配置运营鉴权时 fail-closed（除非显式 allowInsecure 开发模式）
        if (!operatorToken && !allowInsecure) return send(503, { error: 'registry 未配置 operatorToken：审核已拒绝（生产请配置 --operator-token；本地开发请加 --allow-insecure）' });
        if (operatorToken && !safeEqual(bearer, operatorToken)) return send(401, { error: 'operator auth required' });
        let body = '';
        for await (const chunk of req) body += chunk;
        const { id, version, approve } = JSON.parse(body);
        const idx = db.pending.findIndex((p) => p.id === id && p.version === version);
        if (idx < 0) return send(404, { error: 'pending entry not found' });
        const [pend] = db.pending.splice(idx, 1);
        if (approve) {
          const a = db.agents[pend.id] ??= { id: pend.id, name: pend.name, publisher: pend.publisher, trust: pend.trust, score: pend.score, manifest: null, versions: {} };
          a.versions[pend.version] = { version: pend.version, sha256: pend.sha256, signature: pend.signature, manifest: pend.manifest, artifactPath: pend.artifactPath, publishedAt: pend.submittedAt, scan: pend.scan };
          a.manifest = pend.manifest;
          a.name = pend.name;
          a.trust = pend.trust;
          a.score = pend.score;
          a.status = pend.trust === 'blocked' ? 'blocked' : 'published';
        } else {
          rmSync(pend.artifactPath, { force: true });
        }
        persist();
        store.audit('review', pend.id, pend.version + ' approve=' + !!approve);
        return send(200, { reviewed: pend.id, version: pend.version, approve: !!approve });
      }
      return send(404, { error: 'no route: ' + req.method + ' ' + url.pathname });
    } catch (err) {
      send(500, { error: String(err?.message ?? err) });
    }
  });

  return {
    server, db, store,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
    },
    close() { return new Promise((r) => server.close(r)); },
  };
}
