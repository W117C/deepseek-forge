import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpen, Boxes, Github, Puzzle, Wrench } from "lucide-react";
import { useApp } from "../context/app";
import { categories, cliCommands, popularSearches } from "../lib/site";
import { SearchBar } from "../components/SearchBar";
import { HeroArchitecture } from "../components/HeroArchitecture";
import { AgentCard } from "../components/cards/AgentCard";
import { BundleCard } from "../components/cards/BundleCard";
import { PluginCard } from "../components/cards/PluginCard";
import { SkillCard } from "../components/cards/SkillCard";
import { CategoryCard } from "../components/cards/CategoryCard";
import { TypeIcon } from "../components/icons";
import { formatDownloads, routeFor } from "../lib/registry";
import type { Agent } from "../types";

export function Home() {
  const { allPackages, loading, error, registryUrl } = useApp();
  const agents = allPackages.filter((p) => p.type === "agent") as Agent[];
  const bundles = allPackages.filter((p) => p.type === "bundle");
  const plugins = allPackages.filter((p) => p.type === "plugin");
  const skills = allPackages.filter((p) => p.type === "skill");
  const trendAgents = [...agents].sort((a, b) => b.downloads - a.downloads).slice(0, 5);

  return (
    <main>
      {/* ================= Hero ================= */}
      <section className="hero">
        <div className="forge-container hero-inner">
          <span className="eyebrow">DeepSeek Harness Marketplace</span>
          <h1 className="hero-title">
            Discover what your<br />
            DeepSeek Agent can <span className="accent">become</span>.
          </h1>
          <p className="hero-sub">
            Community-built Agents, Bundles, Plugins and Skills for DeepSeek Harness.
          </p>

          <SearchBar />

          <div className="popular-searches">
            <span className="label">Popular</span>
            {popularSearches.map((s) => (
              <Link key={s} to={"/search?q=" + encodeURIComponent(s)}>{s}</Link>
            ))}
          </div>

          <div className="arch-wrap" style={{ maxWidth: 860 }}>
            <HeroArchitecture />
            <p className="mono" style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, paddingBottom: 8 }}>
              ONE RUNTIME · MANY POSSIBILITIES
            </p>
          </div>
        </div>
      </section>

      {/* ================= Registry 状态 ================= */}
      {error && (
        <section className="section">
          <div className="forge-container">
            <div className="wiz-card" style={{ textAlign: "center" }}>
              <p className="sub">无法连接 Registry（{registryUrl || "同源 /v1"}）。</p>
              <p className="field-hint">启动 Registry 后访问：node cli/agenthub.mjs registry ./.reg，或通过 <code className="mono">?registry=https://…</code> 指定地址。</p>
            </div>
          </div>
        </section>
      )}

      {/* ================= Featured Agents ================= */}
      <section className="section">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Agents</span>
              <h2 className="section-title">Featured Agents</h2>
              <p className="sub">Specialized Agents built on DeepSeek Harness.</p>
            </div>
            <Link to="/agents" className="section-head-link">All Agents <ArrowRight size={14} /></Link>
          </div>
          <div className="grid-cards">
            {loading ? <p className="sub">Loading from Registry…</p> : agents.slice(0, 4).map((a) => <AgentCard key={a.id} agent={a} />)}
            {!loading && agents.length === 0 && !error && <p className="sub">暂无 Agent——用 CLI 发布第一个：<code className="mono">node cli/agenthub.mjs publish ./your-agent --registry {registryUrl}</code></p>}
          </div>
        </div>
      </section>

      {/* ================= Trending ================= */}
      <section className="section--alt section--tight">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Movement</span>
              <h2 className="section-title">Most installed</h2>
              <p className="sub">Real install counts from the registry.</p>
            </div>
          </div>
          <div className="trend-list">
            {trendAgents.map((agent, i) => (
              <Link to={routeFor(agent)} key={agent.id} className="trend-row">
                <span className="trend-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="pkg-icon pkg-icon--agent" style={{ width: 32, height: 32 }}>
                  <TypeIcon type="agent" size={15} />
                </span>
                <span className="trend-name">{agent.name}</span>
                <span className="trend-type">Agent</span>
                <span className="trend-growth"><ArrowUpRight size={13} /> {formatDownloads(agent.downloads)} installs</span>
                <span className="meta">{agent.version}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Featured Bundles ================= */}
      <section className="section">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Bundles</span>
              <h2 className="section-title">Featured Bundles</h2>
              <p className="sub">Complete capability stacks for DeepSeek Harness.</p>
            </div>
            <Link to="/bundles" className="section-head-link">All Bundles <ArrowRight size={14} /></Link>
          </div>
          <div className="grid-cards grid-cards--2">
            {!loading && bundles.length === 0 && !error && <p className="sub">暂无 Bundle。</p>}
            {bundles.slice(0, 2).map((b) => <BundleCard key={b.id} bundle={b} />)}
          </div>
        </div>
      </section>

      {/* ================= Categories ================= */}
      <section className="section--alt section--tight">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Capabilities</span>
              <h2 className="section-title">Explore by capability</h2>
              <p className="sub">Start from the outcome you want, not the components.</p>
            </div>
            <Link to="/explore" className="section-head-link">Explore all <ArrowRight size={14} /></Link>
          </div>
          <div className="grid-cats">
            {categories.map((c) => <CategoryCard key={c.slug} category={c} />)}
          </div>
        </div>
      </section>

      {/* ================= Popular Plugins ================= */}
      <section className="section">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Plugins</span>
              <h2 className="section-title">Popular Plugins</h2>
              <p className="sub">Capability extensions for DeepSeek Harness.</p>
            </div>
            <Link to="/plugins" className="section-head-link">All Plugins <ArrowRight size={14} /></Link>
          </div>
          <div className="grid-cards grid-cards--4">
            {!loading && plugins.length === 0 && !error && <p className="sub">暂无 Plugin。</p>}
            {plugins.slice(0, 4).map((p) => <PluginCard key={p.id} plugin={p} />)}
          </div>
        </div>
      </section>

      {/* ================= Popular Skills ================= */}
      <section className="section--alt section--tight">
        <div className="forge-container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Skills</span>
              <h2 className="section-title">Popular Skills</h2>
              <p className="sub">Reusable capabilities for your Agents.</p>
            </div>
            <Link to="/skills" className="section-head-link">All Skills <ArrowRight size={14} /></Link>
          </div>
          <div className="grid-cards grid-cards--4">
            {!loading && skills.length === 0 && !error && <p className="sub">暂无 Skill。</p>}
            {skills.slice(0, 4).map((s) => <SkillCard key={s.id} skill={s} />)}
          </div>
        </div>
      </section>

      {/* ================= CLI ecosystem ================= */}
      <section className="section">
        <div className="forge-container cli-strip">
          <div>
            <span className="eyebrow">One ecosystem</span>
            <h3>Marketplace and CLI.<br />Same registry.</h3>
            <p>
              Everything you install here is installed through the Forge CLI into DeepSeek Harness.
              Browse visually, or stay in the terminal — both talk to the same registry.
            </p>
            <div className="pkg-tags" style={{ marginTop: 20, marginBottom: 0 }}>
              <span className="chip">forge install finance-analyst</span>
              <span className="chip">forge search finance</span>
              <span className="chip">forge list</span>
              <span className="chip">forge update</span>
            </div>
          </div>
          <div className="terminal">
            <div className="terminal-head">
              <span className="dot" /><span className="dot" /><span className="dot" />
              <span className="terminal-title">forge — DeepSeek Harness CLI</span>
            </div>
            <div className="terminal-body">
              {cliCommands.map((c) => (
                <div key={c.cmd} className="term-line">
                  <span className="term-prompt">$</span>
                  <span className="term-cmd">{c.cmd}</span>
                  <span className="term-dim">{c.hint}</span>
                </div>
              ))}
              <span className="term-cursor" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* ================= Developer CTA ================= */}
      <section className="dev-cta">
        <div className="forge-container">
          <span className="eyebrow">For developers</span>
          <h2>Build the next Agent.</h2>
          <p>
            Package your skills, plugins and workflows as a complete Agent.
            Publish to the registry and let the community discover it.
          </p>
          <div className="dev-points">
            <span className="dev-point"><TypeIcon type="agent" size={14} /> Agents</span>
            <span className="dev-point"><Boxes size={14} /> Bundles</span>
            <span className="dev-point"><Puzzle size={14} /> Plugins</span>
            <span className="dev-point"><Wrench size={14} /> Skills</span>
          </div>
          <div className="btn-row">
            <Link to="/publish" className="btn btn-primary btn-lg">Publish a Package</Link>
            <a className="btn btn-outline btn-lg" href="https://github.com/W117C/deepseek-forge/tree/main/docs" target="_blank" rel="noopener noreferrer">
              <BookOpen size={15} /> Read Documentation
            </a>
            <a className="btn btn-ghost btn-lg" href="https://github.com/W117C/deepseek-forge" target="_blank" rel="noopener noreferrer">
              <Github size={15} /> GitHub
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
