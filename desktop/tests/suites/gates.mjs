// Effectiveness gates + dedicated Skills page.
import { chromium } from "playwright-core";
import { initSource } from "../fixture.mjs";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(initSource);
const results = [];
const check = (n, ok, d) => results.push((ok ? "PASS " : "FAIL ") + n + (d ? " — " + d : ""));

// 1. Dedicated Skills management page (only skill kind)
await page.goto("http://127.0.0.1:5174/#/skills", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const skills = await page.evaluate(() => ({
  heading: document.querySelector(".page-heading")?.textContent,
  rows: Array.from(document.querySelectorAll(".list-row .cell-title")).map((n) => n.textContent),
}));
check("skills page heading", skills.heading === "My Skills", skills.heading);
check("only skill kind listed (filesystem, not web-search)", skills.rows.includes("filesystem") && !skills.rows.includes("web-search"), skills.rows.join(","));

// 2. Recipe dialog: adaptation readiness badges + effectiveness line
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click('.seg-item:has-text("Recipes")');
await page.waitForTimeout(300);
await page.click('.recipe-card:has-text("Deep Research") .pkg-head');
await page.waitForTimeout(700);
const dialog = await page.evaluate(() => {
  const slots = Array.from(document.querySelectorAll(".recipe-slot")).map((s) => ({
    name: s.querySelector(".recipe-slot-name")?.textContent ?? null,
    badge: s.querySelector(".badge")?.textContent ?? null,
  }));
  const kv = Array.from(document.querySelectorAll(".sheet-kv")).map((k) => k.textContent);
  return { slots, effectiveness: kv.find((k) => k.includes("Composition readiness")) ?? null };
});
check("adapted badge on academic-researcher", dialog.slots.some((s) => s.name === "academic-researcher" && s.badge?.includes("Adapted")), JSON.stringify(dialog.slots));
check("source-only badge on modsearch", dialog.slots.some((s) => s.name === "modsearch" && s.badge?.includes("Source only")), JSON.stringify(dialog.slots));
check("effectiveness summary renders 1/4", !!dialog.effectiveness && dialog.effectiveness.includes("1/4"), dialog.effectiveness?.slice(0, 120));
await page.click(".modal .icon-btn");
await page.waitForTimeout(300);

// 3. Resolution gate blocks an invalid recipe (missing dependency)
await page.click('.recipe-card:has-text("Investment Research") .pkg-head');
await page.waitForTimeout(500);
await page.click('.modal-foot button.btn-primary');
await page.waitForTimeout(800);
const blocked = await page.evaluate(() => ({
  title: document.querySelector(".error-title")?.textContent ?? null,
  reason: document.querySelector(".error-reason")?.textContent ?? null,
  installBtn: !!Array.from(document.querySelectorAll(".modal-foot button")).find((b) => b.textContent.includes("Resolve & Install")),
}));
check("blocked title shown", blocked.title?.includes("dependency resolution") === true, blocked.title);
check("missing dependency listed", blocked.reason?.includes("sec-filings") === true, blocked.reason?.slice(0, 140));
check("install button gone after block", !blocked.installBtn, "");
await page.click(".modal .icon-btn");
await page.waitForTimeout(300);

// 4. Composer: bundle creation gated by resolution
await page.goto("http://127.0.0.1:5174/#/bundles", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click(".avail-item:has-text('finance-analyst') .icon-btn");
await page.click(".avail-item:has-text('browser-bridge') .icon-btn");
await page.fill("input[placeholder*='Bundle name' i]", "bad-combo");
await page.click('button:has-text("Create Bundle")');
await page.waitForTimeout(700);
const gate = await page.evaluate(() => Array.from(document.querySelectorAll(".error-state, .field-error")).map((e) => e.textContent).join(" | "));
check("composer create blocked with reasons", gate.includes("sec-filings") || gate.includes("dependency resolution"), gate.slice(0, 160));

// 5. Adapter closed-loop panel (Import page)
await page.goto("http://127.0.0.1:5174/#/import", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.fill("input[placeholder*='github']", "https://github.com/agenthub/awesome-researcher");
await page.click('button:has-text("Analyze")');
await page.waitForTimeout(800);
await page.click('button:has-text("Generate adapter scaffold")');
await page.waitForTimeout(700);
const adapt = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll(".card")).find((c) => c.textContent.includes("Adapter workflow"));
  if (!panel) return null;
  return {
    hooks: Array.from(panel.querySelectorAll(".recipe-slot-role")).map((h) => h.textContent),
    states: Array.from(panel.querySelectorAll(".stack-cap-state")).map((s) => s.textContent.trim()),
    registerDisabled: !!panel.querySelector("button.btn-primary")?.disabled,
    tail: panel.innerHTML.slice(-260),
  };
});
check("adapter panel renders 5 hooks + agent-form row", !!adapt && adapt.hooks.length === 6, JSON.stringify(adapt?.hooks));
check("hooks show To fill state", !!adapt && adapt.states.filter((s) => s.includes("To fill")).length === 6, JSON.stringify(adapt?.states));
check("register button disabled until hooks + form complete", !!adapt && adapt.registerDisabled === true, String(adapt?.registerDisabled) + " | " + (adapt?.tail ?? ""));

console.log(results.join("\n"));
await browser.close();
