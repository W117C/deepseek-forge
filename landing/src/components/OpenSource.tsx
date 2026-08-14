import { ArrowUpRight, BookOpen, Github } from 'lucide-react'
import type { ReactNode } from 'react'
import { DOCS_URL, GITHUB_URL } from '../config'
import Reveal from './Reveal'

const TREE: ReactNode[] = [
  <>
    <span className="t-dir">agenthub/</span> <span className="t-comment"># DeepSeek Forge repository</span>
  </>,
  <>
    <span className="t-tree">├─</span> <span className="t-dir">cli/</span>{' '}
    <span className="t-comment"># zero-dependency installer</span>
  </>,
  <>
    <span className="t-tree">│&nbsp;&nbsp;└─</span> <span className="t-file">agenthub.mjs</span>{' '}
    <span className="t-comment"># install · snapshot · rollback</span>
  </>,
  <>
    <span className="t-tree">├─</span> <span className="t-dir">bundles/</span>
  </>,
  <>
    <span className="t-tree">│&nbsp;&nbsp;├─</span> <span className="t-dir">finance-analyst/</span>{' '}
    <span className="t-comment"># bundle + preset + skills</span>
  </>,
  <>
    <span className="t-tree">│&nbsp;&nbsp;└─</span> <span className="t-dir">academic-researcher/</span>{' '}
    <span className="t-comment"># literature specialist</span>
  </>,
  <>
    <span className="t-tree">├─</span> <span className="t-dir">lib/</span>{' '}
    <span className="t-comment"># installer · security · registry</span>
  </>,
  <>
    <span className="t-tree">└─</span> <span className="t-dir">docs/</span>{' '}
    <span className="t-comment"># design + verification notes</span>
  </>,
]

const RUN: ReactNode[] = [
  <>
    <span className="t-accent">$</span> agenthub install finance-analyst --yes
  </>,
  <>
    <span className="t-ok">✓</span> <span className="t-comment">verified · scanned · snapshotted</span>
  </>,
  <>
    <span className="t-accent">$</span> dsh --profile finance
  </>,
  <>
    <span className="t-comment"># now it's a Finance Agent</span>
  </>,
]

export default function OpenSource() {
  return (
    <section className="section section--panel" id="open-source">
      <div className="container">
        <div className="oss-grid">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">Open Source</span>
              <h2 className="section-title">Built in the open.</h2>
              <p className="section-lede">
                DeepSeek Forge is designed as an open ecosystem for developers building on DeepSeek Harness.
                The CLI, the Bundles and the registry are developed in the open.
              </p>
            </div>
            <div className="oss-ctas">
              <a className="btn btn-primary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Github size={16} />
                View GitHub
              </a>
              <a className="btn btn-ghost" href={DOCS_URL} target="_blank" rel="noreferrer">
                <BookOpen size={16} />
                Read Documentation
                <ArrowUpRight size={14} />
              </a>
            </div>
          </Reveal>
          <Reveal delay={140} className="oss-code">
            <div className="panel code-window">
              <div className="code-window-bar">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="title">
                  <b>W117C/deepseek-forge</b> — repository
                </span>
              </div>
              <div className="code-body">
                {TREE.map((line, i) => (
                  <div className="code-line" key={i}>
                    {line}
                  </div>
                ))}
                <div className="code-divider" />
                {RUN.map((line, i) => (
                  <div className="code-line" key={i}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
