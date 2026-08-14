import { useEffect, useState } from 'react'
import { Github, Menu, X } from 'lucide-react'
import { GITHUB_URL, MARKETPLACE_URL } from '../config'
import { ForgeMark } from './Logo'

const LINKS = [
  { label: 'About', href: '#about' },
  { label: 'How it works', href: '#how' },
  { label: 'Bundles', href: '#bundles' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) setOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <>
      <header className={'header' + (scrolled ? ' scrolled' : '')}>
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label="DeepSeek Forge — home">
            <ForgeMark size={26} />
            DeepSeek Forge
          </a>
          <nav className="nav" aria-label="Main navigation">
            {LINKS.map((l) => (
              <a key={l.href} className="nav-link" href={l.href}>
                {l.label}
              </a>
            ))}
            <a className="nav-link" href={MARKETPLACE_URL}>
              Marketplace
            </a>
            <a className="nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
              <Github size={14} />
            </a>
          </nav>
          <div className="header-actions">
            <a className="btn btn-primary btn-sm" href="#bundles">
              Get Started
            </a>
            <button
              className="header-menu-btn"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>
      <div className={'mobile-menu' + (open ? ' open' : '')}>
        {LINKS.map((l) => (
          <a key={l.href} className="nav-link" href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <a className="nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub
          <Github size={14} />
        </a>
        <a className="btn btn-primary" href="#bundles" onClick={() => setOpen(false)}>
          Get Started
        </a>
      </div>
    </>
  )
}
