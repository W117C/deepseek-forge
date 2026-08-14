import { AlertTriangle, BookOpen, FileText, Puzzle, Settings2, UserRound, Workflow, Wrench } from 'lucide-react'
import { Fragment } from 'react'
import Reveal from './Reveal'

const FRAGMENTS = [
  { icon: Puzzle, label: 'Plugin' },
  { icon: Wrench, label: 'Tool' },
  { icon: BookOpen, label: 'Skill' },
  { icon: Workflow, label: 'Workflow' },
  { icon: Settings2, label: 'Config' },
  { icon: FileText, label: 'Prompt' },
  { icon: UserRound, label: 'Profile' },
]

export default function Problem() {
  return (
    <section className="section" id="problem">
      <div className="container">
        <div className="problem-grid">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">The Problem</span>
              <h2 className="section-title">
                Powerful by default.
                <br />
                Specialized by choice.
              </h2>
              <p className="section-lede">
                DeepSeek Harness gives developers a powerful general-purpose Agent runtime. But building a
                specialized Agent still means assembling plugins, tools, skills, workflows and configuration —
                manually, every single time.
              </p>
            </div>
          </Reveal>
          <Reveal delay={130}>
            <div
              className="fragments"
              role="img"
              aria-label="Seven manual pieces — plugin, tool, skill, workflow, config, prompt, profile — collapse into complexity"
            >
              {FRAGMENTS.map((f, i) => (
                <Fragment key={f.label}>
                  {i > 0 && (
                    <span className="frag-plus" aria-hidden="true">
                      +
                    </span>
                  )}
                  <span className="fragment">
                    <f.icon />
                    {f.label}
                  </span>
                </Fragment>
              ))}
              <span className="frag-strike" aria-hidden="true" />
              <span className="frag-result">
                <AlertTriangle size={13} />
                Complexity
              </span>
            </div>
            <p className="frag-caption">Seven moving pieces. One manual process.</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
