import { Bot, Network, Package, Puzzle, UserCog, Users } from 'lucide-react'
import { Fragment } from 'react'
import Reveal from './Reveal'

const NODES = [
  { icon: Puzzle, name: 'Plugins', sub: 'single capabilities' },
  { icon: Package, name: 'Bundles', sub: 'complete stacks' },
  { icon: UserCog, name: 'Profiles', sub: 'agent identities' },
  { icon: Bot, name: 'Agents', sub: 'domain specialists' },
  { icon: Users, name: 'Community', sub: 'shared building' },
  { icon: Network, name: 'Ecosystem', sub: 'an open registry' },
]

export default function Ecosystem() {
  return (
    <section className="section section--panel" id="ecosystem">
      <div className="container">
        <Reveal>
          <div className="section-head center">
            <span className="eyebrow">Ecosystem</span>
            <h2 className="section-title">An ecosystem, not another prompt library.</h2>
            <p className="section-lede">
              DeepSeek Forge is designed around reusable, composable Agent capabilities — from a single plugin
              to a community of specialists.
            </p>
          </div>
        </Reveal>
        <Reveal delay={140}>
          <div className="ecosystem-flow">
            {NODES.map((n, i) => (
              <Fragment key={n.name}>
                {i > 0 && (
                  <div className="eco-link" aria-hidden="true">
                    <div className="connector connector-h">
                      <span className="flow-dot" />
                    </div>
                    <div className="connector connector-v">
                      <span className="flow-dot" />
                    </div>
                  </div>
                )}
                <div className="eco-node">
                  <span className="orb">
                    <n.icon size={22} />
                  </span>
                  <span className="label">{n.name}</span>
                  <span className="sub">{n.sub}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
