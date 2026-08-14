import { Check, Info, ShieldCheck } from 'lucide-react'
import Reveal from './Reveal'

const PRINCIPLES = [
  'Verified Bundles',
  'Permission visibility',
  'Dependency transparency',
  'Security scanning',
  'Versioning',
  'Rollback',
]

const CHECKS = ['Verified', 'Dependencies visible', 'Permissions visible', 'Versioned', 'Community reviewed']

export default function Security() {
  return (
    <section className="section" id="security">
      <div className="container">
        <div className="security-grid">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">Security &amp; Trust</span>
              <h2 className="section-title">
                Built for an ecosystem.
                <br />
                Designed for trust.
              </h2>
              <p className="section-lede">
                Agent Bundles can contain code, plugins, tools and external integrations. DeepSeek Forge is
                designed around verification, transparency and reversibility — not blind trust.
              </p>
            </div>
            <div className="security-principles">
              {PRINCIPLES.map((p) => (
                <span className="chip" key={p}>
                  {p}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div className="panel security-check">
              <div className="security-check-head">
                <span className="icon">
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <h3>The Bundle trust model</h3>
                  <div className="sub">Designed for the ecosystem</div>
                </div>
              </div>
              <ul className="security-list">
                {CHECKS.map((c) => (
                  <li key={c}>
                    <Check size={16} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <p className="security-note">
            <Info size={14} />
            The local install loop already scans, verifies signatures and snapshots before any change.
            Registry-scale trust features are designed for the ecosystem and ship incrementally.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
