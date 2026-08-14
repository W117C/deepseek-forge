// Marketplace Web UI（M3 服务端渲染；无构建步骤，零依赖）。
// 本文件只用单引号字符串与单引号 HTML 属性，避免转义冲突。
const esc = (s) => String(s ?? '').split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
const SHELL_CSS = 'body{font-family:system-ui;background:#0b0d12;color:#e8eaf0;margin:0;padding:2rem;max-width:64rem;margin-inline:auto}a{color:#7ab8ff;text-decoration:none}code{background:#161a22;padding:.15rem .4rem;border-radius:4px;font-size:.78rem}.box{background:#12161f;border:1px solid #232936;border-radius:10px;padding:1rem;margin:1rem 0}.trust{color:#7ee2a0}.blocked{color:#ff7b7b}.community{color:#e2c07e}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2a2f3a;padding:.5rem;text-align:left}.small{color:#9aa3b2;font-size:.85rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:.8rem;margin-bottom:1.5rem}.card{background:#12161f;border:1px solid #232936;border-radius:10px;padding:.9rem}.cat{font-size:.7rem;color:#9aa3b2;text-transform:uppercase;letter-spacing:.05em}.meta{margin:.4rem 0;font-size:.8rem;color:#9aa3b2}input{padding:.5rem;width:min(24rem,80vw);background:#161a22;color:#e8eaf0;border:1px solid #2a2f3a;border-radius:6px}ul{line-height:1.8}';

export function renderHome(db) {
  const rank = (a) => {
    const rating = a.ratings?.count ? (a.ratings.sum / a.ratings.count) : 0;
    const trustBonus = a.trust === 'official' ? 50 : a.trust === 'verified' ? 30 : a.trust === 'community' ? 10 : 0;
    return Math.round((a.installs ?? 0) + rating * 20 + (a.score ?? 0) * 0.5 + trustBonus);
  };
  const agents = Object.values(db.agents).sort((x, y) => rank(y) - rank(x));
  const byCat = {};
  for (const a of agents) {
    const c = a.manifest?.category || '其他领域';
    (byCat[c] ??= []).push(a);
  }
  const sections = Object.entries(byCat).map(([cat, list]) => {
    const cards = list.map((a) => {
      const avg = a.ratings?.count ? (a.ratings.sum / a.ratings.count).toFixed(1) : null;
      return '<div class=card><div class=cat>' + esc(cat) + '</div><b><a href=/agents/' + esc(a.id) + '>' + esc(a.name) + '</a></b><p>' + esc(a.manifest?.description ?? '') + '</p>' +
        '<div class=meta><span class=trust>' + esc(a.trust) + '</span> 综合分 ' + rank(a) + ' · 安全分 ' + (a.score ?? '—') + ' · 安装 ' + (a.installs ?? 0) + (avg ? ' · ★ ' + avg : '') + '</div>' +
        '<code>agenthub install ' + esc(a.id) + ' --registry &lt;Registry 地址&gt; --yes</code></div>';
    }).join('');
    return '<h2>' + esc(cat) + '</h2><div class=grid>' + cards + '</div>';
  }).join('');
  const plugins = db.catalog.slice(0, 20).map((c) => '<li><code>' + esc(c.name) + '</code> — ' + esc((c.description || '').slice(0, 60)) + ' <span class=community>community</span></li>').join('');
  return '<!doctype html><html lang=zh><head><meta charset=utf-8><meta name=viewport content=width=device-width,initial-scale=1><title>AgentHub Marketplace</title><style>' + SHELL_CSS + '</style></head><body>' +
    '<h1>🧩 AgentHub Marketplace</h1><p>把 Harness 变成专业 Agent。选一个职业领域，装一个 Bundle。 <a href=/compose>🧬 组合 Agent</a></p>' +
    '<input id=q placeholder=搜索（finance / academic / …）><div id=hint style=margin-top:.5rem;color:#9aa3b2></div>' +
    sections +
    '<h2>社区插件（收录 ' + db.catalog.length + ' 个，展示前 20）</h2><ul>' + plugins + '</ul>' +
    '<script>const q=document.getElementById("q");q.addEventListener("input",async()=>{try{const j=await (await fetch("/v1/search?q="+encodeURIComponent(q.value))).json();document.getElementById("hint").textContent="命中 "+j.length+" 项："+j.map(x=>x.id||x.name).join("、");}catch(e){}});</script>' +
    '</body></html>';
}

export function renderDetail(db, id) {
  const a = db.agents[id];
  if (!a) return null;
  const m = a.manifest ?? {};
  const avg = a.ratings?.count ? (a.ratings.sum / a.ratings.count).toFixed(1) : null;
  const verRows = Object.values(a.versions).map((v) => '<tr><td>' + esc(v.version) + '</td><td>' + (v.scan?.score ?? '—') + '</td><td>' + esc(v.scan?.verdict ?? '') + '</td><td>' + esc(v.publishedAt ?? '') + '</td></tr>').join('');
  const skills = (m.components?.skills ?? []).map((s) => '<code>' + esc(s) + '</code>').join(' ');
  const presets = (m.components?.presets ?? []).map((p) => esc(p.id)).join('、');
  const bundles = (m.components?.bundles ?? []).map((b) => esc(b.package)).join('、');
  const net = (m.permissions?.network ?? []).join('、') || '无';
  const env = (m.permissions?.env ?? []).join('、') || '无';
  return '<!doctype html><html lang=zh><head><meta charset=utf-8><title>' + esc(a.name) + ' — AgentHub</title><style>' + SHELL_CSS + '</style></head><body>' +
    '<p class=small><a href=/>← 返回 Marketplace</a></p>' +
    '<h1>' + esc(a.name) + ' <span class=' + esc(a.trust) + '>' + esc(a.trust) + '</span></h1>' +
    '<p>' + esc(m.description ?? '') + '</p>' +
    '<div class=box><b>安装</b><br><code>agenthub install ' + esc(a.id) + ' --registry &lt;Registry 地址&gt; --yes</code><br><br><a href=/compose?ids=' + esc(a.id) + '>🧬 组合此 Agent</a>（与其他 Agent 并集成新 Bundle，本地签名发布）</div>' +
    '<div class=box><b>概览</b><p class=small>发布者 ' + esc(a.publisher ?? m.publisher?.id ?? '—') + ' · 最新 ' + esc(m.version ?? '—') + ' · 安装 ' + (a.installs ?? 0) + (avg ? ' · 评分 ★ ' + avg + '（' + a.ratings.count + ' 人）' : '') + ' · 安全分 ' + (a.score ?? '—') + '</p>' +
    '<p class=small>领域：' + esc(m.category ?? '—') + ' · 兼容 DSH ' + esc(m.compatibility?.dsh?.min ?? '—') + '+ · Node ' + esc(m.compatibility?.node ?? '—') + '</p>' +
    '<p class=small>网络权限：' + esc(net) + ' · 环境变量：' + esc(env) + '</p></div>' +
    '<div class=box><b>包含</b><p class=small>Bundles：' + (bundles || '—') + '<br>Presets：' + (presets || '—') + '<br>Skills：' + (skills || '—') + '</p></div>' +
    '<div class=box><b>版本</b><table><tr><th>版本</th><th>扫描分</th><th>判定</th><th>发布时间</th></tr>' + verRows + '</table></div>' +
    '<div class=box><b>评分</b><br><button onclick=rate(5)>★★★★★</button> <button onclick=rate(4)>★★★★</button> <button onclick=rate(3)>★★★</button><div id=rate-hint class=small></div></div>' +
    '<script>async function rate(s){try{const r=await fetch("/v1/agents/"+encodeURIComponent(' + JSON.stringify(a.id) + ')+"/ratings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({score:s})});const j=await r.json();document.getElementById("rate-hint").textContent="已提交：平均 ★ "+j.average.toFixed(1)+"（"+j.count+" 人）";}catch(e){document.getElementById("rate-hint").textContent="提交失败";}}</script>' +
    '</body></html>';
}

// Agent Builder 页面：勾选已发布 Agent → 服务端组合 → 下载 tgz（走既有签名/发布安全链）。
export function renderCompose(db, preselected = []) {
  const agents = Object.values(db.agents).filter((a) => a.trust !== 'blocked');
  const checkboxes = agents.map((a) => '<label style=display:block;margin:.3rem 0><input type=checkbox name=ids value=' + esc(a.id) + (preselected.includes(a.id) ? ' checked' : '') + '> ' + esc(a.name) + ' <span class=small>(' + esc(a.trust) + ' · 安全分 ' + (a.score ?? '—') + ' · ' + esc(a.manifest?.category ?? '') + ')</span></label>').join('');
  return '<!doctype html><html lang=zh><head><meta charset=utf-8><title>Agent Builder — AgentHub</title><style>' + SHELL_CSS + '</style></head><body>' +
    '<p class=small><a href=/>← 返回 Marketplace</a></p>' +
    '<h1>🧬 Agent Builder</h1>' +
    '<p>勾选两个或更多 Agent，组合它们的 Bundles / Presets / Skills / 权限并集，生成一个新的 Agent Bundle。</p>' +
    '<form method=POST action=/v1/compose class=box>' +
    '<b>领域模块（多选）</b><br>' + checkboxes +
    '<br><b>名称</b><br><input name=name placeholder=我的投资研究 Agent style=width:100%><br><br>' +
    '<b>领域</b> <input name=category placeholder=投资研究 Invest><br><br>' +
    '<b>发布者</b> <input name=publisher placeholder=my-org><br><br>' +
    '<button style=padding:.5rem 1.2rem;background:#2b6cf0;color:#fff;border:0;border-radius:6px>生成组合 Bundle</button>' +
    '</form>' +
    '<p class=small>生成结果下载后走 agenthub install 完整安全链（验签→扫描→信任门禁），或 agenthub publish 发布进审核队列。</p>' +
    '</body></html>';
}
