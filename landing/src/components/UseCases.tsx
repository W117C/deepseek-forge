import { BookOpen, Landmark, Radar, Sigma, Workflow } from 'lucide-react'
import Reveal from './Reveal'

const CASES = [
  { icon: Landmark, name: 'Finance', line: 'Turn DeepSeek into a financial research analyst.' },
  { icon: BookOpen, name: 'Research', line: 'Turn DeepSeek into a literature research assistant.' },
  { icon: Sigma, name: 'Quant', line: 'Turn DeepSeek into a quantitative research environment.' },
  { icon: Radar, name: 'Intelligence', line: 'Turn DeepSeek into an Internet intelligence agent.' },
  { icon: Workflow, name: 'Automation', line: 'Turn DeepSeek into a workflow-driven operator.' },
]

export default function UseCases() {
  return (
    <section className="section" id="use-cases">
      <div className="container">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Use Cases</span>
            <h2 className="section-title">Built for the way you work.</h2>
            <p className="section-lede">
              One Harness. Any specialist you need — the domain changes, the runtime doesn't.
            </p>
          </div>
        </Reveal>
        <div className="usecases-grid">
          {CASES.map((c, i) => (
            <Reveal key={c.name} delay={i * 60}>
              <div className="usecase">
                <c.icon size={19} className="icon" />
                <span className="name">{c.name}</span>
                <span className="line">{c.line}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
