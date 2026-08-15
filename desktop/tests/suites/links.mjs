// Verify click-to-detail + repository links.
import { chromium } from "playwright-core";
import { initSource } from "../fixture.mjs";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(initSource);
const results = [];
const check = (n, ok, d) => results.push((ok ? "PASS " : "FAIL ") + n + (d ? " — " + d : ""));

// 1. Marketplace card click → detail route
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const cardClickable = await page.evaluate(() => {
  const c = document.querySelector(".pkg-card");
  return { cursor: getComputedStyle(c).cursor, title: c.getAttribute("title") };
});
check("card cursor pointer + tooltip", cardClickable.cursor === "pointer" && !!cardClickable.title, JSON.stringify(cardClickable));
await page.click(".pkg-card:has-text('SerpAPI MCP') .pkg-head");
await page.waitForTimeout(500);
check("card click navigates to detail", page.url().includes("#/plugins/serpapi-mcp"), page.url());

// 2. Card repo link opens GitHub (external) and does not navigate
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const repo = await page.evaluate(() => {
  const a = document.querySelector(".pkg-card .pkg-repo-link");
  return a ? { href: a.getAttribute("href"), target: a.getAttribute("target"), text: a.textContent } : null;
});
check("card repo is an external link", !!repo && repo.href.startsWith("https://github.com/"), JSON.stringify(repo));
await page.click(".pkg-card:has-text('SerpAPI MCP') .pkg-repo-link");
await page.waitForTimeout(400);
check("repo link click does not navigate", page.url().includes("#/marketplace"), page.url());

// 3. Detail page repo links: header badge (not installed) + Open source button (installed)
await page.goto("http://127.0.0.1:5174/#/plugins/serpapi-mcp", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const headerBadge = await page.evaluate(() => {
  const a = document.querySelector(".detail-meta a[href*='github.com']");
  return a ? { href: a.getAttribute("href"), target: a.getAttribute("target") } : null;
});
check("detail header has GitHub badge link (not installed)", !!headerBadge && headerBadge.href.includes("github.com"), JSON.stringify(headerBadge));
await page.goto("http://127.0.0.1:5174/#/plugins/web-search", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const openBtn = await page.evaluate(() => Array.from(document.querySelectorAll(".detail-actions a")).map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() })));
check("installed detail has Open source button", openBtn.some((b) => b.href.includes("github.com") && b.text.includes("Open source")), JSON.stringify(openBtn));

// 4. My Plugins row click → detail; buttons don't navigate
await page.goto("http://127.0.0.1:5174/#/plugins", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const rowCursor = await page.evaluate(() => getComputedStyle(document.querySelector(".list-row")).cursor);
check("plugins row cursor pointer", rowCursor === "pointer", rowCursor);
await page.click(".list-row:has-text('web-search') .cell-sub .cell-link");
await page.waitForTimeout(400);
check("row repo link click does not navigate", page.url().includes("#/plugins") && !page.url().includes("web-search"), page.url());
await page.click(".list-row:has-text('web-search') .cell");
await page.waitForTimeout(500);
check("row click navigates to detail", page.url().includes("#/plugins/web-search"), page.url());

// 5. Security page name links
await page.goto("http://127.0.0.1:5174/#/security", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const secLinks = await page.evaluate(() => Array.from(document.querySelectorAll(".list-row a.cell-title")).map((a) => a.getAttribute("href")).slice(0, 2));
check("security rows link to detail", secLinks.length > 0 && secLinks.every((h) => h.includes("/plugins/")), JSON.stringify(secLinks));

console.log(results.join("\n"));
await browser.close();
