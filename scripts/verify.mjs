/**
 * Boots the exported site and checks each mode actually renders — the HUD
 * lanes land on their stage coordinates, the scene canvas paints, and the
 * admin panel talks to a real overlay source over the bus.
 *
 *   node scripts/verify.mjs            # verify the new app
 *   node scripts/verify.mjs --shots    # also write PNGs to .verify/
 *
 * Run `npm run build` first; this serves ./out.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = join(ROOT, "out");
const BASE = "/twitch-overlay";
const PORT = 4319;
const SHOTS = process.argv.includes("--shots");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.startsWith(BASE)) p = p.slice(BASE.length);
      if (p.endsWith("/")) p += "index.html";
      if (!extname(p)) p += "/index.html";
      const file = normalize(join(OUT, p));
      if (!file.startsWith(OUT) || !existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Is the canvas actually painting, or is it a blank 1920x1080? */
async function canvasPainted(page) {
  return page.evaluate(() => {
    const cv = document.querySelector("canvas");
    if (!cv) return { found: false };
    const g = cv.getContext("2d");
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 997) {
      if (d[i] + d[i + 1] + d[i + 2] > 24) lit++;
    }
    return { found: true, lit, sampled: Math.ceil(d.length / (4 * 997)) };
  });
}

async function main() {
  const server = await serve();
  const browser = await chromium.launch();
  const url = (q = "") => `http://localhost:${PORT}${BASE}/${q}`;
  if (SHOTS) await mkdir(join(ROOT, ".verify"), { recursive: true });

  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  ctx.on("weberror", (e) => errors.push(String(e.error())));

  /* ── HUD ── */
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`hud: ${e.message}`));
    await page.goto(url("?demo=1"), { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const box = async (sel) => {
      const el = await page.$(sel);
      return el ? el.boundingBox() : null;
    };
    // the stage is scaled 1:1 at a 1920x1080 viewport, so stage coords == px
    const strip = await box('[class*="strip"]');
    check("HUD strip at x520 y16", strip && Math.abs(strip.x - 520) < 2 && Math.abs(strip.y - 16) < 2,
      strip ? `x${Math.round(strip.x)} y${Math.round(strip.y)} w${Math.round(strip.width)}` : "missing");

    const rail = await box('[class*="rail"]');
    check("HUD rail at x26 y132", rail && Math.abs(rail.x - 26) < 2 && Math.abs(rail.y - 132) < 2,
      rail ? `x${Math.round(rail.x)} y${Math.round(rail.y)}` : "missing");

    const tallies = await page.$$('[class*="stat"]');
    check("HUD renders 3 default tallies", tallies.length === 3, `${tallies.length} found`);

    const clock = await page.textContent('[class*="clock"]');
    check("HUD session clock ticking", /^\d{2}:\d{2}:\d{2}$/.test(clock?.trim() ?? ""), clock?.trim());

    const moonW = await page.evaluate(() => {
      const el = document.querySelector('[class*="fill"]');
      return el ? el.style.width : null;
    });
    check("HUD chat-energy meter filled by demo traffic", moonW && moonW !== "0%" && moonW !== "", moonW);

    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", "hud.png") });
    await page.close();
  }

  /* ── away scene ── */
  for (const [mode, wantTitle] of [
    ["brb", "Be right back"],
    ["soon", "Starting soon"],
    ["afk", "AFK"],
  ]) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`));
    await page.goto(url(`?mode=${mode}&min=5&demo=1`), { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const title = (await page.textContent('[class*="scTitle"]'))?.trim();
    check(`scene ?mode=${mode} headline`, title === wantTitle, title);

    const timer = (await page.textContent('[class*="scTimer"]'))?.trim();
    check(`scene ?mode=${mode} timer running`, /^\d{1,2}:\d{2}/.test(timer ?? ""), timer);

    const painted = await canvasPainted(page);
    check(`scene ?mode=${mode} canvas painting`, painted.found && painted.lit > 50,
      `${painted.lit}/${painted.sampled} lit samples`);

    const hudGone = await page.$('[class*="strip"]');
    check(`scene ?mode=${mode} does not draw the HUD`, hudGone === null);

    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", `${mode}.png`) });
    await page.close();
  }

  /* ── chill ── */
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`chill: ${e.message}`));
    await page.goto(url("?mode=chill&demo=1"), { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const painted = await canvasPainted(page);
    check("chill canvas painting", painted.found && painted.lit > 50, `${painted.lit} lit samples`);

    // the camera hole must be genuinely transparent, not painted over
    const hole = await page.evaluate(() => {
      const cv = document.querySelector("canvas");
      const g = cv.getContext("2d");
      // centre of the inscribed circle for CONFIG.camera [80,300,700,920]
      const d = g.getImageData(390, 610, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    });
    check("chill camera hole is cleared", hole.a < 250, `alpha ${hole.a}`);

    const noCountdown = await page.$('[class*="scTitle"]');
    check("chill hides the away countdown", noCountdown === null);

    const guide = await page.$('[class*="scGuide"]');
    check("chill shows the command guide", guide !== null);

    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", "chill.png") });
    await page.close();
  }

  /* ── guide overlay ── */
  {
    const page = await ctx.newPage();
    await page.goto(url("?mode=chill&guide=1&demo=1"), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const zones = await page.$$('[class*="zone"]');
    check("?guide=1 draws the chill keep-out boxes", zones.length === 4, `${zones.length} boxes`);
    await page.close();
  }

  /* ── the bus: admin panel ↔ a real overlay source ── */
  {
    const hud = await ctx.newPage();
    hud.on("pageerror", (e) => errors.push(`bus-hud: ${e.message}`));
    // A quiet source: ?live=1 turns the demo flood off, and stubbing the IRC
    // socket keeps the test off the network. Demo traffic would otherwise
    // saturate the queue and shed the low-priority `system` banner, so this
    // would be measuring the demo rather than the say path.
    await hud.routeWebSocket(/irc-ws\.chat\.twitch\.tv/, () => {});
    await hud.goto(url("?live=1"), { waitUntil: "networkidle" });

    const admin = await ctx.newPage();
    admin.on("pageerror", (e) => errors.push(`bus-admin: ${e.message}`));
    await admin.goto(url("admin/"), { waitUntil: "networkidle" });
    await admin.waitForTimeout(3000);

    const conn = (await admin.textContent('[class*="conn"]'))?.trim() ?? "";
    check("panel sees the overlay source", conn.includes("Connected"), conn.slice(0, 60));

    // the Milestones card also uses .verdict — take the one in Diagnostics
    const verdict = (await admin.locator('[class*="verdict"]').last().textContent())?.trim() ?? "";
    check("diagnostics verdict is Working", verdict.startsWith("Working"), verdict.slice(0, 60));

    // Watch every banner the HUD shows: demo traffic keeps firing fates, so a
    // single read after the fact races the queue rather than testing it.
    await hud.evaluate(() => {
      window.__seen = [];
      new MutationObserver(() => {
        const el = document.querySelector('[class*="oLine"]');
        if (el?.textContent) window.__seen.push(el.textContent);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    const sayBtn = admin.locator("button", { hasText: "Send" }).first();
    await admin.fill('input[placeholder="Message for the banner"]', "verify ping");
    await sayBtn.click();
    await admin.waitForTimeout(1400);

    const toast = (await admin.textContent('[class*="toast"]'))?.trim() ?? "";
    check("panel confirms delivery via ack", toast.startsWith("✓"), toast);

    await hud.waitForTimeout(1500);
    const seen = await hud.evaluate(() => window.__seen ?? []);
    check("overlay showed the panel's message", seen.some((t) => t.includes("verify ping")),
      seen.at(-1) ?? "no banner rendered");

    // tally bump round-trip
    const plus = admin.locator('[class*="tallyRow"] button', { hasText: "+" }).first();
    await plus.click();
    await admin.waitForTimeout(1400);
    const t2 = (await admin.textContent('[class*="toast"]'))?.trim() ?? "";
    check("tally bump reaches the source", t2.startsWith("✓"), t2);

    if (SHOTS) await admin.screenshot({ path: join(ROOT, ".verify", "admin.png"), fullPage: true });
    await hud.close();
    await admin.close();
  }

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (SHOTS) console.log("screenshots in .verify/");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
