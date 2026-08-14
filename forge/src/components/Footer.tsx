import { Link } from "react-router-dom";
import { ForgeIcon } from "./ForgeIcon";

export function Footer() {
  return (
    <footer className="footer">
      <div className="forge-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand">
              <ForgeIcon size={20} className="forge-mark" />
              <span className="brand-name">DeepSeek <span>Forge</span></span>
            </Link>
            <p>
              An independent community ecosystem for DeepSeek Harness.
              Discover what your DeepSeek Agent can become.
            </p>
          </div>

          <div className="footer-col">
            <h4>Marketplace</h4>
            <Link to="/explore">Explore</Link>
            <Link to="/agents">Agents</Link>
            <Link to="/bundles">Bundles</Link>
            <Link to="/plugins">Plugins</Link>
            <Link to="/skills">Skills</Link>
          </div>

          <div className="footer-col">
            <h4>Developers</h4>
            <Link to="/publish">Publish a Package</Link>
            <a href="https://github.com/W117C/deepseek-forge/tree/main/docs" target="_blank" rel="noopener noreferrer">Documentation</a>
            <a href="https://github.com/W117C/deepseek-forge/tree/main/cli" target="_blank" rel="noopener noreferrer">CLI Reference</a>
            <a href="https://github.com/W117C/deepseek-forge/blob/main/lib/registry-server.mjs" target="_blank" rel="noopener noreferrer">Registry API</a>
          </div>

          <div className="footer-col">
            <h4>Community</h4>
            <a href="https://github.com/W117C/deepseek-forge" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://github.com/W117C/deepseek-forge/discussions" target="_blank" rel="noopener noreferrer">Discussions</a>
            <a href="https://github.com/W117C/deepseek-forge/security/policy" target="_blank" rel="noopener noreferrer">Security Policy</a>
            <a href="https://github.com/W117C/deepseek-forge/issues" target="_blank" rel="noopener noreferrer">Report an Issue</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 DeepSeek Forge</span>
          <span>Independent community project</span>
          <span>Built for DeepSeek Harness</span>
          <span className="status">
            <span className="pulse" aria-hidden="true" />
            Registry: operational
          </span>
        </div>
      </div>
    </footer>
  );
}
