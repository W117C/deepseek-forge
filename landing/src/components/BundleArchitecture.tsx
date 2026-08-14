import type { CSSProperties } from 'react'
import Reveal from './Reveal'

const LAYERS = [
  { label: 'Plugin', items: ['Market Data', 'Web Search', 'GitHub', 'Browser'] },
  { label: 'Skills', items: ['Research', 'Analysis', 'Reasoning', 'Domain Knowledge'] },
  { label: 'Tools', items: ['Data', 'Search', 'Execution', 'Storage'] },
  { label: 'Workflows', items: ['Research', 'Analysis', 'Monitoring', 'Reporting'] },
  { label: 'Profile', items: ['Configuration', 'Identity', 'Runtime'] },
  { label: 'Agent', items: ['Finance Analyst'], agent: true },
]

interface DNodeProps {
  x: number
  y: number
  w: number
  h: number
  label: string
  variant?: 'plain' | 'accent' | 'endpoint'
}

function DNode({ x, y, w, h, label, variant = 'plain' }: DNodeProps) {
  const cx = x + w / 2
  const cy = y + h / 2
  const fill =
    variant === 'accent' ? 'rgba(77,107,254,0.12)' : variant === 'endpoint' ? 'rgba(77,107,254,0.08)' : '#0e0f11'
  const stroke =
    variant === 'accent'
      ? 'rgba(77,107,254,0.55)'
      : variant === 'endpoint'
        ? 'rgba(77,107,254,0.35)'
        : 'rgba(255,255,255,0.09)'
  const color = variant === 'accent' ? 'var(--accent-soft)' : variant === 'endpoint' ? 'var(--accent-bright)' : '#a1a1aa'
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1} />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fontWeight={variant === 'plain' ? 500 : 600}
        letterSpacing={1.6}
        fill={color}
      >
        {label}
      </text>
    </g>
  )
}

interface DotProps {
  x1: number
  y1: number
  x2: number
  y2: number
  dur: number
  delay: number
}

/** A small particle flowing along one straight edge of the diagram. */
function Dot({ x1, y1, x2, y2, dur, delay }: DotProps) {
  return (
    <circle
      className="flow-dot-svg"
      cx={x1}
      cy={y1}
      r={2.2}
      fill="var(--accent-soft)"
      style={
        {
          '--dx': x2 - x1 + 'px',
          '--dy': y2 - y1 + 'px',
          '--dur': dur + 's',
          '--delay': delay + 's',
          animationDelay: delay + 's',
        } as CSSProperties
      }
    />
  )
}

const EDGE = 'rgba(255,255,255,0.13)'

export default function BundleArchitecture() {
  return (
    <section className="section" id="anatomy">
      <div className="container">
        <Reveal>
          <div className="section-head center">
            <span className="eyebrow">What is a Bundle?</span>
            <h2 className="section-title">A Bundle is more than a plugin.</h2>
            <p className="section-lede">
              A professional Agent is rarely powered by a single plugin. DeepSeek Forge groups the complete
              capability stack into a reusable Bundle.
            </p>
          </div>
        </Reveal>
        <div className="anatomy-grid">
          <Reveal delay={80}>
            <div
              className="stack"
              role="img"
              aria-label="Bundle hierarchy: plugins, skills, tools, workflows and profile compose into the Finance Analyst agent"
            >
              {LAYERS.map((l) => (
                <div className={'stack-row' + (l.agent ? ' is-agent' : '')} key={l.label}>
                  <span className="stack-label">{l.label}</span>
                  <div className="stack-items">
                    {l.items.map((it) => (
                      <span className="chip" key={it}>
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="anatomy-diagram">
              <div className="glow" aria-hidden="true" />
              <svg
                viewBox="0 0 420 430"
                role="img"
                aria-label="Architecture flow: DeepSeek Harness feeds DeepSeek Forge, which distributes plugins, tools and skills up through workflows and profiles into the Agent"
              >
                {/* Edges */}
                <line x1={210} y1={356} x2={210} y2={324} stroke={EDGE} />
                <line x1={210} y1={286} x2={210} y2={268} stroke={EDGE} />
                <line x1={90} y1={268} x2={330} y2={268} stroke={EDGE} />
                <line x1={90} y1={268} x2={90} y2={250} stroke={EDGE} />
                <line x1={210} y1={268} x2={210} y2={250} stroke={EDGE} />
                <line x1={330} y1={268} x2={330} y2={250} stroke={EDGE} />
                <line x1={90} y1={216} x2={90} y2={196} stroke={EDGE} />
                <line x1={210} y1={216} x2={210} y2={196} stroke={EDGE} />
                <line x1={330} y1={216} x2={330} y2={196} stroke={EDGE} />
                <line x1={90} y1={196} x2={330} y2={196} stroke={EDGE} />
                <line x1={210} y1={196} x2={210} y2={178} stroke={EDGE} />
                <line x1={210} y1={144} x2={210} y2={116} stroke={EDGE} />
                <line x1={210} y1={82} x2={210} y2={54} stroke={EDGE} />

                {/* Nodes */}
                <DNode x={135} y={20} w={150} h={34} label="AGENT" variant="endpoint" />
                <DNode x={135} y={82} w={150} h={34} label="PROFILE" />
                <DNode x={135} y={144} w={150} h={34} label="WORKFLOWS" />
                <DNode x={30} y={216} w={120} h={34} label="SKILLS" />
                <DNode x={150} y={216} w={120} h={34} label="TOOLS" />
                <DNode x={270} y={216} w={120} h={34} label="PLUGINS" />
                <DNode x={135} y={286} w={150} h={38} label="DEEPSEEK FORGE" variant="accent" />
                <DNode x={135} y={356} w={150} h={38} label="DEEPSEEK HARNESS" />

                {/* Flowing dots (upward, subtle, staggered) */}
                <Dot x1={210} y1={352} x2={210} y2={328} dur={3.2} delay={0} />
                <Dot x1={210} y1={282} x2={210} y2={272} dur={3.2} delay={0.8} />
                <Dot x1={210} y1={268} x2={94} y2={268} dur={2.8} delay={0.2} />
                <Dot x1={210} y1={268} x2={326} y2={268} dur={2.8} delay={0.2} />
                <Dot x1={90} y1={264} x2={90} y2={254} dur={2.2} delay={1.0} />
                <Dot x1={210} y1={264} x2={210} y2={254} dur={2.2} delay={0.5} />
                <Dot x1={330} y1={264} x2={330} y2={254} dur={2.2} delay={1.0} />
                <Dot x1={90} y1={220} x2={90} y2={200} dur={2.2} delay={1.4} />
                <Dot x1={210} y1={220} x2={210} y2={200} dur={2.2} delay={0.9} />
                <Dot x1={330} y1={220} x2={330} y2={200} dur={2.2} delay={1.4} />
                <Dot x1={94} y1={196} x2={210} y2={196} dur={2.8} delay={0.3} />
                <Dot x1={326} y1={196} x2={210} y2={196} dur={2.8} delay={0.3} />
                <Dot x1={210} y1={192} x2={210} y2={182} dur={2.2} delay={1.6} />
                <Dot x1={210} y1={144} x2={210} y2={120} dur={3.0} delay={0.6} />
                <Dot x1={210} y1={82} x2={210} y2={58} dur={3.0} delay={1.1} />
              </svg>
            </div>
            <p className="diagram-caption">harness → forge → specialist</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
