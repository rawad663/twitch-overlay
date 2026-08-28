/**
 * Side-by-side screenshots of the PR's build against the live production
 * site, so a visual regression is visible before merge. Writes pairs into
 * .verify/compare/.
 *
 *   npm run build && node scripts/compare.mjs
 *
 * The PR side is served locally from ./out; the "main" side is the deployed
 * production URL (override with COMPARE_BASE_URL for a one-off comparison
 * against something else). Both are captured the same way: demo traffic off,
 * IRC stubbed, and animations frozen once the entrance transitions finish, so
 * the only differences left are real ones.
 *
 * This is informational, not a gate — see diff-shots.mjs, which never fails
 * a build over a pixel difference.
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = join(ROOT, "out");
const DEST = join(ROOT, ".verify", "compare");
const BASE = "/twitch-overlay";
const PORT = 4323;

const MAIN_ROOT = (process.env.COMPARE_BASE_URL ?? "https://rawad663.github.io/twitch-overlay").replace(
  /\/$/,
  "",
);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".txt": "text/plain" };

const serve = () =>
  new Promise((r) => {
    const s = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.startsWith(BASE)) p = p.slice(BASE.length);
      if (p.endsWith("/")) p += "index.html";
      if (!extname(p)) p += "/index.html";
      const f = normalize(join(OUT, p));
      if (!f.startsWith(OUT) || !existsSync(f)) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
      res.end(await readFile(f));
    });
    s.listen(PORT, () => r(s));
  });

// freeze anything that would differ between two captures taken a moment apart
const FREEZE = `*, *::before, *::after {
  animation-play-state: paused !important;
  transition: none !important;
}`;

const MODES = [
  ["hud", ""],
  ["brb", "?mode=brb&min=15"],
  ["soon", "?mode=soon&min=15"],
  ["afk", "?mode=afk"],
  ["chill", "?mode=chill"],
];

async function shoot(ctx, url, path) {
  const page = await ctx.newPage();
  await page.routeWebSocket(/irc-ws\.chat\.twitch\.tv/, () => {});
  await page.goto(url, { waitUntil: "networkidle" });
  // let the entrance animations finish BEFORE freezing, or both shots capture
  // a different point mid-flight and every lane looks a few pixels off
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await page.close();
}

async function main() {
  const server = await serve();
  await mkdir(DEST, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const prRoot = `http://localhost:${PORT}${BASE}`;

  console.log(`comparing PR build (${prRoot}) against ${MAIN_ROOT}\n`);

  for (const [name, qs] of MODES) {
    // ?live=1 keeps the demo's random traffic out of a comparison shot
    const suffix = `${qs}${qs ? "&" : "?"}live=1`;
    await shoot(ctx, `${prRoot}/${suffix}`, join(DEST, `${name}-pr.png`));
    await shoot(ctx, `${MAIN_ROOT}/${suffix}`, join(DEST, `${name}-main.png`));
    console.log(`  captured ${name}`);
  }

  await browser.close();
  server.close();
  console.log(`\npairs in .verify/compare/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
