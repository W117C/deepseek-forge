# DeepSeek Forge — Landing Page

Premium product landing page for **DeepSeek Forge** — the showcase site for the
[agenthub](../README.md) project (DeepSeek Harness Agent Bundle ecosystem).

> DeepSeek Forge is an **independent community project** built for DeepSeek Harness.
> It is not affiliated with or endorsed by DeepSeek.

## Stack

- **React 18 + TypeScript + Vite** — no Tailwind, no component library
- **Vanilla CSS** with design tokens (`src/styles/variables.css`) — dark, minimal, Linear/Vercel-style
- **Lucide Icons** + self-hosted **Inter Variable** / **JetBrains Mono Variable** (offline-friendly)
- Reveal-on-scroll via IntersectionObserver, `prefers-reduced-motion` respected everywhere

## Commands

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm run preview    # serve dist/ locally
node scripts/shots.mjs   # regenerate preview screenshots (needs Chrome + running preview)
```

## Structure

```
src/
  components/   Header · Hero · HeroArchitecture · Problem · Solution ·
                AgentBundles + BundleCard (modal) · HowItWorks ·
                BundleArchitecture (SVG stack diagram) · UseCases ·
                Ecosystem · WhyForge · Security · OpenSource ·
                FinalCTA · Footer · Reveal · Logo
  pages/Home.tsx
  styles/       variables.css · globals.css
shots/          desktop / tablet / mobile preview PNGs
```

## Deployment

独立 Vercel 项目（framework: **Vite**, root directory: **landing**）——
线上：https://deepseek-forge.vercel.app（Git 集成，推送 main 自动部署）。

Marketplace 前端见 [../forge](../forge)：https://deepseek-forge-marketplace.vercel.app。

GitHub / Marketplace / Documentation 链接集中定义在 `src/config.ts`（仓库迁移时改这里）。

