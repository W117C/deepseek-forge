import { useState } from "react";

interface Node {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
}

const NODES: Node[] = [
  { id: "intelligence", name: "Intelligence", type: "OSINT", x: 380, y: 46 },
  { id: "finance", name: "Finance", type: "ANALYST", x: 148, y: 104 },
  { id: "coding", name: "Coding", type: "ENGINEER", x: 612, y: 104 },
  { id: "research", name: "Research", type: "ACADEMIC", x: 148, y: 236 },
  { id: "quant", name: "Quant", type: "RESEARCHER", x: 612, y: 236 },
];

const CORE = { x: 380, y: 168 };

const NODE_W = 128;
const NODE_H = 44;
const CORE_W = 208;
const CORE_H = 54;

export function HeroArchitecture() {
  const [hovered, setHovered] = useState<string | null>(null);

  const lines = NODES.map((n) => {
    const cx = n.x;
    const cy = n.y + NODE_H; // bottom center of satellite
    const tx = clamp(CORE.x, n.x - 40, n.x + 40);
    const ty = CORE.y - CORE_H / 2;
    return {
      id: n.id,
      d: "M " + cx + " " + cy + " C " + cx + " " + (cy + 26) + ", " + tx + " " + (ty - 26) + ", " + tx + " " + ty,
      dotX: tx,
      dotY: ty,
    };
  });

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  return (
    <svg viewBox="0 0 760 300" role="img" aria-label="One DeepSeek Harness runtime, five specialized capability nodes">
      {/* connections */}
      {lines.map((l) => {
        const lit = hovered === l.id || hovered === "core";
        return (
          <g key={l.id}>
            <path
              d={l.d}
              className={"arch-link animated" + (lit ? " lit" : "")}
              style={lit ? { strokeDasharray: "3 4", animation: "dashflow 5s linear infinite" } : undefined}
            />
            <circle
              cx={l.dotX}
              cy={l.dotY}
              r={3}
              className="arch-dot"
              style={lit ? { stroke: "var(--accent)", fill: "var(--accent)" } : undefined}
            />
          </g>
        );
      })}

      {/* core runtime */}
      <g
        className={"arch-node" + (hovered === "core" ? "" : "")}
        onMouseEnter={() => setHovered("core")}
        onMouseLeave={() => setHovered(null)}
        tabIndex={0}
        aria-label="DeepSeek Harness runtime"
      >
        <rect
          x={CORE.x - CORE_W / 2}
          y={CORE.y - CORE_H / 2}
          width={CORE_W}
          height={CORE_H}
          rx={7}
          className="n-box"
          style={{ stroke: "var(--accent-border)", fill: "var(--accent-soft)" }}
        />
        <circle cx={CORE.x - CORE_W / 2 + 18} cy={CORE.y} r={3} fill="var(--accent)" className="arch-status" />
        <text x={CORE.x} y={CORE.y - 6} textAnchor="middle" className="n-title">
          RUNTIME
        </text>
        <text x={CORE.x} y={CORE.y + 14} textAnchor="middle" className="n-text" style={{ fill: "var(--accent)", fontWeight: 600 }}>
          DEEPSEEK HARNESS
        </text>
      </g>

      {/* satellites */}
      {NODES.map((n) => {
        const lit = hovered === n.id;
        return (
          <g
            key={n.id}
            className="arch-node"
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            tabIndex={0}
            aria-label={n.name + " " + n.type}
          >
            <rect
              x={n.x - NODE_W / 2}
              y={n.y}
              width={NODE_W}
              height={NODE_H}
              rx={6}
              className="n-box"
              style={lit ? { stroke: "var(--accent)" } : undefined}
            />
            <text x={n.x} y={n.y + 19} textAnchor="middle" className="n-text" style={lit ? { fill: "var(--accent)" } : undefined}>
              {n.name}
            </text>
            <text x={n.x} y={n.y + 33} textAnchor="middle" className="n-title">
              {n.type}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
