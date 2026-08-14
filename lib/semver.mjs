// lib/semver.mjs —— SemVer 2.0 校验与排序（零依赖，仅覆盖发布所需子集）。
// 支持：MAJOR.MINOR.PATCH[-prerelease][+build]；比较按规范优先级（正式版 > 预发布）。
const RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(v) {
  const m = RE.exec(String(v).trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] ?? null, build: m[5] ?? null };
}

export function isValidSemver(v) { return parseSemver(v) !== null; }

function comparePrerelease(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;   // 正式版 > 预发布
  if (b === null) return -1;
  const pa = a.split('.'), pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) { const n = Number(x) - Number(y); if (n !== 0) return n < 0 ? -1 : 1; }
    else if (xn) return -1;        // 数字标识 < 字母标识
    else if (yn) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

export function sortVersions(versions) {
  return [...versions].sort((a, b) => compareSemver(b, a)); // 降序：最新在前
}

export function latestVersion(versions) {
  return sortVersions(versions)[0] ?? null;
}
