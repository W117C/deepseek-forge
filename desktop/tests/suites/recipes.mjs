// Recipes verification: view switcher, cards, slot resolution, install flow.
import { chromium } from "playwright-core";
import { initSource } from "../fixture.mjs";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(initSource);
const results = [];
const check = (n, ok, d) => results.push((ok ? "PASS " : "FAIL ") + n + (d ? " — " + d : ""));

await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// 1. Switch to Recipes
await page.click('.seg-item:has-text("Recipes")');
await page.waitForTimeout(400);
const cards = await page.evaluate(() => Array.from(document.querySelectorAll(".recipe-card .pkg-name")).map((n) => n.textContent));
check("10 recipe cards", cards.length === 10, cards.join(" | "));

// 2. Research OS card navigates to composer
await page.click('.recipe-card:has-text("Research OS")');
await page.waitForTimeout(500);
check("Research OS card → composer", page.url().includes("#/bundles"), page.url());

// 3. Deep Research dialog: slot resolution with real components + honest missing slot
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click('.seg-item:has-text("Recipes")');
await page.waitForTimeout(300);
await page.click('.recipe-card:has-text("Deep Research") .pkg-head');
await page.waitForTimeout(500);
const sheet = await page.evaluate(() => {
  const slots = Array.from(document.querySelectorAll(".recipe-slot")).map((s) => ({
    role: s.querySelector(".recipe-slot-role")?.textContent,
    name: s.querySelector(".recipe-slot-name")?.textContent ?? null,
    status: s.querySelector(".badge")?.textContent ?? null,
    missing: s.querySelector(".recipe-slot-missing")?.textContent ?? null,
    importLink: !!s.querySelector(".recipe-slot-import"),
  }));
  const flow = Array.from(document.querySelectorAll(".recipe-flow-step")).map((f) => f.textContent);
  const licenseRow = Array.from(document.querySelectorAll(".sheet-kv")).find((k) => k.textContent.includes("License"));
  return { slots, flow, license: licenseRow?.querySelector(".v")?.textContent };
});
check("deep research: 5 slots, 4 resolved + 1 honest missing", sheet.slots.length === 5 && sheet.slots.filter((s) => s.name).length === 4 && sheet.slots.filter((s) => s.missing).length === 1, JSON.stringify(sheet.slots));
check("missing slot links to GitHub Import", sheet.slots.some((s) => s.importLink), "");
check("flow pipeline rendered", sheet.flow.length >= 5, sheet.flow.join("→"));
check("license summary present", !!sheet.license && sheet.license.includes("MIT"), sheet.license);

// 4. Install recipe → per-component progress → done
await page.click('.modal-foot button.btn-primary');
await page.waitForTimeout(1600);
const running = await page.evaluate(() => Array.from(document.querySelectorAll(".step")).map((s) => s.className));
check("component steps running (some done + one active)", running.some((c) => c.includes("is-done")) && running.some((c) => c.includes("is-active")), JSON.stringify(running));
await page.waitForTimeout(1400);
const done = await page.evaluate(() => {
  const notes = Array.from(document.querySelectorAll(".note[data-tone='ok']")).map((n) => n.textContent ?? "");
  return {
    note: notes.find((n) => n.includes("Bundles")) ?? null,
    toast: document.querySelector(".toast")?.textContent ?? null,
  };
});
check("recipe done note + bundles link", !!done.note && done.note.includes("Bundles"), done.note);
check("success toast", !!done.toast && done.toast.includes("Recipe installed"), done.toast);

// 5. Coding Agent resolution check
await page.click(".modal .icon-btn");
await page.waitForTimeout(300);
await page.click('.recipe-card:has-text("Coding Agent") .pkg-head');
await page.waitForTimeout(400);
const coding = await page.evaluate(() => Array.from(document.querySelectorAll(".recipe-slot-name")).map((n) => n.textContent));
check("coding agent slots resolve", coding.includes("coding-tools-mcp") && coding.includes("axern") && coding.includes("leantoken"), coding.join(","));

console.log(results.join("\n"));
await browser.close();
