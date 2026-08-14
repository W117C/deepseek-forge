// lib/db/sqlite.mjs —— v0.3 Phase A：SQLite 存储层（node:sqlite 内置，零依赖）。
// 职责：schema version + 迁移、事务性持久化、崩溃恢复（WAL）、旧 registry.json 一次性迁移。
// 内存工作形态保持与旧 JSON 一致的 db 对象（agents/publishers/pending/catalog/publisherTokens），
// 服务端业务逻辑零改动；只有 load/persist 换掉。
// 注意：node:sqlite 在 Node 22 为 Experimental（会打印警告），接口已按本文件固定使用。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256hex } from '../signing.mjs';

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // v1：v0.3 规范十表（+ schema_version）。
  `
  CREATE TABLE publishers (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '',
    avatar TEXT DEFAULT '', website TEXT DEFAULT '', github TEXT DEFAULT '',
    public_key TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE packages (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    description TEXT DEFAULT '', publisher_id TEXT NOT NULL, category TEXT DEFAULT '',
    tags TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'published', trust TEXT NOT NULL DEFAULT 'community',
    score INTEGER, installs INTEGER NOT NULL DEFAULT 0, rating_sum INTEGER NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (publisher_id) REFERENCES publishers(id)
  );
  CREATE TABLE package_versions (
    package_id TEXT NOT NULL, version TEXT NOT NULL, manifest TEXT NOT NULL, artifact_id TEXT,
    compatibility TEXT DEFAULT '{}', status TEXT NOT NULL DEFAULT 'published',
    release_notes TEXT DEFAULT '', sha256 TEXT NOT NULL, signature TEXT NOT NULL, storage_key TEXT NOT NULL,
    scan TEXT DEFAULT '{}', installs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, published_at TEXT,
    PRIMARY KEY (package_id, version),
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
  );
  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL, version TEXT NOT NULL,
    filename TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL,
    signature TEXT NOT NULL, storage_key TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY (package_id, version) REFERENCES package_versions(package_id, version) ON DELETE CASCADE
  );
  CREATE TABLE dependencies (
    package_id TEXT NOT NULL, dep_name TEXT NOT NULL, dep_constraint TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (package_id, dep_name),
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
  );
  CREATE TABLE security_scans (
    package_id TEXT NOT NULL, version TEXT NOT NULL, score INTEGER, verdict TEXT,
    high INTEGER DEFAULT 0, medium INTEGER DEFAULT 0, low INTEGER DEFAULT 0, findings TEXT DEFAULT '[]',
    scanned_at TEXT NOT NULL,
    PRIMARY KEY (package_id, version),
    FOREIGN KEY (package_id, version) REFERENCES package_versions(package_id, version) ON DELETE CASCADE
  );
  CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT NOT NULL, client_key TEXT NOT NULL,
    score INTEGER NOT NULL, ts TEXT NOT NULL,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
  );
  CREATE TABLE installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT NOT NULL, version TEXT NOT NULL,
    event_id TEXT, ts TEXT NOT NULL,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
  );
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, subject TEXT NOT NULL,
    detail TEXT DEFAULT '', ts TEXT NOT NULL
  );
  CREATE TABLE api_tokens (
    publisher_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE
  );
  `,
];

export function openStore({ dir, legacyJsonPath = join(dir, 'registry.json') }) {
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'forge.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  const now = () => new Date().toISOString();

  // ── 迁移 ────────────────────────────────────────────────────────────────
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = db.prepare('SELECT MAX(version) AS v FROM schema_version').get()?.v ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(v + 1, now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // ── 旧 registry.json 一次性迁移 ────────────────────────────────────────
  const migratedMarker = legacyJsonPath + '.migrated';
  if (existsSync(legacyJsonPath) && !existsSync(migratedMarker)) {
    const legacy = JSON.parse(readFileSync(legacyJsonPath, 'utf8'));
    const legacyDb = { publishers: legacy.publishers ?? {}, agents: legacy.agents ?? {}, catalog: legacy.catalog ?? [], pending: legacy.pending ?? [], publisherTokens: legacy.publisherTokens ?? {} };
    writeState(legacyDb, { legacyMode: true });
    renameSync(legacyJsonPath, migratedMarker);
  }

  // ── 读入内存工作形态 ────────────────────────────────────────────────────
  const dbObj = readState();

  function writeState(d, { legacyMode = false } = {}) {
    db.exec('BEGIN');
    try {
      if (!legacyMode) {
        // 全量重写（规模小；事务保证原子性——比旧 JSON 全量写安全）
        for (const t of ['audit_logs_excluded']) { /* noop */ }
        db.exec('DELETE FROM artifacts'); db.exec('DELETE FROM security_scans'); db.exec('DELETE FROM dependencies');
        db.exec('DELETE FROM package_versions'); db.exec('DELETE FROM packages');
        db.exec('DELETE FROM api_tokens'); db.exec('DELETE FROM publishers');
      }
      const insPublisher = db.prepare('INSERT OR REPLACE INTO publishers (id, slug, name, description, website, github, avatar, public_key, verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const [id, publicKey] of Object.entries(d.publishers ?? {})) {
        const p = d.publisherProfiles?.[id] ?? {};
        insPublisher.run(id, p.slug ?? id, p.name ?? id, p.description ?? '', p.website ?? '', p.github ?? '', p.avatar ?? '', publicKey, p.verified ? 1 : 0, now(), now());
      }
      // catalog 收录插件的合成发布者（满足 packages.publisher_id 外键）
      if ((d.catalog ?? []).length > 0) {
        insPublisher.run('catalog', 'catalog', 'Community Catalog', '', '', '', '', '', 0, now(), now());
      }
      const insToken = db.prepare('INSERT OR REPLACE INTO api_tokens (publisher_id, token_hash, created_at) VALUES (?, ?, ?)');
      for (const [id, token] of Object.entries(d.publisherTokens ?? {})) {
        // 兼容：旧 JSON 里是明文 token；已哈希的存储直接使用
        const hash = token.length === 64 && /^[0-9a-f]+$/.test(token) ? token : sha256hex(token);
        insToken.run(id, hash, now());
      }
      const insPkg = db.prepare('INSERT INTO packages (id, slug, name, type, description, publisher_id, category, status, trust, score, installs, rating_sum, rating_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insVer = db.prepare('INSERT INTO package_versions (package_id, version, manifest, sha256, signature, storage_key, scan, status, installs, created_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insArt = db.prepare('INSERT INTO artifacts (id, package_id, version, filename, size, sha256, signature, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insScan = db.prepare('INSERT INTO security_scans (package_id, version, score, verdict, high, medium, low, findings, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const upsertPackage = (id, rec) => {
        insPkg.run(id, rec.slug ?? id, rec.name, rec.type ?? 'agent', rec.description ?? '', rec.publisher_id ?? '',
          rec.category ?? '', rec.status ?? 'published', rec.trust ?? 'community', rec.score ?? null,
          rec.installs ?? 0, rec.rating_sum ?? 0, rec.rating_count ?? 0, rec.created_at ?? now(), now());
      };
      const insDep = db.prepare('INSERT OR REPLACE INTO dependencies (package_id, dep_name, dep_constraint) VALUES (?, ?, ?)');
      for (const [id, a] of Object.entries(d.agents ?? {})) {
        const pkgStatus = a.status ?? (a.trust === 'blocked' ? 'blocked' : 'published');
        upsertPackage(id, {
          name: a.name, type: 'agent', description: a.manifest?.description ?? '', publisher_id: a.publisher,
          category: a.manifest?.category ?? '', status: pkgStatus, trust: a.trust, score: a.score,
          installs: a.installs ?? 0, rating_sum: a.ratings?.sum ?? 0, rating_count: a.ratings?.count ?? 0,
        });
        // dependencies：取最新版本 manifest 的 bundle 依赖
        const latestManifest = a.manifest ?? Object.values(a.versions ?? {}).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''))[0]?.manifest ?? null;
        for (const b of latestManifest?.components?.bundles ?? []) {
          insDep.run(id, b.package, b.version ?? '');
        }
        for (const v of Object.values(a.versions ?? {})) {
          insVer.run(id, v.version, JSON.stringify(v.manifest ?? null), v.sha256, v.signature, v.artifactPath ?? '',
            JSON.stringify(v.scan ?? {}), pkgStatus, v.installs ?? 0, v.publishedAt ?? now(), v.publishedAt ?? now());
          insArt.run(id + '@' + v.version, id, v.version, (v.artifactPath ?? '').split('/').pop() ?? '', 0, v.sha256, v.signature, v.artifactPath ?? '', v.publishedAt ?? now());
          insScan.run(id, v.version, v.scan?.score ?? null, v.scan?.verdict ?? null, v.scan?.high ?? 0, v.scan?.medium ?? 0, v.scan?.low ?? 0, JSON.stringify(v.scan?.findings ?? []), v.publishedAt ?? now());
        }
      }
      for (const p of d.pending ?? []) {
        upsertPackage(p.id, {
          name: p.name, type: 'agent', description: p.manifest?.description ?? '', publisher_id: p.publisher,
          category: p.manifest?.category ?? '', status: 'submitted', trust: p.trust, score: p.score,
        });
        insVer.run(p.id, p.version, JSON.stringify(p.manifest ?? null), p.sha256, p.signature, p.artifactPath ?? '',
          JSON.stringify(p.scan ?? {}), 'submitted', 0, p.submittedAt ?? now(), null);
        insArt.run(p.id + '@' + p.version, p.id, p.version, (p.artifactPath ?? '').split('/').pop() ?? '', 0, p.sha256, p.signature, p.artifactPath ?? '', p.submittedAt ?? now());
        insScan.run(p.id, p.version, p.scan?.score ?? null, p.scan?.verdict ?? null, p.scan?.high ?? 0, p.scan?.medium ?? 0, p.scan?.low ?? 0, '[]', p.submittedAt ?? now());
      }
      for (const c of d.catalog ?? []) {
        upsertPackage(c.name, {
          name: c.name, type: 'plugin', description: c.description ?? '', publisher_id: 'catalog',
          category: c.category ?? '', status: 'published', trust: c.trust ?? 'community',
        });
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function readState() {
    const d = { publishers: {}, agents: {}, catalog: [], pending: [], publisherTokens: {} };
    d.publisherProfiles = {};
    for (const r of db.prepare('SELECT * FROM publishers').all()) {
      d.publishers[r.id] = r.public_key;
      d.publisherProfiles[r.id] = { name: r.name, slug: r.slug, website: r.website, github: r.github, avatar: r.avatar, description: r.description, verified: !!r.verified };
    }
    for (const r of db.prepare('SELECT publisher_id, token_hash FROM api_tokens').all()) d.publisherTokens[r.publisher_id] = r.token_hash;
    for (const r of db.prepare('SELECT * FROM packages WHERE status = ?').all('published')) {
      if (r.type === 'plugin') {
        d.catalog.push({ name: r.id, source: 'catalog:' + r.id, description: r.description, category: r.category, trust: r.trust, ingestedAt: r.created_at });
        continue;
      }
      const versions = {};
      for (const v of db.prepare('SELECT * FROM package_versions WHERE package_id = ? AND status = ?').all(r.id, 'published')) {
        versions[v.version] = {
          version: v.version, sha256: v.sha256, signature: v.signature, artifactPath: v.storage_key,
          manifest: JSON.parse(v.manifest), scan: JSON.parse(v.scan), publishedAt: v.published_at, installs: v.installs,
        };
      }
      d.agents[r.id] = {
        id: r.id, name: r.name, publisher: r.publisher_id, trust: r.trust, score: r.score,
        status: r.status,
        installs: r.installs, ratings: { sum: r.rating_sum, count: r.rating_count },
        manifest: Object.values(versions)[0]?.manifest ?? null, versions,
      };
    }
    for (const p of db.prepare('SELECT * FROM packages WHERE status = ?').all('submitted')) {
      const v = db.prepare('SELECT * FROM package_versions WHERE package_id = ? AND status = ?').get(p.id, 'submitted');
      if (!v) continue;
      d.pending.push({
        id: p.id, name: p.name, version: v.version, publisher: p.publisher_id, trust: p.trust, score: p.score,
        scan: JSON.parse(v.scan), artifactPath: v.storage_key, signature: v.signature, sha256: v.sha256,
        manifest: JSON.parse(v.manifest), submittedAt: v.created_at,
      });
    }
    return d;
  }

  const persist = () => writeState(dbObj);
  const audit = (action, subject, detail = '') => {
    db.prepare('INSERT INTO audit_logs (action, subject, detail, ts) VALUES (?, ?, ?, ?)').run(action, subject, detail, now());
  };
  const checkpoint = () => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* 只读/无 WAL 时忽略 */ } };
  const close = () => { checkpoint(); db.close(); };

  return { db: dbObj, persist, audit, checkpoint, close, path: dbPath, schemaVersion: SCHEMA_VERSION };
}
