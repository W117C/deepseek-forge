import { ArrowRight, Hammer } from 'lucide-react'
import { GITHUB_URL } from '../config'
import Reveal from './Reveal'

export default function FinalCTA() {
  return (
    <section className="final-cta" id="get-started">
      <div className="glow" aria-hidden="true" />
      <div className="container inner">
        <Reveal>
          <h2 className="final-title">
            What will you
            <br />
            <span className="accent">forge?</span>
          </h2>
          <p className="final-sub">Turn your DeepSeek Harness into the Agent you actually need.</p>
          <div className="final-ctas">
            <a className="btn btn-primary" href="#bundles">
              Explore DeepSeek Forge
              <ArrowRight size={16} />
            </a>
            <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Hammer size={16} />
              Build a Bundle
            </a>
          </div>
          <p className="final-note">
            Built for DeepSeek Harness <span className="sep">·</span> Independent community project
          </p>
        </Reveal>
      </div>
    </section>
  )
}
