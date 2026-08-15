/* ---------- preview data ---------- */
const registry = [
  { id: "web-search", name: "Web Search", type: "plugin", versionLatest: "1.4.2", description: "Search the web from your agent and return cited results with ranking metadata.", stars: 2310, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-08", capabilities: ["network.http", "browser.control"], repository: "https://github.com/agenthub/web-search" },
  { id: "browser", name: "Browser", type: "plugin", versionLatest: "2.1.0", description: "Control a headless browser: navigate, click, extract and screenshot pages.", stars: 1874, license: "Apache-2.0", publisher: "agenthub", pushedAt: "2025-08-11", capabilities: ["browser.control", "network.http"], repository: "https://github.com/agenthub/browser" },
  { id: "pdf-reader", name: "PDF Reader", type: "tool", versionLatest: "1.1.0", description: "Extract text, tables and document structure from PDF files.", stars: 902, license: "MIT", publisher: "community", pushedAt: "2025-07-30", capabilities: ["filesystem.read"], repository: "https://github.com/browser-use/pdf-reader" },
  { id: "github-mcp", name: "GitHub MCP", type: "mcp", versionLatest: "0.9.5", description: "Official GitHub MCP server: repositories, issues, pull requests, actions.", stars: 4987, license: "MIT", publisher: "community", pushedAt: "2025-08-10", capabilities: ["network.http"], repository: "https://github.com/github/github-mcp-server" },
  { id: "filesystem", name: "Filesystem Skill", type: "skill", versionLatest: "1.0.2", description: "Read and write files inside a workspace sandbox with path allow-listing.", stars: 431, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-05", capabilities: ["filesystem.read", "filesystem.write"], repository: "https://github.com/agenthub/filesystem-skill" },
  { id: "citation", name: "Citation Skill", type: "skill", versionLatest: "0.6.1", description: "Extract and normalize citations to BibTeX from pages and PDFs.", stars: 198, license: "MIT", publisher: "agenthub", pushedAt: "2025-07-22", capabilities: ["filesystem.read"], repository: "https://github.com/agenthub/citation-skill" },
  { id: "playwright-mcp", name: "Playwright MCP", type: "mcp", versionLatest: "0.8.0", description: "Browser automation MCP server from Microsoft using Playwright.", stars: 3210, license: "Apache-2.0", publisher: "community", pushedAt: "2025-08-09", capabilities: ["browser.control"], repository: "https://github.com/microsoft/playwright-mcp" },
  { id: "serpapi-mcp", name: "SerpAPI MCP", type: "mcp", versionLatest: "1.2.0", description: "Google search results over MCP through SerpAPI.", stars: 655, license: "MIT", publisher: "community", pushedAt: "2025-07-18", capabilities: ["network.http"], repository: "https://github.com/serpapi/serpapi-mcp" },
  { id: "shell-tool", name: "Shell Tool", type: "tool", versionLatest: "1.0.0", description: "Execute allow-listed shell commands in a sandboxed environment.", stars: 366, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-02", capabilities: ["process.spawn", "shell.execute"], repository: "https://github.com/agenthub/shell-tool" },
  { id: "sqlite-mcp", name: "SQLite MCP", type: "mcp", versionLatest: "1.1.3", description: "Query local SQLite databases over the Model Context Protocol.", stars: 421, license: "MIT", publisher: "community", pushedAt: "2025-07-25", capabilities: ["filesystem.read"], repository: "https://github.com/modelcontextprotocol/servers" },
  { id: "researcher", name: "Research Agent", type: "agent", versionLatest: "0.5.0", description: "Composable research agent: search, browse, extract and cite.", stars: 890, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-06", capabilities: ["network.http", "browser.control"], repository: "https://github.com/agenthub/research-agent" },
  { id: "news-digest", name: "News Digest Bundle", type: "bundle", versionLatest: "1.0.1", description: "Search + browse + summarize news into a daily digest.", stars: 77, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-04", capabilities: [], repository: "https://github.com/agenthub/news-digest" },
  { id: "modsearch", name: "ModSearch", type: "skill", versionLatest: "0.4.2", description: "The web plugin for DeepSeek Harness — the search bridge for every task.", stars: 380, license: "MIT", publisher: "community", pushedAt: "2025-07-19", capabilities: ["network.http"], repository: "https://github.com/example/modsearch" },
  { id: "argo", name: "Argo", type: "plugin", versionLatest: "1.2.0", description: "Multi-language agent search: academic, code, shopping, finance, news.", stars: 260, license: "MIT", publisher: "community", pushedAt: "2025-07-12", capabilities: ["network.http"], repository: "https://github.com/example/argo" },
  { id: "browser-bridge", name: "Browser Bridge", type: "mcp", versionLatest: "0.7.1", description: "Let your agent operate your browser window like you do.", stars: 540, license: "MIT", publisher: "community", pushedAt: "2025-08-01", capabilities: ["browser.control"], repository: "https://github.com/hanelalo/browser-bridge" },
  { id: "dsh-browser", name: "DSH Browser", type: "plugin", versionLatest: "0.3.0", description: "Chrome sidebar extension that lets DSH operate your browser.", stars: 120, license: "MIT", publisher: "community", pushedAt: "2025-06-30", capabilities: ["browser.control"], repository: "https://github.com/example/dsh-browser" },
  { id: "claude-paper", name: "Claude Paper", type: "tool", versionLatest: "0.9.2", description: "Automated research-paper study with citation extraction.", stars: 890, license: "MIT", publisher: "community", pushedAt: "2025-07-25", capabilities: ["filesystem.read"], repository: "https://github.com/example/claude-paper" },
  { id: "academic-researcher", name: "Academic Researcher", type: "agent", versionLatest: "0.5.0", description: "Turn DeepSeek Harness into an academic research agent: retrieval, review, citation check.", stars: 1500, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-06", capabilities: ["network.http"], repository: "https://github.com/agenthub/academic-researcher" },
  { id: "coding-tools-mcp", name: "Coding Tools MCP", type: "mcp", versionLatest: "1.3.0", description: "Give any AI agent the ability to code.", stars: 2100, license: "MIT", publisher: "community", pushedAt: "2025-08-02", capabilities: [], repository: "https://github.com/example/coding-tools-mcp" },
  { id: "dsh-at-file", name: "DSH @file", type: "plugin", versionLatest: "0.6.0", description: "Codex-style @file mentions: search workspace files.", stars: 190, license: "MIT", publisher: "community", pushedAt: "2025-07-15", capabilities: ["filesystem.read"], repository: "https://github.com/example/dsh-at-file" },
  { id: "axern", name: "Axern Sandbox", type: "plugin", versionLatest: "0.8.0", description: "Open-source sandboxes for AI agents and untrusted code execution.", stars: 640, license: "Apache-2.0", publisher: "community", pushedAt: "2025-07-28", capabilities: ["process.spawn"], repository: "https://github.com/example/axern" },
  { id: "dsh-better-sidebar", name: "DSH Better Sidebar", type: "plugin", versionLatest: "0.5.3", description: "A full workbench sidebar with file editing, terminal, and git.", stars: 210, license: "MIT", publisher: "community", pushedAt: "2025-07-22", capabilities: ["filesystem.write", "process.spawn"], repository: "https://github.com/example/dsh-better-sidebar" },
  { id: "leantoken", name: "LeanToken", type: "mcp", versionLatest: "0.4.1", description: "Code intelligence: find the code that matters.", stars: 430, license: "MIT", publisher: "community", pushedAt: "2025-07-20", capabilities: ["filesystem.read"], repository: "https://github.com/example/leantoken" },
  { id: "dsh-toolkit", name: "DSH Toolkit", type: "tool", versionLatest: "1.1.0", description: "Zero-dependency toolkit: time, encoding, json, calculator, csv.", stars: 150, license: "MIT", publisher: "community", pushedAt: "2025-07-10", capabilities: ["filesystem.read"], repository: "https://github.com/example/dsh-toolkit" },
  { id: "mcp-for-stata", name: "MCP for Stata", type: "mcp", versionLatest: "0.2.0", description: "Integrate Stata into your agent over MCP.", stars: 80, license: "MIT", publisher: "community", pushedAt: "2025-06-20", capabilities: ["process.spawn"], repository: "https://github.com/example/mcp-for-stata" },
  { id: "dsh-visualize", name: "DSH Visualize", type: "plugin", versionLatest: "0.7.0", description: "Generated UI: interactive HTML cards rendered into the session.", stars: 320, license: "MIT", publisher: "community", pushedAt: "2025-08-03", capabilities: [], repository: "https://github.com/example/dsh-visualize" },
  { id: "archify", name: "Archify", type: "skill", versionLatest: "0.3.1", description: "Beautiful, verifiable architecture and sequence diagrams.", stars: 240, license: "MIT", publisher: "community", pushedAt: "2025-07-08", capabilities: [], repository: "https://github.com/example/archify" },
  { id: "finance-analyst", name: "Finance Analyst", type: "agent", versionLatest: "0.3.0", description: "Turn DeepSeek Harness into a financial research and decision-support agent.", stars: 980, license: "MIT", publisher: "agenthub", pushedAt: "2025-08-05", capabilities: ["network.http"], repository: "https://github.com/agenthub/finance-analyst" },
  { id: "openbiliclaw", name: "OpenBiliClaw", type: "plugin", versionLatest: "0.9.0", description: "Local-first content discovery agent: Bilibili, Xiaohongshu, Douyin, YouTube, X, Zhihu, Reddit.", stars: 470, license: "MIT", publisher: "community", pushedAt: "2025-07-30", capabilities: ["network.http"], repository: "https://github.com/example/openbiliclaw" },
  { id: "picgo-core", name: "PicGo Core", type: "tool", versionLatest: "1.5.0", description: "The ultimate image uploading engine, CLI & API.", stars: 1800, license: "MIT", publisher: "community", pushedAt: "2025-07-01", capabilities: ["network.http"], repository: "https://github.com/PicGo/PicGo-Core" },
  { id: "agent-vision-toolkit", name: "Agent Vision Toolkit", type: "skill", versionLatest: "0.6.0", description: "Vision skills: image Q&A, long-screenshot OCR, UI restoration.", stars: 700, license: "MIT", publisher: "community", pushedAt: "2025-07-26", capabilities: [], repository: "https://github.com/example/agent-vision-toolkit" },
  { id: "rea", name: "REA", type: "mcp", versionLatest: "0.5.0", description: "Reverse engineer anything with agents.", stars: 560, license: "MIT", publisher: "community", pushedAt: "2025-07-18", capabilities: ["filesystem.read"], repository: "https://github.com/example/rea" },
  { id: "promentor", name: "ProMentor", type: "plugin", versionLatest: "0.4.0", description: "Scans project architecture and generates a staircase learning plan.", stars: 130, license: "MIT", publisher: "community", pushedAt: "2025-07-05", capabilities: [], repository: "https://github.com/example/promentor" },
  { id: "openguardrails", name: "OpenGuardrails", type: "plugin", versionLatest: "0.2.2", description: "Vendor-neutral protocol for AI agent safety & security.", stars: 350, license: "Apache-2.0", publisher: "community", pushedAt: "2025-07-14", capabilities: [], repository: "https://github.com/example/openguardrails" },
  { id: "anchorlaw", name: "AnchorLaw", type: "tool", versionLatest: "0.3.0", description: "Code verification protocol for vibe coding.", stars: 90, license: "MIT", publisher: "community", pushedAt: "2025-06-25", capabilities: ["filesystem.read"], repository: "https://github.com/example/anchorlaw" },
  { id: "dsh-handbook", name: "DSH Handbook", type: "plugin", versionLatest: "1.0.0", description: "DeepSeek Harness from 0 to 1: install, plugin dev, tuning, cases.", stars: 410, license: "MIT", publisher: "community", pushedAt: "2025-07-27", capabilities: [], repository: "https://github.com/example/dsh-handbook" },
  { id: "notes", name: "Notes", type: "plugin", versionLatest: "0.8.4", description: "Open-source notes with skill calls and public-account formatting.", stars: 280, license: "MIT", publisher: "community", pushedAt: "2025-07-17", capabilities: ["filesystem.write"], repository: "https://github.com/example/notes" },
];

const agents = {
  "web-search": { version: "1.4.2", installedAt: "2025-08-10 14:22", trust: "trusted", score: 96, kind: "plugin", permissions: { network: ["api.search.example.com", "api.citedby.example.com"], filesystem: [], env: [] }, scanVerdict: "clean", license: "MIT", enabled: true, reviewStatus: "approved", source: "https://github.com/agenthub/web-search" },
  "browser": { version: "2.0.4", installedAt: "2025-08-09 09:41", trust: "trusted", score: 91, kind: "plugin", permissions: { network: ["*"], filesystem: ["/tmp"], env: [] }, scanVerdict: "clean", license: "Apache-2.0", enabled: true, reviewStatus: "approved", source: "https://github.com/agenthub/browser" },
  "pdf-reader": { version: "1.1.0", installedAt: "2025-07-28 16:05", trust: "trusted", score: 88, kind: "tool", permissions: { network: [], filesystem: ["read"], env: [] }, scanVerdict: "clean", license: "MIT", enabled: false, reviewStatus: "approved", source: "https://github.com/browser-use/pdf-reader" },
  "github-mcp": { version: "0.9.4", installedAt: "2025-08-11 08:12", trust: "trusted", score: 94, kind: "mcp", permissions: { network: ["api.github.com"], filesystem: [], env: ["GITHUB_TOKEN"] }, scanVerdict: "clean", license: "MIT", enabled: true, reviewStatus: "approved", source: "https://github.com/github/github-mcp-server" },
  "filesystem": { version: "1.0.2", installedAt: "2025-08-11 10:05", trust: "trusted", score: 84, kind: "skill", imported: true, reviewStatus: "pending", permissions: { network: [], filesystem: ["read", "write"], env: [] }, scanVerdict: "clean", license: "MIT", enabled: true, source: "https://github.com/agenthub/filesystem-skill" },
  "researcher": { version: "0.4.2", installedAt: "2025-08-07 11:30", trust: "trusted", score: 93, kind: "agent", profile: "researcher", enabled: true, permissions: { network: ["*"], filesystem: ["read"], env: [] }, source: "https://github.com/agenthub/research-agent" },
};

const updates = [
  { id: "web-search", installed: "1.4.2", latest: "1.4.2", outdated: false },
  { id: "browser", installed: "2.0.4", latest: "2.1.0", outdated: true },
  { id: "pdf-reader", installed: "1.1.0", latest: "1.1.0", outdated: false },
  { id: "github-mcp", installed: "0.9.4", latest: "0.9.5", outdated: true },
  { id: "filesystem", installed: "1.0.2", latest: "1.0.2", outdated: false },
  { id: "researcher", installed: "0.4.2", latest: "0.5.0", outdated: true },
];

const logs = [
  { ts: "10:42", id: "filesystem", kind: "install", version: "1.0.2", ok: true, steps: [], code: null },
  { ts: "10:37", id: "browser", kind: "install", version: "2.0.4", ok: true, steps: [], code: null },
  { ts: "10:31", id: "researcher", kind: "harness", version: "0.4.2", ok: true, steps: [], code: null },
  { ts: "10:24", id: "web-search", kind: "security", version: "1.4.2", ok: true, steps: [], code: "96" },
  { ts: "09:58", id: "github-mcp", kind: "install", version: "0.9.4", ok: true, steps: [], code: null },
];

const dependents = {
  "web-search": [{ kind: "bundle", id: "news-digest", requires: "^1.0.0" }, { kind: "agent", id: "researcher", requires: "^1.4.0" }],
  "browser": [{ kind: "agent", id: "researcher", requires: "^2.0.0" }],
  "pdf-reader": [], "github-mcp": [], "filesystem": [], "citation": [], "researcher": [],
};

const info = {
  id: "web-search", name: "Web Search", type: "plugin", version: "1.4.2",
  description: "Search the web from your agent and return cited results with ranking metadata.",
  license: { spdx: "MIT" }, source: { repository: "https://github.com/agenthub/web-search" },
  upstream: { author: "agenthub", license: "MIT" }, publisher: { id: "agenthub" },
  capabilities: ["network.http", "browser.control"],
  dependencies: [{ package: "fetch-util", version: "^0.3.0" }, { package: "cite-core", version: "^1.1.0" }],
  security: { status: "verified" },
  compatibility: { forge: "^0.4.0", dsh: { min: "1.2.0", tested: ["1.2.3", "1.3.0"] }, node: "20+", platform: ["macos", "linux"] },
  extra: { stars: 2310, pushedAt: "2025-08-08" },
};

const runtime = {
  harnessDetected: true, harnessBin: "/Users/ze/.local/bin/dsh", harnessVersion: "1.2.3",
  sessionsDir: "/Users/ze/.deepseek-forge/sessions", sessionCount: 3,
  sessions: [
    { id: "sess-8f3a21", sizeBytes: 48210, modifiedAt: "2025-08-11 10:41" },
    { id: "sess-77c0e4", sizeBytes: 21055, modifiedAt: "2025-08-11 09:12" },
    { id: "sess-2b91ad", sizeBytes: 9876, modifiedAt: "2025-08-10 18:47" },
  ],
  processes: [
    { pid: 89241, command: "dsh run --profile researcher" },
    { pid: 89402, command: "dsh gui --port 3080" },
  ],
};

const stats = {
  registryPath: "/Users/ze/.deepseek-forge/registry", packages: 34, githubSources: 21,
  licenses: { MIT: 18, "Apache-2.0": 9, ISC: 2 }, cacheRepos: 7,
  cachePath: "/Users/ze/.deepseek-forge/cache/repos",
};

const bundles = [
  { id: "news-digest", name: "News Digest", components: ["web-search", "browser", "sqlite-mcp"] },
  { id: "research-stack", name: "Research Stack", components: ["web-search", "browser", "pdf-reader", "citation"] },
  { id: "deep-research", name: "Deep Research", components: ["modsearch", "browser-bridge", "claude-paper", "academic-researcher"] },
];

/* ---------- self-contained init script ---------- */
export const initSource = `
(() => {
  const DATA = ${JSON.stringify({ registry, agents, updates, logs, dependents, info, runtime, stats, bundles })};
  const eventHandlers = {};
  const handlerEvents = {};
  let cbCounter = 0;

  async function invoke(cmd, args) {
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));
    const D = DATA;
    switch (cmd) {
      case "system_status":
        return { coreVersion: "0.4.0", registryPath: "/Users/ze/.deepseek-forge/registry", registryAvailable: true, registryName: "deepseek-forge/registry", dshDetected: true };
      case "registry_list": return D.registry;
      case "state_list": return { agents: D.agents };
      case "update_check": return D.updates;
      case "runtime_status_cmd": return D.runtime;
      case "logs_list": return D.logs;
      case "dependents_list": return { id: args.id, dependents: D.dependents[args.id] ?? [] };
      case "registry_info": {
        if (args.id === "web-search") return D.info;
        const r = D.registry.find((p) => p.id === args.id);
        const adapted = args.id === "academic-researcher" || args.id === "finance-analyst";
        return { ...D.info, id: args.id, name: r?.name ?? args.id, type: r?.type ?? "plugin",
          version: r?.versionLatest ?? "1.0.0", description: r?.description ?? "Open-source capability for your agent.",
          license: { spdx: r?.license ?? null }, source: { repository: r?.repository ?? null },
          upstream: { author: r?.publisher ?? "community", license: r?.license ?? null },
          publisher: { id: r?.publisher ?? "community" }, capabilities: r?.capabilities ?? [], dependencies: [],
          security: { status: "verified" }, extra: { stars: r?.stars ?? null, pushedAt: r?.pushedAt ?? null },
          artifact: { filename: adapted ? args.id + "-0.1.0.tar.gz" : "", sha256: null },
          runtime: { engine: "deepseek-harness", profile: { name: args.id, bundles: adapted ? ["dsh-base"] : [], patch: null }, components: { bundles: [], presets: [], skills: [] }, health: [] },
          entrypoint: { type: "process", profile: adapted ? args.id : null, command: null, config: {} } };
      }
      case "registry_versions": return ["1.4.2", "1.4.1", "1.4.0"];
      case "registry_get_version": return D.info;
      case "sources_stats": return D.stats;
      case "bundle_list": return D.bundles;
      case "bundle_create": return { id: (args.name || "bundle").toLowerCase().replace(/\\s+/g, "-") };
      case "bundle_install": {
        const comps = (D.bundles.find((b) => b.id === args.id)?.components) || ["web-search", "browser"];
        comps.forEach((c, i) => {
          setTimeout(() => {
            for (const [id, event] of Object.entries(handlerEvents)) {
              if (event === "install-progress" && typeof eventHandlers[id] === "function") {
                eventHandlers[id]({ event: "install-progress", id, payload: { event: "install-progress", id: args.id, phase: "component", step: i + 1, total: comps.length, meta: { component: c } } });
              }
            }
          }, 450 * (i + 1));
        });
        await new Promise((r) => setTimeout(r, 450 * (comps.length + 1)));
        return { bundle: args.id, ok: true, results: comps.map((c) => ({ id: c, ok: true })) };
      }
      case "bundle_uninstall": return { ok: true };
      case "composer_resolve":
        if ((args.ids || []).includes("finance-analyst")) {
          return { order: args.ids, conflicts: [], missing: ["sec-filings@latest (SEC filings reader not curated)"] };
        }
        return { order: args.ids, conflicts: [], missing: [] };
      case "composer_generate":
        return { agentId: "research-agent", profile: "research-agent", dir: "~/.deepseek-forge/agents/research-agent", components: args.ids, result: { steps: ["resolved", "installed"], health: { passed: true } } };
      case "install_package": {
        const phases = ["resolving", "cloning", "scanning", "registering", "installed"];
        phases.forEach((phase, i) => {
          setTimeout(() => {
            for (const [id, event] of Object.entries(handlerEvents)) {
              if (event === "install-progress" && typeof eventHandlers[id] === "function") {
                eventHandlers[id]({ event: "install-progress", id, payload: { event: "install-progress", id: args.id, phase, step: i + 1, total: 5, meta: {} } });
              }
            }
          }, 350 * (i + 1));
        });
        await new Promise((r) => setTimeout(r, 350 * 6));
        return { steps: phases };
      }
      case "state_set_review": return { id: args.id, reviewStatus: args.status };
      case "state_set_enabled": return { id: args.id, enabled: args.enabled };
      case "package_rollback": return { ok: true };
      case "update_apply": await new Promise((r) => setTimeout(r, 500)); return { id: args.id, updated: true };
      case "agent_config_get":
        return { id: args.id, profile: args.id, path: "~/.deepseek-forge/profiles/" + args.id + "/cordis.patch.yml",
          text: "# cordis.patch.yml overlay\\nplugins:\\n  web-search:\\n    enabled: true\\n" };
      case "agent_config_set": return { id: args.id, saved: true };
      case "runtime_run": return { pid: 90211, logFile: "/Users/ze/.deepseek-forge/logs/run-90211.log" };
      case "runtime_stop": return { ok: true, pid: args.pid };
      case "runtime_restart": return { pid: 90333 };
      case "plugin:event|listen": handlerEvents[args.handler] = args.event; return args.handler;
      case "plugin:event|unlisten": delete handlerEvents[args.eventId]; return null;
      case "import_analyze":
        return { source: "https://github.com/agenthub/awesome-researcher", owner: "agenthub", repo: "awesome-researcher",
          language: "TypeScript", packageManagers: ["npm"], entryPoint: "src/index.ts", readme: "README.md",
          license: "MIT", licenseMissing: false, dependencies: ["openai", "cheerio", "zod", "typescript"],
          executableFiles: [], installScripts: [], networkUsage: ["https://api.openai.com"],
          filesystemUsage: ["./cache"], envVars: ["OPENAI_API_KEY"], secretsFound: [], dangerousCommands: [],
          mcpDetected: false, agentDetected: true, skillDetected: false, toolDetected: false,
          packageType: "agent", forgeCompatibility: "partial", securityRisk: "low",
          scan: { score: 87, verdict: "low risk", findings: [], high: 0, medium: 0, low: 2, files: 14 } };
      case "adapter_propose":
        return { packageType: "agent", risk: "low", generator: "rules", requiresHumanReview: false,
          manifest: { id: "awesome-researcher", type: "agent", version: "0.1.0", entry: "src/index.ts",
            install: { steps: [{ run: "npm install" }] }, capabilities: ["network.http"] } };
      case "adapter_generate": return { ok: true, packageDir: "~/.dsh/.deepseek-forge/adapters/awesome-researcher/awesome-researcher" };
      case "adapter_status":
        return { dir: args.dir, exists: true,
          hooks: ["install.md","configure.md","healthcheck.md","uninstall.md","runtime.md"].map((name) => ({ name, filled: false })),
          hooksFilled: 0, hooksTotal: 5, agentForm: false };
      case "registry_import_agent": return { id: "awesome-researcher", ok: true };
      default: throw new Error("stub: unknown command " + cmd);
    }
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb) => { const id = ++cbCounter; eventHandlers[id] = cb; return id; },
    unregisterCallback: (id) => { delete eventHandlers[id]; },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  try { localStorage.setItem("forge-locale", "en"); } catch {}
})();
`;
export default initSource;
