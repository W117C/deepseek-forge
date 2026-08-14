import {
  BookOpen,
  Cpu,
  Gauge,
  LineChart,
  PieChart,
  Puzzle,
  RefreshCw,
  Scale,
  Search,
  Workflow,
  Wrench,
} from 'lucide-react'
import { ForgeMark } from './Logo'

const HARNESS_ROWS = [
  { icon: Cpu, label: 'Model' },
  { icon: Wrench, label: 'Tools' },
  { icon: RefreshCw, label: 'Agent Loop' },
]

const AGENT_ROWS = [
  { icon: Search, label: 'Research' },
  { icon: LineChart, label: 'Market Data' },
  { icon: Gauge, label: 'Risk Analysis' },
  { icon: Scale, label: 'Valuation' },
  { icon: PieChart, label: 'Portfolio' },
]

const BUNDLE_CHIPS = [
  { icon: Puzzle, label: 'Plugins' },
  { icon: BookOpen, label: 'Skills' },
  { icon: Wrench, label: 'Tools' },
  { icon: Workflow, label: 'Workflows' },
]

function ConnectorH() {
  return (
    <div className="connector connector-h" aria-hidden="true">
      <span className="flow-dot" />
    </div>
  )
}

function ConnectorV() {
  return (
    <div className="connector connector-v only-mobile" aria-hidden="true">
      <span className="flow-dot" />
    </div>
  )
}

/** Agent transformation visualization: Harness → Forge → Professional Agent. */
export default function HeroArchitecture() {
  return (
    <div
      className="hero-visual"
      role="img"
      aria-label="DeepSeek Harness becomes a Finance Analyst through DeepSeek Forge's Agent Bundle"
    >
      <figure className="fd-card">
        <div className="fd-card-head">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <div className="fd-card-title">DeepSeek Harness</div>
            <div className="fd-card-sub">general-purpose runtime</div>
          </div>
        </div>
        {HARNESS_ROWS.map((r) => (
          <div className="fd-row" key={r.label}>
            <r.icon />
            {r.label}
          </div>
        ))}
      </figure>

      <ConnectorH />
      <ConnectorV />

      <div className="fd-center">
        <span className="fd-forge-node">
          <ForgeMark size={14} />
          DeepSeek Forge
        </span>
        <span className="fd-mini-conn" aria-hidden="true" />
        <div className="fd-bundle-panel">
          <div className="fd-bundle-label">Agent Bundle</div>
          <div className="fd-bundle-grid">
            {BUNDLE_CHIPS.map((c) => (
              <span className="fd-bundle-chip" key={c.label}>
                <c.icon />
                <span>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <ConnectorH />
      <ConnectorV />

      <figure className="fd-card fd-card--agent">
        <div className="fd-card-head">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <div className="fd-card-title">Finance Analyst</div>
            <div className="fd-card-sub">profile: finance</div>
          </div>
        </div>
        {AGENT_ROWS.map((r) => (
          <div className="fd-row" key={r.label}>
            <r.icon />
            {r.label}
          </div>
        ))}
      </figure>

      <p className="hero-visual-caption">one install · one profile · one specialist</p>
    </div>
  )
}
