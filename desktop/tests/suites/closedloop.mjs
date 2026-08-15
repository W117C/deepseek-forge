// Closed-loop check: missing slot → GitHub Import context + bundle capability stack.
import { chromium } from "playwright-core";
import { initSource } from "../fixture.mjs";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(initSource);
const results = [];
const check = (n, ok, d) => results.push((ok ? "PASS " : "FAIL ") + n + (d ? " — " + d : ""));

// 1. Missing slot → import page with recipe context banner
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click('.seg-item:has-text("Recipes")');
await page.waitForTimeout(300);
await page.click('.recipe-card:has-text("Deep Research") .pkg-head');
await page.waitForTimeout(400);
await page.click('.recipe-slot-import');
await page.waitForTimeout(500);
check("slot link goes to import with context", page.url().includes("#/import?recipe=deep-research"), page.url());
const banner = await page.evaluate(() => document.querySelector(".note[data-tone='ok']")?.textContent ?? "");
check("fill-slot banner mentions recipe + role", banner.includes("Deep Research") && banner.includes("Document Writer"), banner.slice(0, 120));
check("banner links back to Recipes", banner.includes("Back to Recipes"), "");

// 2. Bundle capability stack on Bundles page
await page.goto("http://127.0.0.1:5174/#/bundles", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const stack = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".bundle-stack-card")).find((c) => c.textContent.includes("Deep Research"));
  if (!card) return null;
  return {
    comps: Array.from(card.querySelectorAll(".stack-cap-name")).map((n) => n.textContent),
    states: Array.from(card.querySelectorAll(".stack-cap-state")).map((s) => s.textContent.trim()),
    recipeBadge: card.querySelector(".badge-accent")?.textContent ?? null,
    caps: Array.from(card.querySelectorAll(".stack-cap-chip")).map((c) => c.textContent.trim()),
  };
});
check("deep-research stack shows 4 components", !!stack && stack.comps.length === 4, JSON.stringify(stack?.comps));
check("recipe badge on stack card", !!stack && !!stack.recipeBadge, stack?.recipeBadge ?? "");
check("capability chips rendered", !!stack && stack.caps.length === 3, JSON.stringify(stack?.caps));
check("per-component state chips", !!stack && stack.states.length === 4, JSON.stringify(stack?.states));

console.log(results.join("\n"));
await browser.close();
