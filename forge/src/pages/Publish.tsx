import { useState } from "react";
import { Check, KeyRound, ShieldCheck, Terminal } from "lucide-react";
import { useApp } from "../context/app";
import { registerPublisher } from "../api";
import { copyText } from "../lib/hooks";

// v0.3：发布 = 本地私钥签名（CLI）→ Registry 验签/扫描/审核。
// 浏览器不接触私钥；本页引导完整 CLI 流程并可直接完成"发布者注册"（只上传公钥）。
export function PublishPage() {
  const { registryUrl } = useApp();
  const [publisher, setPublisher] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const base = registryUrl || "http://127.0.0.1:PORT";

  async function doRegister() {
    if (!publisher.trim() || !publicKey.trim()) { setError("填写 publisher id 与公钥（CLI keygen 输出）。"); return; }
    setBusy(true); setError(null);
    try {
      const res = await registerPublisher({ publisher: publisher.trim(), publicKey: publicKey.trim(), name: name.trim() || publisher.trim() });
      setToken(res.token);
      setRegistered(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const cmds = [
    { label: "生成发布者密钥（本地，私钥永不上传）", cmd: "node cli/agenthub.mjs keygen" },
    { label: "打包并签名发布（进入审核队列）", cmd: "node cli/agenthub.mjs publish ./your-agent --registry " + base + (token ? " --token " + token : "") },
    { label: "本地安装验证", cmd: "node cli/agenthub.mjs install ./your-agent --yes && dsh --profile your-agent" },
  ];

  return (
    <main>
      <section className="page-hero">
        <div className="forge-container">
          <span className="eyebrow">Developers</span>
          <h1>Publish a Package</h1>
          <p className="lead">
            真实发布流：CLI 本地签名 → Registry 验签 + 安全扫描 + 哈希 → 审核上架 → 出现在本市场。
            私钥永远留在你的机器上。
          </p>
        </div>
      </section>

      <div className="forge-container" style={{ maxWidth: 760, paddingBottom: 80 }}>
        {/* Step 1 */}
        <div className="wiz-card">
          <h2><Terminal size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />1. 准备 Agent 目录</h2>
          <p className="hint">按仓库 bundles/finance-analyst 的结构组织：agenthub.yaml + bundle + preset + skills。脚手架可生成模板。</p>
          <CodeLine label="生成脚手架" text="node cli/agenthub.mjs create My-Agent" onCopy={() => setCopied("s1")} copied={copied === "s1"} />
        </div>

        {/* Step 2 */}
        <div className="wiz-card">
          <h2><KeyRound size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />2. 注册发布者（只上传公钥）</h2>
          <p className="hint">先在本机运行 <code className="mono">node cli/agenthub.mjs keygen</code>，把输出的 PUBLIC KEY 粘贴到下面。</p>
          <div className="field">
            <label className="field-label" htmlFor="p-pub">Publisher ID</label>
            <input id="p-pub" className="input" value={publisher} placeholder="my-org" onChange={(e) => setPublisher(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-name">Display name（可选）</label>
            <input id="p-name" className="input" value={name} placeholder="My Org" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-key">Public Key</label>
            <textarea id="p-key" className="textarea" rows={5} value={publicKey} placeholder="-----BEGIN PUBLIC KEY-----…" onChange={(e) => setPublicKey(e.target.value)} />
          </div>
          {registered && token && (
            <div className="security-note" style={{ marginTop: 12 }}>
              ✓ 已注册。发布者令牌（仅显示一次，请保存）：<br />
              <code className="mono" style={{ wordBreak: "break-all" }}>{token}</code>
            </div>
          )}
          {registered && !token && <div className="security-note" style={{ marginTop: 12 }}>✓ 该发布者已注册，令牌沿用已有（本机 publisher.json）。</div>}
          {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={doRegister} disabled={busy}>{busy ? "注册中…" : "注册发布者"}</button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="wiz-card">
          <h2><ShieldCheck size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />3. 签名发布 → 扫描 → 审核</h2>
          <p className="hint">Registry 会验签 + 验哈希 + 解包静态扫描；非官方发布者进入审核队列，审批后上架。</p>
          {cmds.map((c) => <CodeLine key={c.cmd} label={c.label} text={c.cmd} onCopy={() => setCopied(c.cmd)} copied={copied === c.cmd} />)}
          <div className="security-note">
            <Check size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            上架后包会出现在本市场（状态 published / blocked 取决于服务端扫描）。
          </div>
        </div>
      </div>
    </main>
  );
}

function CodeLine({ label, text, onCopy, copied }: { label: string; text: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <div className="field-label">{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code className="mono" style={{ flex: 1, padding: "8px 10px", background: "var(--bg-soft)", borderRadius: 6, fontSize: 12.5, wordBreak: "break-all" }}>{text}</code>
        <button className="btn btn-ghost" onClick={() => { copyText(text); onCopy(); }}>{copied ? "已复制" : "复制"}</button>
      </div>
    </div>
  );
}
