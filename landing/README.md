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

Deploy as its own Vercel project (framework: **Vite**, root directory: **landing**) —
the existing root `vercel.json` still routes the read-only marketplace in `web/`.

The GitHub / Documentation buttons point at the real repository:
`https://github.com/W117C/deepseek-agenthub` (update in `src/config.ts` if the repo moves).

