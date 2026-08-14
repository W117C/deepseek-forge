// Wait for GitHub API rate-limit reset, then fetch failing job logs for run 31830977238.
const RESET = 1786736239;
const RUN = 31830977238;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { headers: { "User-Agent": "forge-dev", Accept: "application/vnd.github+json" } };
async function main() {
  const wait = (RESET - Math.floor(Date.now() / 1000)) * 1000 + 60000;
  console.log("waiting", Math.round(wait / 60000), "min for rate-limit reset");
  await sleep(Math.max(wait, 10000));
  const jobsRes = await fetch("https://api.github.com/repos/W117C/deepseek-forge/actions/runs/" + RUN + "/jobs", H);
  const jobs = (await jobsRes.json()).jobs ?? [];
  for (const j of jobs) {
    console.log("JOB", j.name, "=>", j.conclusion, "| id", j.id);
  }
  for (const j of jobs.filter((x) => x.conclusion === "failure")) {
    console.log("===== LOGS for", j.name);
    const res = await fetch("https://api.github.com/repos/W117C/deepseek-forge/actions/jobs/" + j.id + "/logs", H);
    const text = await res.text();
    const lines = text.split("\n");
    // print error-ish lines + context
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^error|error\[|cannot find|Diff in|assertion|FAIL  |::error::|expected|thread .* panicked/i.test(l)) {
        out.push(l.slice(0, 300));
        if (out.length > 40) break;
      }
    }
    console.log(out.join("\n"));
    console.log("---- tail ----");
    console.log(lines.slice(-12).join("\n"));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
