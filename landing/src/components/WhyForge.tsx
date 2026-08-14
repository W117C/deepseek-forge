import { Blocks, Compass, Globe, Recycle } from 'lucide-react'
import Reveal from './Reveal'

const FEATURES = [
  {
    num: '01',
    icon: Blocks,
    title: 'Composable',
    text: 'Combine capabilities instead of rebuilding Agents from scratch.',
  },
  {
    num: '02',
    icon: Recycle,
    title: 'Reusable',
    text: 'Install the same Agent architecture across projects, machines and teams.',
  },
  {
    num: '03',
    icon: Compass,
    title: 'Discoverable',
    text: 'Find complete Agent configurations instead of searching through hundreds of individual plugins.',
  },
  {
    num: '04',
    icon: Globe,
    title: 'Open',
    text: 'Designed as an independent community ecosystem for DeepSeek Harness.',
  },
]

export default function WhyForge() {
  return (
    <section className="section" id="about">
      <div className="container">
        <Reveal>
          <div className="section-head center">
            <span className="eyebrow">Why DeepSeek Forge?</span>
            <h2 className="section-title">Why DeepSeek Forge?</h2>
            <p className="section-lede">
              Four properties that turn a plugin repository into a real Agent ecosystem.
            </p>
          </div>
        </Reveal>
        <div className="why-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.num} delay={i * 70}>
              <div className="why-item">
                <div className="why-top">
                  <f.icon size={19} className="icon" />
                  <span className="why-num">{f.num}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
