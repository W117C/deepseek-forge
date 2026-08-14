#!/usr/bin/env node
// Poll GitHub Actions until the latest CI run for our pushed SHA settles.
const sha = process.argv[2];
const api = "https://api.github.com/repos/W117C/deepseek-forge/actions/runs?per_page=8";
const jobsApi = (id) => "https://api.github.com/repos/W117C/deepseek-forge/actions/runs/" + id + "/jobs";
async function main() {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(api);
    const j = await res.json();
    const runs = (j.workflow_runs || []).filter((r) => r.name === "CI");
    const mine = runs.find((r) => r.head_sha.startsWith(sha)) || runs[0];
    if (!mine) { console.log("no CI run found"); process.exit(2); }
    if (mine.status === "completed") {
      console.log("FINAL run", mine.id, mine.head_sha.slice(0, 8), mine.conclusion, mine.html_url);
      const rj = await (await fetch(jobsApi(mine.id))).json();
      for (const x of (rj.jobs || [])) console.log("  " + x.name + " -> " + x.conclusion);
      process.exit(0);
    }
    console.log("run", mine.id, mine.head_sha.slice(0, 8), mine.status, "…");
    await new Promise((r) => setTimeout(r, 60000));
  }
  console.log("TIMED OUT");
  process.exit(1);
}
main();
