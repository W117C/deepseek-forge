// Regenerate preview screenshots: node scripts/shots.mjs
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TARGET = process.env.PREVIEW_URL || 'http://localhost:4173/'
const OUT = new URL('../shots/', import.meta.url).pathname

const shots = [
  { name: 'desktop-fold', width: 1440, height: 900, full: false },
  { name: 'desktop', width: 1440, height: 900, full: true },
  { name: 'tablet', width: 834, height: 1112, full: true },
  { name: 'mobile-fold', width: 390, height: 844, full: false },
  { name: 'mobile', width: 390, height: 844, full: true },
]

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
})
for (const s of shots) {
  const page = await browser.newPage()
  await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2 })
  await page.goto(TARGET, { waitUntil: 'networkidle0', timeout: 30000 })
  // settle reveal animations, scroll through to trigger them, return to top
  await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 500))
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 700))
    document.querySelector('footer')?.scrollIntoView({ block: 'end' })
    await new Promise((r) => setTimeout(r, 1400))
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 700))
  })
  const path = OUT + s.name + '.png'
  if (s.full) await page.screenshot({ path, fullPage: true })
  else await page.screenshot({ path })
  console.log('saved', path)
  await page.close()
}
await browser.close()
