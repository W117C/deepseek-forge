// Desktop UI e2e suite runner.
// Starts the vite dev server, injects a realistic Tauri IPC stub, and runs the
// five Playwright suites. Exits non-zero when any check fails.
//
// The stub lives ONLY in tests/fixture.mjs — it is never imported by the app.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUITES_DIR = join(__dirname, "suites");
const PORT = Number(process.env.TEST_PORT ?? 5174);
const BASE = "http://127.0.0.1:" + PORT;

function waitForPort(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function attempt() {
      const sock = createServer();
      sock.once("error", (err) => {
        sock.close();
        // EADDRINUSE means something is already listening — that IS "up".
        if (err.code === "EADDRINUSE") return resolve();
        if (Date.now() - started > timeoutMs) reject(new Error("vite dev server did not start in time"));
        else setTimeout(attempt, 300);
      });
      sock.once("listening", () => {
        sock.close();
        resolve();
      });
      sock.listen(port, "127.0.0.1");
    })();
  });
}

async function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, TEST_BASE: BASE },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const fails = (out.match(/^FAIL /gm) || []).length;
      const passes = (out.match(/^PASS /gm) || []).length;
      resolve({ file, code, fails, passes, out });
    });
  });
}

// Reuse an already-running dev server (e.g. the tauri dev window's vite);
// otherwise spawn our own and settle through vite's dependency pre-bundling.
const alreadyUp = await waitForPort(PORT, 1500).then(() => true, () => false);
let server = null;
let serverOut = "";
if (!alreadyUp) {
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
    cwd: __dirname + "/..",
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (serverOut += d));
  server.stderr.on("data", (d) => (serverOut += d));
}

try {
  await waitForPort(PORT);
  if (!alreadyUp) {
    // Vite's first load runs dependency pre-bundling and reloads the page;
    // give it a settle window so suites never assert mid-reload.
    await new Promise((r) => setTimeout(r, 2500));
  }
  const suites = readdirSync(SUITES_DIR).filter((f) => f.endsWith(".mjs")).sort();
  let totalPass = 0;
  let totalFail = 0;
  const failedSuites = [];
  for (const suite of suites) {
    const r = await runSuite(join(SUITES_DIR, suite));
    totalPass += r.passes;
    totalFail += r.fails;
    if (r.fails > 0 || r.code !== 0) failedSuites.push(suite);
    console.log(`\n=== ${suite}: ${r.passes} PASS, ${r.fails} FAIL, exit ${r.code} ===`);
    if (r.fails > 0) console.log(r.out.split("\n").filter((l) => l.startsWith("FAIL")).join("\n"));
  }
  console.log(`\nTOTAL: ${totalPass} PASS, ${totalFail} FAIL`);
  if (totalFail > 0 || failedSuites.length > 0) {
    process.exitCode = 1;
  }
} finally {
  if (server) server.kill("SIGTERM");
}
