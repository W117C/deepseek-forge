import { ArrowDown, Check, Cpu } from 'lucide-react'
import { Fragment } from 'react'
import { ForgeMark } from './Logo'
import Reveal from './Reveal'

const PIECES = ['Plugin', 'Skills', 'Tools', 'Agents', 'Workflows', 'Profile']

export default function Solution() {
  return (
    <section className="section section--panel" id="solution">
      <div className="container">
        <div className="solution-grid">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">The Solution</span>
              <h2 className="section-title">
                One Bundle.
                <br />
                One Agent.
              </h2>
              <p className="section-lede">
                DeepSeek Forge packages the pieces together. Instead of configuring everything manually: choose
                a professional Agent, install its Bundle, start working.
              </p>
            </div>
          </Reveal>
          <Reveal delay={130}>
            <div className="solution-visual" role="img" aria-label="Plugins, skills, tools, agents, workflows and profile converge into an Agent Bundle, which becomes a professional Agent">
              <div className="solution-pieces">
                {PIECES.map((p, i) => (
                  <Fragment key={p}>
                    {i > 0 && (
                      <span className="plus" aria-hidden="true">
                        +
                      </span>
                    )}
                    <span className="chip">{p}</span>
                  </Fragment>
                ))}
              </div>
              <ArrowDown size={18} className="solution-arrow" aria-hidden="true" />
              <div className="solution-bundle">
                <div className="left">
                  <span className="icon">
                    <ForgeMark size={20} />
                  </span>
                  <div>
                    <div className="name">AGENT BUNDLE</div>
                    <div className="meta">manifest · preset · skills · patch</div>
                  </div>
                </div>
                <Check size={18} color="var(--ok)" aria-hidden="true" />
              </div>
              <ArrowDown size={18} className="solution-arrow" aria-hidden="true" />
              <div className="solution-agent">
                <span className="icon">
                  <Cpu size={19} />
                </span>
                <div>
                  <div className="name">Professional Agent</div>
                  <div className="meta">Finance Analyst — persona · toolset · skills · profile</div>
                </div>
              </div>
              <p className="solution-command">
                <span className="prompt">$</span>
                <span className="cmd">agenthub install finance-analyst --yes</span>
                <span aria-hidden="true">→</span>
                <span className="prompt">$</span>
                <span className="cmd">dsh --profile finance</span>
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
