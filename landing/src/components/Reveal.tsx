import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/** Fades content in + slides it up 16px when it enters the viewport. */
export default function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('rv-visible')
            io.disconnect()
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={'reveal ' + className}
      style={{ '--rv-delay': delay + 'ms' } as CSSProperties}
    >
      {children}
    </div>
  )
}
