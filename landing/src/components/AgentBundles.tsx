import { CandlestickChart, Check, Clock3, Copy, Info, Radar, ScrollText, Sigma, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import BundleCard from './BundleCard'
import type { Bundle } from './BundleCard'
import Reveal from './Reveal'

const BUNDLES: Bundle[] = [
  {
    id: 'finance-analyst',
    name: 'Finance Analyst',
    status: 'available',
    icon: CandlestickChart,
    description: 'Financial research, market intelligence and portfolio analysis.',
    capabilities: ['Market Data', 'Research', 'Risk', 'Valuation'],
    profile: 'finance',
    stack: [
      { k: 'Plugins', v: 'market-data · web-search · github · browser' },
      { k: 'Skills', v: 'financial-analysis · company-research' },
      { k: 'Tools', v: 'data access · search · execution' },
      { k: 'Workflows', v: 'research → analysis → report' },
      { k: 'Profile', v: 'finance — persona, toolset and runtime configuration' },
    ],
    command: 'agenthub install finance-analyst --yes',
    launch: 'dsh --profile finance',
    note: 'Ships today in the repository — the first complete Agent Bundle.',
  },
  {
    id: 'quant-researcher',
    name: 'Quant Researcher',
    status: 'soon',
    icon: Sigma,
    description: 'Factor research, backtesting and portfolio construction.',
    capabilities: ['Quant', 'Backtesting', 'Factors', 'Risk'],
    stack: [
      { k: 'Plugins', v: 'market-data · backtest-engine · storage' },
      { k: 'Skills', v: 'factor-research · portfolio-construction' },
      { k: 'Tools', v: 'data · simulation · execution' },
      { k: 'Workflows', v: 'factor → backtest → portfolio' },
      { k: 'Profile', v: 'quant — research environment configuration' },
    ],
    note: 'Planned for the registry.',
  },
  {
    id: 'academic-researcher',
    name: 'Academic Researcher',
    status: 'available',
    icon: ScrollText,
    description: 'Literature research, citation analysis and research workflows.',
    capabilities: ['Papers', 'Research', 'Citation', 'Analysis'],
    profile: 'research',
    stack: [
      { k: 'Plugins', v: 'papers · web-search · citations' },
      { k: 'Skills', v: 'literature-review · citation-analysis' },
      { k: 'Tools', v: 'search · synthesis · notes' },
      { k: 'Workflows', v: 'literature → notes → draft' },
      { k: 'Profile', v: 'research — persona, toolset and runtime configuration' },
    ],
    command: 'agenthub install academic-researcher --yes',
    launch: 'dsh --profile research',
    note: 'Ships today in the repository.',
  },
  {
    id: 'internet-intelligence',
    name: 'Internet Intelligence',
    status: 'soon',
    icon: Radar,
    description: 'Search, investigate, connect and synthesize information across the web.',
    capabilities: ['Search', 'News', 'Web', 'Intelligence'],
    stack: [
      { k: 'Plugins', v: 'web-search · news · browser' },
      { k: 'Skills', v: 'investigation · synthesis · sourcing' },
      { k: 'Tools', v: 'search · extract · connect' },
      { k: 'Workflows', v: 'search → verify → synthesize' },
      { k: 'Profile', v: 'intel — web-first agent configuration' },
    ],
    note: 'Planned for the registry.',
  },
]

export default function AgentBundles() {
  const [selected, setSelected] = useState<Bundle | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [selected])

  const copy = async () => {
    if (!selected?.command) return
    try {
      await navigator.clipboard.writeText(selected.command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="section" id="bundles">
      <div className="container">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Agent Bundles</span>
            <h2 className="section-title">
              From one Harness
              <br />
              to an entire ecosystem.
            </h2>
            <p className="section-lede">
              Every Bundle packages a complete professional Agent — capability stack, identity and runtime
              configuration. Install one, and your Harness becomes a specialist.
            </p>
          </div>
        </Reveal>
        <div className="bundles-grid">
          {BUNDLES.map((b, i) => (
            <Reveal key={b.id} delay={(i % 2) * 90}>
              <BundleCard bundle={b} onOpen={setSelected} />
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="bundles-note">
            <Info size={14} />
            Finance Analyst and Academic Researcher ship today in the repository. Quant Researcher and Internet
            Intelligence are coming soon.
          </p>
        </Reveal>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bundle-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" aria-label="Close dialog" onClick={() => setSelected(null)}>
              <X size={16} />
            </button>
            <div className="modal-head">
              <span className="icon">
                <selected.icon size={20} />
              </span>
              <div>
                <div className="title-row">
                  <h3 id="bundle-modal-title">{selected.name}</h3>
                  {selected.status === 'available' ? (
                    <span className="badge badge--ok">Available</span>
                  ) : (
                    <span className="badge">Coming soon</span>
                  )}
                </div>
                <p className="desc">{selected.description}</p>
              </div>
            </div>
            <div className="modal-body">
              <div className="modal-caps">
                {selected.capabilities.map((c) => (
                  <span className="chip" key={c}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="modal-section-label">What's inside the Bundle</div>
              <div className="modal-stack">
                {selected.stack.map((row) => (
                  <div className="modal-stack-row" key={row.k}>
                    <span className="k">{row.k}</span>
                    <span className="v">{row.v}</span>
                  </div>
                ))}
              </div>
              {selected.command ? (
                <>
                  <div className="modal-section-label">Install</div>
                  <div className="modal-command">
                    <span className="cmd">$ {selected.command}</span>
                    <button className="copy-btn" onClick={copy}>
                      {copied ? (
                        <>
                          <Check size={13} /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={13} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="modal-command then">
                    <span className="cmd">$ {selected.launch}</span>
                    <span className="hint">← now it's a {selected.name}</span>
                  </div>
                </>
              ) : (
                <div className="modal-soon">
                  <Clock3 size={15} />
                  {selected.note}
                </div>
              )}
              {selected.status === 'available' && (
                <div className="modal-soon solid">
                  <Info size={15} />
                  {selected.note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
