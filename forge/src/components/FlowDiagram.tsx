import { useState } from "react";

export interface DiagramBox {
  id: string;
  label: string; // small uppercase caption
  text: string; // main label
  accent?: boolean;
}

export interface DiagramRow {
  boxes: DiagramBox[];
  bar?: { text: string; label: string }; // full-width runtime bar
}

interface LinkSpec { from: string; to: string; d: string }

const BOX_W = 150;
const BOX_H = 46;
const GAP = 26;
const ROW_GAP = 64;
const PAD = 30;

export function FlowDiagram({ rows, title }: { rows: DiagramRow[]; title?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Drop rows that have no content so empty published packages still render.
  rows = rows.filter((r) => r.bar || r.boxes.length > 0);

  // Layout computation
  let maxRowW = 0;
  for (const row of rows) {
    if (row.bar) { maxRowW = Math.max(maxRowW, 620); continue; }
    const n = row.boxes.length;
    const bw = n > 4 ? 104 : BOX_W;
    const w = n * bw + (n - 1) * GAP;
    maxRowW = Math.max(maxRowW, w);
  }
  const width = Math.max(420, maxRowW + PAD * 2);

  const yStarts: number[] = [];
  let y = PAD;
  for (let i = 0; i < rows.length; i++) {
    yStarts.push(y);
    y += BOX_H + ROW_GAP;
  }
  const height = y - ROW_GAP + PAD;

  const boxCoords: { id: string; x: number; y: number; w: number; label: string; text: string; accent?: boolean; row: number }[] = [];
  const barCoords: { x: number; y: number; w: number; h: number; text: string; label: string }[] = [];
  const links: LinkSpec[] = [];
  const spineX: { row: number; x1: number; x2: number; y: number }[] = [];

  rows.forEach((row, ri) => {
    if (row.bar) {
      const w = Math.min(640, width - PAD * 2);
      barCoords.push({ x: (width - w) / 2, y: yStarts[ri], w, h: BOX_H, text: row.bar.text, label: row.bar.label });
      const spineY = yStarts[ri] + BOX_H / 2;
      const x1 = (width - w) / 2;
      const x2 = (width - w) / 2 + w;
      spineX.push({ row: ri, x1, x2, y: spineY });
      // link from previous row
      if (ri > 0) {
        const prevY = yStarts[ri - 1] + BOX_H;
        const midY = (prevY + yStarts[ri]) / 2;
        const d = "M " + width / 2 + " " + prevY + " V " + midY + " V " + yStarts[ri];
        links.push({ from: "s" + (ri - 1), to: "s" + ri, d });
      }
      return;
    }

    const n = row.boxes.length;
    const bw = n > 4 ? 104 : BOX_W;
    const totalW = n * bw + (n - 1) * GAP;
    const x0 = (width - totalW) / 2;
    const y0 = yStarts[ri];
    row.boxes.forEach((b, bi) => {
      boxCoords.push({ id: b.id, x: x0 + bi * (bw + GAP), y: y0, w: bw, label: b.label, text: b.text, accent: b.accent, row: ri });
    });
    spineX.push({ row: ri, x1: x0 + bw / 2, x2: x0 + totalW - bw / 2, y: y0 + BOX_H / 2 });

    // link from previous row to this row's spine
    if (ri > 0) {
      const prevRow = spineX[ri - 1];
      const prevY = yStarts[ri - 1] + BOX_H;
      const spineY = yStarts[ri] - ROW_GAP / 2;
      const midY = (prevY + yStarts[ri]) / 2;
      if (prevRow.x1 === prevRow.x2) {
        links.push({ from: "s" + (ri - 1), to: "s" + ri, d: "M " + prevRow.x1 + " " + prevY + " V " + yStarts[ri] });
      } else {
        const d = "M " + width / 2 + " " + prevY + " V " + midY + " V " + spineY + " H " + (n === 1 ? x0 + bw / 2 : x0 + totalW / 2);
        links.push({ from: "s" + (ri - 1), to: "s" + ri, d });
      }
      // stubs from spine to each box
      row.boxes.forEach((_, bi) => {
        const cx = x0 + bi * (bw + GAP) + bw / 2;
        links.push({ from: "s" + ri, to: row.boxes[bi].id, d: "M " + cx + " " + spineY + " V " + yStarts[ri] });
      });
    }
  });

  function lit(id: string): boolean {
    return hovered !== null && (id === hovered);
  }
  function linkLit(l: LinkSpec): boolean {
    return hovered !== null && (l.from === hovered || l.to === hovered);
  }

  return (
    <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label={title ?? "Architecture diagram"}>
      {title && <title>{title}</title>}

      {links.map((l, i) => (
        <path
          key={i}
          d={l.d}
          className={"arch-link animated" + (linkLit(l) ? " lit" : "")}
          style={linkLit(l) ? { strokeDasharray: "3 4", animation: "dashflow 6s linear infinite" } : undefined}
        />
      ))}

      {boxCoords.map((b) => {
        const isLit = lit(b.id) || lit("s" + b.row);
        return (
          <g
            key={b.id}
            className="arch-node"
            onMouseEnter={() => setHovered(b.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(b.id)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            aria-label={b.label + ": " + b.text}
          >
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={BOX_H}
              rx={6}
              className={"n-box" + (b.accent ? "" : "")}
              style={b.accent ? { stroke: "var(--accent-border)", fill: "var(--accent-soft)" } : isLit ? { stroke: "var(--accent)" } : undefined}
            />
            <text x={b.x + b.w / 2} y={b.y + 19} textAnchor="middle" className="n-title">
              {b.label}
            </text>
            <text
              x={b.x + b.w / 2}
              y={b.y + 34}
              textAnchor="middle"
              className="n-text"
              style={b.accent ? { fill: "var(--accent)", fontWeight: 600 } : isLit ? { fill: "var(--accent)" } : undefined}
            >
              {trunc(b.text, b.w > 130 ? 21 : 15)}
            </text>
          </g>
        );
      })}

      {barCoords.map((b, i) => {
        return (
          <g key={"bar" + i} className="arch-node arch-node--runtime" tabIndex={0} aria-label={b.text}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} className="n-box" />
            <circle cx={b.x + 16} cy={b.y + b.h / 2} r={3} className="arch-status" fill="var(--accent)" />
            <text x={b.x + b.w / 2} y={b.y + 19} textAnchor="middle" className="n-title" style={{ fill: "rgba(255,255,255,0.55)" }}>
              {b.label}
            </text>
            <text x={b.x + b.w / 2} y={b.y + 34} textAnchor="middle" className="n-text">
              {b.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
