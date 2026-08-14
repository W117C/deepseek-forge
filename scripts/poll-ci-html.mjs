#!/usr/bin/env node
// Poll the GitHub actions HTML page (no API rate limit) until the latest CI run settles.
const sha = process.argv[2];
const LIST = "https://github.com/W117C/deepseek-forge/actions";
const UA = { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } };
async function main() {
  for (let i = 0; i < 40; i++) {
    let html = "";
    try {
      const res = await fetch(LIST, UA);
      html = await res.text();
    } catch (e) {
      console.log("fetch err", String(e));
    }
    const m = html.match(/deepseek-forge\/actions\/runs\/(\d+)[^]*?<span[^>]*>([^<]{0,30})<\/span>/);
    // simpler: find all run ids + their status icons in order
    const runs = [];
    const re = /\/actions\/runs\/(\d+)/g;
    let mm;
    while ((mm = re.exec(html)) !== null) runs.push(mm[1]);
    const statuses = [...html.matchAll(/aria-label="([a-zA-Z_ ]*(?:success|failure|in progress|queued|completed)[a-zA-Z_ ]*)"/gi)].map((x) => x[1]);
    const uniq = [...new Set(runs)];
    console.log("latest run ids:", uniq.slice(0, 3).join(","), "| statuses:", [...new Set(statuses)].join(" | "));
    if (/completed successfully/i.test(html)) {
      console.log("PAGE SAYS: latest run completed successfully");
      process.exit(0);
    }
    if (/failure/i.test(html) && !/in_progress|queued/i.test(html)) {
      console.log("PAGE SAYS: failure visible (check manually)");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 90000));
  }
  console.log("TIMED OUT");
  process.exit(1);
}
main();
