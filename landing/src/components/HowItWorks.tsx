import Reveal from './Reveal'

const STEPS = [
  {
    num: '01',
    title: 'Choose',
    text: 'Pick the professional Agent you need. Every Bundle describes its capabilities, profile and exactly what it changes.',
    code: null as string | null,
  },
  {
    num: '02',
    title: 'Install',
    text: 'Install one Bundle instead of assembling plugins, tools, skills and workflows manually.',
    code: 'agenthub install finance-analyst --yes',
  },
  {
    num: '03',
    title: 'Forge',
    text: 'Your DeepSeek Harness becomes a specialized Agent — same runtime, professional identity.',
    code: 'dsh --profile finance',
  },
]

export default function HowItWorks() {
  return (
    <section className="section section--panel" id="how">
      <div className="container">
        <Reveal>
          <div className="section-head center">
            <span className="eyebrow">How it works</span>
            <h2 className="section-title">From Harness to Specialist.</h2>
            <p className="section-lede">
              Three steps between a general-purpose runtime and a professional Agent.
            </p>
          </div>
        </Reveal>
        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 110}>
              <div className="step">
                <span className="step-num">{s.num}</span>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-text">{s.text}</p>
                {s.code && (
                  <span className="step-code">
                    <span className="p">$</span>
                    <span className="c">{s.code}</span>
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
