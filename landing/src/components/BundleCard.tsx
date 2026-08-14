import type { LucideIcon } from 'lucide-react'

export type BundleStatus = 'available' | 'soon'

export interface Bundle {
  id: string
  name: string
  status: BundleStatus
  icon: LucideIcon
  description: string
  capabilities: string[]
  profile?: string
  stack: { k: string; v: string }[]
  command?: string
  launch?: string
  note: string
}

export default function BundleCard({ bundle, onOpen }: { bundle: Bundle; onOpen: (b: Bundle) => void }) {
  return (
    <article
      className="bundle-card"
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={bundle.name + ' — open details'}
      onClick={() => onOpen(bundle)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(bundle)
        }
      }}
    >
      <div className="bundle-card-top">
        <span className="bundle-icon">
          <bundle.icon size={20} />
        </span>
        {bundle.status === 'available' ? (
          <span className="badge badge--ok">Available</span>
        ) : (
          <span className="badge">Coming soon</span>
        )}
      </div>
      <h3 className="bundle-name">{bundle.name}</h3>
      <p className="bundle-desc">{bundle.description}</p>
      <div className="bundle-caps">
        {bundle.capabilities.map((c) => (
          <span className="chip" key={c}>
            {c}
          </span>
        ))}
      </div>
      <div className="bundle-arch" aria-hidden="true">
        <span className="trace">
          <span className="t">Plugin</span>
          <span className="arrow">→</span>
          <span className="t">Bundle</span>
          <span className="arrow">→</span>
          <span className="t">Agent</span>
        </span>
        {bundle.profile && <span className="badge">profile: {bundle.profile}</span>}
      </div>
    </article>
  )
}
