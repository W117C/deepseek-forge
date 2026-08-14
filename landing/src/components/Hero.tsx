import { ArrowRight, Github, Sparkle } from 'lucide-react'
import type { CSSProperties } from 'react'
import { GITHUB_URL } from '../config'
import HeroArchitecture from './HeroArchitecture'
import Reveal from './Reveal'

const PARTICLES: { top: string; left: string; delay: string; accent?: boolean }[] = [
  { top: '16%', left: '10%', delay: '0s' },
  { top: '30%', left: '86%', delay: '1.2s', accent: true },
  { top: '63%', left: '5%', delay: '2.1s', accent: true },
  { top: '78%', left: '44%', delay: '0.6s' },
  { top: '12%', left: '58%', delay: '2.8s' },
  { top: '86%', left: '91%', delay: '1.7s' },
]

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-grid-bg" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />
      <div className="particles" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className={'particle' + (p.accent ? ' accent' : '')}
            style={{ top: p.top, left: p.left, '--p-delay': p.delay } as CSSProperties}
          />
        ))}
      </div>
      <div className="container">
        <div className="hero-inner">
          <div className="hero-copy">
            <Reveal>
              <span className="hero-eyebrow">
                <Sparkle size={13} className="spark" />
                DeepSeek Harness Ecosystem
              </span>
              <h1 className="hero-title">
                Forge your
                <br />
                <span className="accent">DeepSeek Agent.</span>
              </h1>
              <p className="hero-subtitle">
                Turn DeepSeek Harness into a specialized AI Agent with ready-to-use Agent Bundles.
              </p>
              <p className="hero-supporting">
                Combine plugins, skills, tools, workflows and profiles without manually assembling everything
                from scratch.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary" href="#bundles">
                  Explore DeepSeek Forge
                  <ArrowRight size={16} />
                </a>
                <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Github size={16} />
                  View on GitHub
                </a>
              </div>
              <p className="hero-note">
                <span className="dot" />
                Built for DeepSeek Harness
                <span className="dot" />
                Independent community project
              </p>
            </Reveal>
          </div>
          <Reveal delay={140}>
            <HeroArchitecture />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
