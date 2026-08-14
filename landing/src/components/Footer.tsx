import { ArrowUpRight, Github, MessageCircle } from 'lucide-react'
import { DOCS_URL, GITHUB_URL } from '../config'
import { ForgeMark } from './Logo'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#top" aria-label="DeepSeek Forge — back to top">
              <ForgeMark size={24} />
              DeepSeek Forge
            </a>
            <p className="tagline">Forge your DeepSeek Agent.</p>
            <span className="status">
              <span className="dot" />
              independent community project
            </span>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li>
                <a href="#about">About</a>
              </li>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#bundles">Bundles</a>
              </li>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub
                  <ArrowUpRight size={13} />
                </a>
              </li>
              <li>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">
                  Documentation
                  <ArrowUpRight size={13} />
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Community</h4>
            <ul>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Github size={13} />
                  GitHub
                </a>
              </li>
              <li>
                <a href="#">
                  <MessageCircle size={13} />
                  Discord
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <ul>
              <li>
                <a href="#">Privacy</a>
              </li>
              <li>
                <a href="#">Terms</a>
              </li>
              <li>
                <a href="#security">Security</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>An independent community project built for DeepSeek Harness.</span>
          <span className="mono">© 2025 DeepSeek Forge</span>
        </div>
      </div>
    </footer>
  )
}
