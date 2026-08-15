// Programmatic design-system verification (no vision needed).
import { chromium } from "playwright-core";
import { initSource } from "../fixture.mjs";

const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(initSource);
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push("console.error: " + m.text()); });
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

const results = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
}

// 1. Shell metrics
await page.goto("http://127.0.0.1:5174/#/", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const shell = await page.evaluate(() => {
  const $ = (s) => document.querySelector(s);
  const tb = $(".titlebar");
  const sb = $(".sidebar");
  const main = $(".app-main");
  const pg = $(".page");
  return {
    title: document.title,
    hasShell: !!$(".app-shell"),
    tbH: tb ? tb.getBoundingClientRect().height : null,
    sbW: sb ? sb.getBoundingClientRect().width : null,
    mainScrollW: main ? main.scrollWidth - main.clientWidth : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: getComputedStyle(document.body).fontSize,
    mainOverflowY: main ? getComputedStyle(main).overflowY : null,
    pagePad: pg ? getComputedStyle(pg).padding : null,
  };
});
check("titlebar height = 44", shell.tbH === 44, String(shell.tbH));
check("sidebar width = 248", shell.sbW === 248, String(shell.sbW));
check("main scrolls vertically, no horizontal overflow", shell.mainScrollW === 0, "overflow px=" + shell.mainScrollW);
check("app background #08090a", shell.bodyBg === "rgb(8, 9, 10)", shell.bodyBg);
check("base font 13.5px", shell.bodyFont === "13.5px", shell.bodyFont);
check("page padding 32px", shell.pagePad === "32px", shell.pagePad);

// 2. Tokens
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue("--accent").trim(),
    surface: cs.getPropertyValue("--surface").trim(),
    fg: cs.getPropertyValue("--foreground").trim(),
    fg2: cs.getPropertyValue("--foreground-2").trim(),
    muted: cs.getPropertyValue("--muted").trim(),
    border: cs.getPropertyValue("--border").trim(),
  };
});
check("accent #4f7cff", tokens.accent === "#4f7cff", tokens.accent);
check("panel #101214", tokens.surface === "#101214", tokens.surface);
check("primary text #f5f5f5", tokens.fg === "#f5f5f5", tokens.fg);
check("secondary #a1a1aa", tokens.fg2 === "#a1a1aa", tokens.fg2);
check("muted #6b7280", tokens.muted === "#6b7280", tokens.muted);
check("border rgba(255,255,255,0.08)", tokens.border.includes("0.08"), tokens.border);

// 3. Sidebar states
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const sb2 = await page.evaluate(() => {
  const active = document.querySelector(".sidebar-link.is-active");
  const groups = Array.from(document.querySelectorAll(".sidebar-group-title")).map((g) => g.textContent);
  const badges = Array.from(document.querySelectorAll(".sidebar-badge")).map((b) => b.textContent);
  const st = getComputedStyle(active);
  return { groups, badges, activeBg: st.backgroundColor, activeBorder: st.borderTopColor, activeText: st.color };
});
check("sidebar groups forge/discover/workspace/runtime/system", sb2.groups.map((g) => g.toLowerCase()).join(",") === "forge,discover,workspace,runtime,system", sb2.groups.join(","));
check("updates badge shows 3", sb2.badges.includes("3"), sb2.badges.join(","));
check("active item accent-soft bg", sb2.activeBg === "rgba(79, 124, 255, 0.12)", sb2.activeBg);
check("active item accent border", sb2.activeBorder.includes("79, 124, 255"), sb2.activeBorder);
check("no phase markers", !JSON.stringify(sb2.groups).match(/phase/i), "");

// 4. Package card
const card = await page.evaluate(() => {
  const c = document.querySelector(".pkg-card:has(button.btn-primary)");
  if (!c) return { err: "no installable card found" };
  const cs = getComputedStyle(c);
  const btn = c.querySelector(".btn-primary");
  return { radius: cs.borderRadius, border: cs.borderTopColor, pad: cs.padding, btnRadius: getComputedStyle(btn).borderRadius, btnH: btn.getBoundingClientRect().height };
});
if (card.err) { console.log("FAIL card — " + card.err); process.exit(1); }
check("card radius 8px", card.radius === "8px", card.radius);
check("card border subtle", card.border.includes("0.08"), card.border);
check("install button radius 6px h26 (btn-sm)", card.btnRadius === "6px" && card.btnH === 26, card.btnRadius + " h" + card.btnH);

// 5. Detail tabs + uninstall dialogs
await page.goto("http://127.0.0.1:5174/#/plugins/web-search", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const tabs = await page.evaluate(() => Array.from(document.querySelectorAll(".tab")).map((t) => t.textContent));
check("detail tabs Overview/Capabilities/Dependencies/Security/README", ["Overview","Capabilities","Dependencies","Security","README"].every((t) => tabs.some((x) => x.startsWith(t))), tabs.join(","));
await page.click('button.tab:has-text("Security")');
await page.waitForTimeout(300);
const secPanel = await page.evaluate(() => document.querySelector(".detail-panel")?.textContent);
check("security panel shows verified rows", !!secPanel?.includes("Verified"), secPanel?.slice(0, 60));

// 6. Install sheet → running steps → done
await page.goto("http://127.0.0.1:5174/#/marketplace", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.click(".pkg-card:has-text('SQLite MCP') button:has-text('Install')");
await page.waitForTimeout(400);
const sheet1 = await page.evaluate(() => {
  const m = document.querySelector(".modal");
  return { title: m?.querySelector(".modal-title")?.textContent, kvs: Array.from(m?.querySelectorAll(".sheet-kv .k") ?? []).map((k) => k.textContent) };
});
check("install sheet title", sheet1.title === "Install SQLite MCP", sheet1.title);
check("sheet rows Version/Source/License/Capabilities/Dependencies/Security", sheet1.kvs.map((k) => k.trim()).join(",") === "Version,Source,License,Capabilities,Dependencies,Security", sheet1.kvs.join(","));
await page.click(".modal-foot button.btn-primary");
await page.waitForTimeout(1300);
const stepsRunning = await page.evaluate(() => Array.from(document.querySelectorAll(".step")).map((s) => ({ label: s.querySelector(".step-label")?.textContent, cls: s.className })));
check("pipeline running: some done + one active", stepsRunning.some((s) => s.cls.includes("is-done")) && stepsRunning.some((s) => s.cls.includes("is-active")), JSON.stringify(stepsRunning.map((s) => s.cls.split(" ")[1])));
await page.waitForTimeout(1400);
const toast = await page.evaluate(() => document.querySelector(".toast")?.textContent ?? null);
check("success toast appears", !!toast && toast.includes("installed"), toast);

// 7. Palette
await page.keyboard.press("Meta+K");
await page.waitForTimeout(300);
const pal = await page.evaluate(() => {
  const p = document.querySelector(".palette");
  return { exists: !!p, groupLabels: Array.from(p?.querySelectorAll(".palette-group-label") ?? []).map((g) => g.textContent), foot: p?.querySelector(".palette-foot")?.textContent ?? "" };
});
check("palette opens with Navigation/Actions groups", pal.exists && pal.groupLabels.join(",") === "Navigation,Actions", pal.groupLabels.join(","));
check("palette footer has kbd hints", pal.foot.includes("esc") && pal.foot.includes("↑↓"), "");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Esc closes palette", await page.evaluate(() => !document.querySelector(".palette")), "");

// 8. Composer add/remove/reorder
await page.goto("http://127.0.0.1:5174/#/bundles", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.click(".avail-item:has-text('web-search') .icon-btn");
await page.click(".avail-item:has-text('browser') .icon-btn");
await page.click(".avail-item:has-text('pdf-reader') .icon-btn");
const comps = await page.evaluate(() => Array.from(document.querySelectorAll(".comp-item .comp-main .avail-name")).map((n) => n.textContent));
check("composer adds 3 components", comps.join(",") === "web-search,browser,pdf-reader", comps.join(","));
await page.click(".comp-item:first-child button[title='Move down']");
const comps2 = await page.evaluate(() => Array.from(document.querySelectorAll(".comp-item .comp-main .avail-name")).map((n) => n.textContent));
check("move down reorders", comps2.join(",") === "browser,web-search,pdf-reader", comps2.join(","));
await page.click(".comp-item:nth-child(2) button[title='Remove']");
const comps3 = await page.evaluate(() => Array.from(document.querySelectorAll(".comp-item .comp-main .avail-name")).map((n) => n.textContent));
check("remove works", comps3.join(",") === "browser,pdf-reader", comps3.join(","));

// 9. Plugins toggle → toast
await page.goto("http://127.0.0.1:5174/#/plugins", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const listHead = await page.evaluate(() => Array.from(document.querySelectorAll(".list-head .col-label")).map((c) => c.textContent));
check("plugins table columns Package/Status/Version/Installed/Used by/Actions", listHead.join(",") === "Package,Status,Version,Installed,Used by {n},Actions", listHead.join(","));
// let any earlier toast expire before asserting the new one
await page.waitForFunction(() => document.querySelectorAll(".toast").length === 0, { timeout: 6000 }).catch(() => {});
await page.click(".list-row:has-text('pdf-reader') button[title='Enable']");
await page.waitForTimeout(300);
const toast2 = await page.evaluate(() => document.querySelector(".toast")?.textContent ?? null);
check("enable toast", !!toast2 && toast2.includes("Enabled"), toast2);

// 10. Dashboard stat grid
await page.goto("http://127.0.0.1:5174/#/", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const dash = await page.evaluate(() => ({
  greeting: document.querySelector(".page-heading")?.textContent,
  sub: document.querySelector(".page-sub")?.textContent,
  stats: Array.from(document.querySelectorAll(".stat-card .stat-label")).map((s) => s.textContent),
  activity: !!document.querySelector(".act-row"),
  headingFs: getComputedStyle(document.querySelector(".page-heading")).fontSize,
  headingW: getComputedStyle(document.querySelector(".page-heading")).fontWeight,
}));
check("dashboard greeting + ready", /Good (morning|afternoon|evening)/.test(dash.greeting) && dash.sub.includes("Forge is ready"), dash.greeting + " / " + dash.sub);
check("4 primary stat cards", dash.stats.slice(0, 4).join(",") === "Installed packages,Agents,Updates,Security", dash.stats.slice(0, 4).join(","));
check("activity timeline present", dash.activity, "");
check("page heading 28px/600", dash.headingFs === "28px" && dash.headingW === "600", dash.headingFs + "/" + dash.headingW);

// 11. Skills page is a real management page now (not a placeholder)
await page.goto("http://127.0.0.1:5174/#/skills", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
const skillsPage = await page.evaluate(() => ({
  heading: document.querySelector(".page-heading")?.textContent ?? "",
  seg: !!document.querySelector(".seg"),
}));
check("skills page is a real management page", skillsPage.heading === "My Skills" && skillsPage.seg, JSON.stringify(skillsPage));

console.log(results.join("\n"));
console.log("PROBLEMS:", problems.length ? problems.join(" | ") : "none");
await browser.close();
