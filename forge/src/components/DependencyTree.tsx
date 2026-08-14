import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Agent } from "../types";
import { useApp } from "../context/app";

interface Group {
  id: string;
  label: string;
  children: { label: string; kind: string; link?: string }[];
}

export function DependencyTree({ agent }: { agent: Agent }) {
  const { allPackages } = useApp();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const linkFor = (kind: string, label: string): string | undefined => {
    if (kind === "plugin") {
      const p = allPackages.find((x) => x.type === "plugin" && x.name.toLowerCase() === label.toLowerCase());
      return p ? "/plugins/" + p.slug : undefined;
    }
    if (kind === "skill") {
      const s = allPackages.find((x) => x.type === "skill" && x.name.toLowerCase() === label.toLowerCase());
      return s ? "/skills/" + s.slug : undefined;
    }
    return undefined;
  };

  const groups: Group[] = [
    { id: "profile", label: "Profile", children: [{ label: agent.profile, kind: "profile" }] },
    { id: "workflows", label: "Workflows", children: agent.components.workflows.map((w) => ({ label: w, kind: "workflow" })) },
    { id: "skills", label: "Skills", children: agent.components.skills.map((s) => ({ label: s, kind: "skill", link: linkFor("skill", s) })) },
    { id: "plugins", label: "Plugins", children: agent.components.plugins.map((p) => ({ label: p, kind: "plugin", link: linkFor("plugin", p) })) },
  ];

  return (
    <div className="tree" role="tree" aria-label={"Dependency tree of " + agent.name}>
      <div className="tree-group">
        <div className="tree-group-head" role="treeitem" aria-expanded="true">
          <span className="pkg-icon pkg-icon--agent" style={{ width: 26, height: 26 }}><AgentGlyph /></span>
          <span>{agent.name}</span>
          <span className="g-type">Agent</span>
          <span className="g-count">v{agent.version}</span>
        </div>

        <div className="tree-children">
          {groups.map((g) => {
            const isCollapsed = collapsed[g.id] === true;
            return (
              <div key={g.id} className="tree-group">
                <button
                  className="tree-group-head"
                  role="treeitem"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !isCollapsed }))}
                >
                  <span className={"chev" + (isCollapsed ? "" : " open")}><ChevronRight size={13} /></span>
                  <span className="g-type">{g.label}</span>
                  <span className="g-count">{g.children.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="tree-children">
                    {g.children.map((c) => (
                      <div key={c.label} className="tree-leaf" role="treeitem">
                        <span className="l-type">{c.kind}</span>
                        {c.link ? (
                          <Link to={c.link}>{c.label} <span className="l-ext">→</span></Link>
                        ) : (
                          <span>{c.label}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="tree-leaf" style={{ marginTop: 6 }}>
            <span className="l-type">runtime</span>
            <span style={{ color: "var(--accent)" }}>DeepSeek Harness</span>
            <span className="l-ver">&gt;= 0.5.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <path d="M12 8V5M9 3h6M12 13v2" />
      <circle cx="9.5" cy="13" r="0.5" fill="currentColor" />
      <circle cx="14.5" cy="13" r="0.5" fill="currentColor" />
    </svg>
  );
}
