# DeepSeek Forge — Marketplace

> Discover what your DeepSeek Agent can become.

DeepSeek Forge is an **independent community ecosystem** for DeepSeek Harness.
This repository contains the Marketplace frontend prototype: a production-quality,
fully interactive React application for discovering Agents, Bundles, Plugins and Skills.

Built for DeepSeek Harness. Independent community project. Not affiliated with DeepSeek.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build
npm run preview   # serve the production build
```

## Stack

- **React 18 + TypeScript + Vite** — no backend, no database, no heavy UI libraries
- **React Router** with lazy routes
- **Plain CSS** design system (tokens in `src/styles/tokens.css`) — no Tailwind
- **Inter + JetBrains Mono** (self-hosted via Fontsource)
- **lucide-react** for monochrome icons, hand-built SVG for the Forge mark and architecture diagrams

## Product concept

```
DeepSeek Harness
      ↓
Plugins + Skills + Tools + Workflows + Profiles
      ↓
Agent Bundles
      ↓
Specialized Agents
```

Users start from an outcome ("I want DeepSeek to analyze stocks") and find
Finance Analyst — never from a list of plugins.

## Routes

| Route | Page |
| --- | --- |
| `/` | Marketplace home: hero search, architecture visual, featured Agents/Bundles, trending, categories, popular Plugins/Skills, CLI section, developer CTA |
| `/explore` | All packages with type/category/trust filters, sort, grid/list views |
| `/search?q=…` | Search results with tabs and match highlighting |
| `/agents` · `/bundles` · `/plugins` · `/skills` | Per-type listings |
| `/agents/:slug` | Agent detail: overview, capabilities, prompts, dependency tree, hoverable architecture, security, versions, reviews, install |
| `/bundles/:slug` | Bundle detail: architecture, components, security |
| `/plugins/:slug` | Plugin detail: configuration, dependencies, permissions |
| `/skills/:slug` | Skill detail: inputs/process/outputs, example prompts |
| `/publish` | 7-step publish wizard (frontend simulation) |

## Key interactions

- **⌘K / Ctrl+K** — global command palette (grouped results, keyboard navigation)
- **Install** — every package opens an install modal: version, compatibility, dependencies,
  permissions → terminal simulation → CLI command copy
- **Filters** — URL-synced (back/forward works), mobile bottom drawer
- **Architecture diagrams** — hover components to highlight connections
- **Publish** — full mock flow: type → information → dependencies → permissions →
  security scan → preview → publish; published packages appear across the marketplace
- **Dark mode** — toggle in the header, persisted, respects system preference
- **States** — skeletons, empty states, error states, 404

## Design system

Minimal · technical · editorial. Monochrome UI, thin borders, strict 12-column grid,
large type, small monospace labels, and a single DeepSeek-inspired blue reserved for
actions, links and verified states. Radius is restrained (4–8px); animation is subtle
(150–400ms) and disabled under `prefers-reduced-motion`.

## Screenshots

`shots/` contains captured pages: home (light/dark), Agent detail, Bundle detail,
Plugin detail, Skill detail, Explore and Publish.
