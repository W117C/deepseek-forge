// 最小注册中心（M2）：内存索引 + JSON 持久化 + 制品 tgz 文件存储。
// 发布 = POST manifest+公钥+制品+签名；服务端验签 + 验哈希后入库。
// 信任策略：发布者公钥 trust-on-first-use（同 publisher 的 key 必须一致）。
import { createServer } from 'node:http';
import { randomBytes, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256hex, verifyPayload, canonicalPayload } from './signing.mjs';
import { scanAgentDir } from './security.mjs';
import { renderHome, renderDetail, renderCompose } from './webui.mjs';
import { composeAgent } from './scaffold.mjs';

export function createRegistry({ dir, officialPublishers = ['agenthub'], operatorToken = null, requirePublisherAuth = false, artifactSecret = null } = {}) {
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
    return exp > now && exp - now < 10 * 60 * 1000 && sig === expect;
  };
  mkdirSync(join(dir, 'artifacts'), { recursive: true });
  const dataFile = join(dir, 'registry.json');
  const db = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : { publishers: {}, agents: {}, catalog: [], pending: [], publisherTokens: {} };
  db.catalog = db.catalog ?? [];
  db.pending = db.pending ?? [];
  db.publisherTokens = db.publisherTokens ?? {};
  // 评分限流：ip+agent → 时间戳数组（10 分钟窗口最多 5 次，防刷）
  const ratingLog = new Map();
  // 安装上报幂等：eventId → 时间戳（24h 窗口，防重复计数）
  const installEvents = new Map();
  // 制品下载限速：ip → {count, windowStart}（每分钟 10 次，防批量爬取制品）
  const downloadLimits = new Map();
  const DOWNLOAD_MAX = 10;
  const DOWNLOAD_WINDOW_MS = 60 * 1000;
  const persist = () => writeFileSync(dataFile, JSON.stringify(db, null, 2) + '\n');

  // 服务端安全扫描：对制品实体（不是自报元数据）解包并静态扫描。
  // 注意：spawnSync 会短暂阻塞事件循环（M2 单进程可接受，M3 换异步 worker）。
  function scanArtifact(artifact, extractDir) {
    rmSync(extractDir, { recursive: true, force: true });
    mkdirSync(extractDir, { recursive: true });
    const tgz = join(extractDir, '..', 'incoming.tgz');
    writeFileSync(tgz, artifact);
    const r = spawnSync('tar', ['-xzf', tgz, '-C', extractDir], { encoding: 'utf8' });
    rmSync(tgz, { force: true });
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
      m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/([^/]+)\/artifact$/);
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
      // 发布者注册（幂等：同发布者同公钥返回同一 token）
      if (req.method === 'POST' && url.pathname === '/v1/publishers/register') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { publisher, publicKey, name } = JSON.parse(body);
        if (!publisher || !publicKey) return send(400, { error: 'publisher + publicKey required' });
        if (db.publishers[publisher] && db.publishers[publisher] !== publicKey) {
          return send(409, { error: 'publisher public key mismatch' });
        }
        db.publishers[publisher] = publicKey;
        if (!db.publisherTokens[publisher]) {
          db.publisherTokens[publisher] = randomBytes(24).toString('base64url');
        }
        persist();
        return send(200, { publisher, name: name ?? publisher, token: db.publisherTokens[publisher] });
      }
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (req.method === 'POST' && url.pathname === '/v1/publish') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { publisher, publicKey, manifest, artifactSha256, artifactBase64, signature } = JSON.parse(body);
        if (requirePublisherAuth) {
          const token = db.publisherTokens[publisher];
          if (!token || bearer !== token) return send(401, { error: 'publisher auth required（先 agenthub publisher-register 获取令牌）' });
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
          return send(200, { published: manifest.id, version: manifest.version, trust, scan });
        }
        // 社区发布者：进审核队列，运营审批后才上架
        const idx = db.pending.findIndex((p) => p.id === manifest.id && p.version === manifest.version);
        const pendRec = { id: manifest.id, name: manifest.name, version: manifest.version, publisher, trust, score: versionRec.score, scan, artifactPath, signature, sha256: artifactSha256, manifest, submittedAt: new Date().toISOString() };
        if (idx >= 0) db.pending[idx] = pendRec; else db.pending.push(pendRec);
        persist();
        return send(202, { queued: true, id: manifest.id, version: manifest.version, trust, scan });
      }
      // 审核队列与审批（运营者操作）
      if (req.method === 'GET' && url.pathname === '/v1/pending') {
        return send(200, db.pending.map((p) => ({ id: p.id, name: p.name, version: p.version, publisher: p.publisher, trust: p.trust, score: p.score, submittedAt: p.submittedAt })));
      }
      if (req.method === 'POST' && url.pathname === '/v1/review') {
        if (operatorToken && bearer !== operatorToken) return send(401, { error: 'operator auth required' });
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
        } else {
          rmSync(pend.artifactPath, { force: true });
        }
        persist();
        return send(200, { reviewed: pend.id, version: pend.version, approve: !!approve });
      }
      return send(404, { error: 'no route: ' + req.method + ' ' + url.pathname });
    } catch (err) {
      send(500, { error: String(err?.message ?? err) });
    }
  });

  return {
    server, db, dataFile,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
    },
    close() { return new Promise((r) => server.close(r)); },
  };
}
