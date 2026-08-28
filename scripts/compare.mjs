/**
 * Side-by-side screenshots of the new app and the original HTML, for eyeballing
 * the port. Writes pairs into .verify/compare/.
 *
 *   node scripts/compare.mjs
 *
 * Both are frozen the same way: demo traffic off, IRC stubbed, and animations
 * disabled, so the only differences left are real ones.
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
  ["hud", "", ""],
  ["brb", "?mode=brb&min=15", "?mode=brb&min=15"],
  ["soon", "?mode=soon&min=15", "?mode=soon&min=15"],
  ["afk", "?mode=afk", "?mode=afk"],
  ["chill", "?mode=chill", "?mode=chill"],
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
  const root = `http://localhost:${PORT}${BASE}`;

  for (const [name, nextQs, legacyQs] of MODES) {
    // ?live=1 keeps the demo's random traffic out of a comparison shot
    await shoot(ctx, `${root}/${nextQs}${nextQs ? "&" : "?"}live=1`, join(DEST, `${name}-new.png`));
    await shoot(
      ctx,
      `${root}/legacy/rawad-overlay.html${legacyQs}${legacyQs ? "&" : "?"}live=1`,
      join(DEST, `${name}-old.png`),
    );
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
