// Poll ONE run page until all jobs settle (7 jobs) or a failure appears.
const RUN = process.argv[2];
const url = "https://github.com/W117C/deepseek-forge/actions/runs/" + RUN;
const UA = { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } };
async function main() {
  for (let i = 0; i < 60; i++) {
    let html = "";
    try { html = await (await fetch(url, UA)).text(); } catch (e) { console.log("fetch err", String(e)); }
    const ok = (html.match(/aria-label="completed successfully: "/g) || []).length;
    const fail = (html.match(/aria-label="[Ff]ail/g) || []).length;
    const busy = (html.match(/fgColor-attention/g) || []).length;
    console.log("poll " + i + ": success=" + ok + " failures=" + fail + " busy-icons=" + busy);
    if (fail > 0) { console.log("RESULT: FAILURE"); process.exit(1); }
    if (ok >= 7 && busy === 0) { console.log("RESULT: ALL GREEN (7/7)"); process.exit(0); }
    await new Promise((r) => setTimeout(r, 60000));
  }
  console.log("TIMED OUT"); process.exit(1);
}
main();
