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
  ".webp": "image/webp",
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
    const cardsFit = await page.locator('[class*="scGuideList"] > div').evaluateAll(cards => cards.some(card => card.textContent.includes('!lab')) && cards.length >= 6 && cards.length <= 7 && cards.every(card => { const r = card.getBoundingClientRect(); return r.x >= 760 && r.right <= 1861 && r.bottom <= 1030; }));
    check('Lounge command cards fit safe area including !lab', cardsFit);

    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", "chill.png") });
    await page.close();
  }

  /* ── guide overlay ── */
  {
    const page = await ctx.newPage();
    await page.goto(url("?mode=chill&guide=1&demo=1"), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const zones = await page.$$('[class*="zone"]');
    // 4 CHILL_ZONES + clip pip — chill is a scene, so Zones.tsx appends the pip
    check("?guide=1 draws the chill keep-out boxes", zones.length === 5, `${zones.length} boxes`);
    await page.close();
  }

  /* ── starting-soon trailer ── */
  {
    // the layer over the video: a countdown chip, then tonight's card on cue
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`trailer: ${e.message}`));
    await page.goto(url("?mode=trailer&lead=20&card=2"), { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const chip = (await page.textContent('[class*="chip"]'))?.trim();
    check("trailer layer opens on the countdown chip", /Live in\s*0:(19|20)/i.test(chip ?? ""), chip);
    const bg = await page.evaluate(() => [document.body, document.querySelector('[class*="root"]')].map((el) => getComputedStyle(el).backgroundColor).join(" | "));
    check("trailer layer is transparent over the video", bg === "rgba(0, 0, 0, 0) | rgba(0, 0, 0, 0)", bg);
    check("trailer layer does not start the overlay", (await page.$("canvas")) === null && (await page.$('[class*="strip"]')) === null);
    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", "trailer-chip.png"), omitBackground: true });
    await page.waitForTimeout(2600);
    const head = (await page.textContent('[class*="headline"]'))?.trim();
    check("trailer layer brings up tonight's card on cue", !!head && (await page.$('[class*="chip"]')) === null, head?.slice(0, 48));
    const foot = (await page.textContent('[class*="foot"]'))?.trim();
    check("tonight's card keeps counting down", /Live in\s*0:1\d/i.test(foot ?? ""), foot);
    const fits = await page.evaluate(() => {
      const r = (sel) => document.querySelector(`[class*="${sel}"]`).getBoundingClientRect();
      return r("summary").bottom < r("rule").top && r("headline").right <= 1920 - 100;
    });
    check("tonight's card text clears the footer", fits);
    const face = await page.evaluate(async () => {
      await document.fonts.ready;
      const el = document.querySelector('[class*="headline"]');
      return document.fonts.check(`900 80px ${getComputedStyle(el).fontFamily.split(",")[0]}`);
    });
    check("tonight's card is set in the trailer's typeface", face);
    if (SHOTS) await page.screenshot({ path: join(ROOT, ".verify", "trailer-card.png") });
    await page.close();

    // the trigger: the starting-soon source cuts to the trailer scene once, as
    // the countdown crosses the trailer's length. A stub stands in for OBS.
    const stub = () => {
      window.__cuts = [];
      window.obsstudio = { pluginVersion: "verify", setCurrentScene: (name) => window.__cuts.push(name) };
    };
    const soon = await ctx.newPage();
    soon.on("pageerror", (e) => errors.push(`trailer-trigger: ${e.message}`));
    await soon.addInitScript(stub);
    await soon.goto(url("?mode=soon&min=1&trailer=Starting%20Soon%20Trailer&lead=57&demo=1"), { waitUntil: "networkidle" });
    const early = await soon.evaluate(() => window.__cuts.length);
    await soon.waitForFunction(() => window.__cuts.length > 0, null, { timeout: 8000 }).catch(() => {});
    const timer = (await soon.textContent('[class*="scTimer"]'))?.trim();
    await soon.waitForTimeout(1500);
    const cuts = await soon.evaluate(() => window.__cuts);
    check("starting soon cuts to the trailer scene at the lead", early === 0 && cuts.length === 1 && cuts[0] === "Starting Soon Trailer" && /^00:5[67]$/.test(timer ?? ""),
      `${JSON.stringify(cuts)} at ${timer}`);
    await soon.close();

    const short = await ctx.newPage();
    await short.addInitScript(stub);
    await short.goto(url("?mode=soon&min=1&trailer=Starting%20Soon%20Trailer&demo=1"), { waitUntil: "networkidle" });
    await short.waitForTimeout(2000);
    check("a countdown shorter than the trailer never cuts", (await short.evaluate(() => window.__cuts.length)) === 0);
    await short.close();

    const off = await ctx.newPage();
    await off.addInitScript(stub);
    await off.goto(url("?mode=soon&min=1&lead=59&demo=1"), { waitUntil: "networkidle" });
    await off.waitForTimeout(2500);
    check("no ?trailer= means no scene cut", (await off.evaluate(() => window.__cuts.length)) === 0);
    await off.close();
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

    await admin.fill('#labTitle', 'Can a 1-div build clear T15?');
    await admin.fill('#labSummary', 'Compare two builds');
    await admin.getByRole('button', { name: 'Save lab', exact: true }).click();
    await admin.waitForTimeout(1000);
    check('lab save reaches overlay and persists', await hud.evaluate(() => JSON.parse(localStorage.getItem('rawad-settings')).labSummary === 'Compare two builds'));
    const card = hud.locator('[class*="labCard"]');
    check('lab card shows headline and summary', /1-div build/.test(await card.textContent()) && (await card.evaluate(el => getComputedStyle(el).opacity)) !== '0');
    const box = await card.boundingBox();
    check('lab card stays between boss bar and minimap', !!box && box.x >= 1250 && box.x + box.width <= 1630 && box.y + box.height <= 190, box ? `x${Math.round(box.x)} w${Math.round(box.width)} h${Math.round(box.height)}` : 'no box');
    check('strip hint is !fate again', (await hud.locator('[class*="quietHint"]').textContent()).includes('!fate'));
    await admin.fill('#labSummary', '');
    await admin.getByRole('button', { name: 'Save lab', exact: true }).click();
    await admin.waitForTimeout(1000);
    const headlineOnly = hud.locator('[class*="labCard"]');
    check('lab card shows with a headline and no summary', (await headlineOnly.evaluate(el => getComputedStyle(el).opacity)) !== '0' && /1-div build/.test(await headlineOnly.textContent()) && !(await hud.$('[class*="labSummary"]')));
    await admin.fill('#labDate', '2020-01-01');
    await admin.getByRole('button', { name: 'Save lab', exact: true }).click();
    await admin.waitForTimeout(1000);
    await hud.waitForTimeout(700);
    check('expired lab hides the card', (await hud.locator('[class*="labCard"]').evaluate(el => getComputedStyle(el).opacity)) === '0');
    await admin.getByRole('button', { name: 'Clear lab', exact: true }).click();
    await admin.waitForTimeout(1000);
    check('clear lab persists empty summary', await hud.evaluate(() => JSON.parse(localStorage.getItem('rawad-settings')).labSummary === ''));

    /* ── support cards ── */
    const sup = hud.locator('[class*="support"]').first();
    await hud.waitForTimeout(1200);
    const supBox = await sup.boundingBox();
    check('support card at its default spot, 320x176', !!supBox && Math.abs(supBox.x - 601) < 2 && Math.abs(supBox.y - 704) < 2 && Math.round(supBox.width) === 320 && Math.round(supBox.height) === 176,
      supBox ? `x${Math.round(supBox.x)} y${Math.round(supBox.y)} ${Math.round(supBox.width)}x${Math.round(supBox.height)}` : 'no box');
    check('support card shows a default card', (await sup.evaluate(el => getComputedStyle(el).opacity)) !== '0' && /\S/.test(await sup.textContent()), (await sup.textContent()).slice(0, 50));
    check('support card art loads from the shipped library', await hud.evaluate(async () => {
      const img = document.querySelector('[class*="supFrame"] img, [class*="supArt"]');
      if (!img) return false;
      if (!img.complete) await new Promise(r => img.addEventListener('load', r, { once: true }));
      return img.naturalWidth > 0;
    }));
    const badgesRow = admin.locator('[class*="cardRow"]', { hasText: 'Sub badges' });
    await badgesRow.getByRole('button', { name: 'Show', exact: true }).click();
    await admin.waitForTimeout(1400);
    check('dock Show puts that card on air', /badge grows/.test(await sup.textContent()));
    check('dock on-air line follows the HUD', /Sub badges/.test(await admin.locator('[role="status"][class*="cardAir"]').textContent()));
    await admin.locator('[class*="cardRow"]', { hasText: 'Got Prime' }).locator('[class*="cardInfo"]').click();
    await admin.fill('#cardTitle', 'Prime sub? Spend it here');
    await admin.getByRole('button', { name: 'Save card', exact: true }).click();
    await admin.waitForTimeout(1000);
    check('edited card persists for the HUD', await hud.evaluate(() => JSON.parse(localStorage.getItem('rawad-cards')).cards.some(c => c.title === 'Prime sub? Spend it here')));
    await admin.locator('[class*="cardRow"]', { hasText: 'Prime sub?' }).getByRole('button', { name: 'Show', exact: true }).click();
    await admin.waitForTimeout(1400);
    check('edited card shows on the HUD', /Spend it here/.test(await sup.textContent()));
    await admin.fill('#cardX', '500');
    await admin.waitForTimeout(1200);
    const moved = await sup.boundingBox();
    check('dock moves the card', !!moved && Math.abs(moved.x - 500) < 2, moved ? `x${Math.round(moved.x)}` : 'no box');
    await admin.getByRole('button', { name: 'Cards on', exact: true }).click();
    await admin.waitForTimeout(1200);
    check('Cards off hides it', (await sup.evaluate(el => getComputedStyle(el).opacity)) === '0');
    await admin.getByRole('button', { name: 'Cards off', exact: true }).click();
    if (SHOTS) await hud.screenshot({ path: join(ROOT, ".verify", "support-card.png"), clip: { x: 360, y: 670, width: 520, height: 230 } });

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

    const oracle = await hud.locator('[class*="oracle"]').first().boundingBox();
    check("banner is centred on the stage", !!oracle && Math.abs(oracle.x + oracle.width / 2 - 960) < 2 && oracle.y >= 400 && oracle.y <= 560,
      oracle ? `x${Math.round(oracle.x)} y${Math.round(oracle.y)} w${Math.round(oracle.width)}` : "no banner");
    check("support card stays up during a banner", (await hud.locator('[class*="support"]').first().evaluate(el => getComputedStyle(el).opacity)) !== "0");

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

  /* ── one !clip, two sources on air: the HUD layered over starting-soon ──
     Its own context, so storage starts empty: a moon left full by the demo
     pages would hold every !clip behind its banner. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    ctx.on("weberror", (e) => errors.push(String(e.error())));
    // seeded after the dock hydrates: its Clips section reads storage in a useState initializer
    const admin = await ctx.newPage();
    admin.on("pageerror", (e) => errors.push(`clip-admin: ${e.message}`));
    await admin.goto(url("admin/"), { waitUntil: "networkidle" });
    await admin.evaluate(() => {
      const clip = (slug) => ({ slug, title: slug, creator: "", duration: 20, thumb: "", enabled: true, addedAt: 1 });
      localStorage.setItem("rawad-clips", JSON.stringify({ v: 1, clips: [clip("VerifyClipA"), clip("VerifyClipB")] }));
      localStorage.removeItem("rawad-clip-limits");
      localStorage.removeItem("rawad-claims");
      localStorage.setItem("rawad-settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("rawad-settings") || "{}"), clipsEnabled: true }));
    });

    const quiet = async (q, tag) => {
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      await p.routeWebSocket(/irc-ws\.chat\.twitch\.tv/, () => {});
      await p.goto(url(q), { waitUntil: "networkidle" });
      // the seeded slugs aren't real, so a card closes as soon as its video fails: count mounts instead
      await p.evaluate(() => {
        window.__clips = 0;
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes)
            if (n instanceof Element && (n.matches('[class*="clipChip"]') || n.querySelector('[class*="clipChip"]'))) window.__clips++;
        }).observe(document.body, { childList: true, subtree: true });
      });
      return p;
    };
    const hud = await quiet("?live=1", "clip-hud");
    const soon = await quiet("?mode=soon&min=10&live=1", "clip-soon");
    await admin.waitForTimeout(2500);

    const runTest = async (line, { mod = false, user = "test_viewer" } = {}) => {
      await admin.fill("#testLine", line);
      await admin.fill('[aria-label="Viewer name"]', user);
      const box = admin.getByLabel("As mod");
      if ((await box.isChecked()) !== mod) await box.click();
      await admin.getByRole("button", { name: "Run", exact: true }).click();
      await admin.waitForTimeout(1900);
      return (await admin.locator('[class*="verdict"]', { hasText: line }).first().textContent()) ?? "";
    };
    const chips = async (p) => p.evaluate(() => {
      const n = window.__clips;
      window.__clips = 0;
      return n;
    });

    // Over gameplay a viewer's !clip is refused — and the HUD's refusal is final:
    // the away source, which can't prove it's hidden, must not play it instead.
    const r0 = await runTest("!clip");
    const [h0, s0] = [await chips(hud), await chips(soon)];
    check("viewer !clip over gameplay is mods-only", /HUD✕ over gameplay, !clip is for mods/.test(r0), r0.slice(0, 140));
    check("a refused HUD !clip plays nowhere", h0 + s0 === 0, `HUD ${h0} · away ${s0}`);

    const so1 = await runTest("!so friend");
    check("!so is Rawad only", /Rawad only/.test(so1), so1.slice(0, 100));
    const so2 = await runTest("!so friend", { user: "rawad663" });
    check("!so as Rawad reaches the lookup", /HUD✕ needs the Twitch sign-in/.test(so2), so2.slice(0, 140));

    // Neither source has been told anything by OBS: the claim alone keeps it to one.
    const r1 = await runTest("!clip", { mod: true });
    check("tester lists both sources for !clip", /HUD/.test(r1) && /Away scene/.test(r1), r1.slice(0, 120));
    const [h1, s1] = [await chips(hud), await chips(soon)];
    check("unconfirmed scene: one !clip plays exactly once", h1 + s1 === 1, `HUD ${h1} · away ${s1}`);
    check("unconfirmed scene: the HUD wins the claim", h1 === 1);

    const r2 = await runTest("!clip", { mod: true });
    check("second !clip names the gate that held it", /already playing|cooldown/.test(r2), r2.slice(0, 140));

    // OBS confirms the away source on air (what a scene switch does) — the HUD yields.
    await hud.evaluate(() => localStorage.removeItem("rawad-clip-limits"));
    await soon.evaluate(() => window.dispatchEvent(new CustomEvent("obsSourceVisibleChanged", { detail: { visible: true } })));
    await admin.waitForTimeout(2500);
    await chips(hud);
    await chips(soon);
    const r3 = await runTest("!clip", { mod: true });
    const [h3, s3] = [await chips(hud), await chips(soon)];
    check("HUD stands down once the away scene is confirmed on air", /HUD✕ another source has the clips/.test(r3), r3.slice(0, 120));
    check("confirmed scene: one !clip plays exactly once, on the away scene", s3 === 1 && h3 === 0, `HUD ${h3} · away ${s3}`);

    const r4 = await runTest("!wave");
    check("tester says !wave is lounge-only", /lounge/.test(r4), r4.slice(0, 120));
    await runTest("!fate");
    const r5 = await runTest("!fate");
    check("tester shows a !fate cooldown with time left", /cooling down for test_viewer — \d/.test(r5), r5.slice(0, 140));
    check("tester says why the viewer isn't told in chat", /viewer NOT told/.test(r5), r5.slice(0, 200));
    const r6 = await runTest("!maps");
    check("tester says tallies are mods-only", /mods \/ broadcaster only/.test(r6), r6.slice(0, 120));

    // the command list: each row's Test runs as whoever may use it
    const rowRun = async (usage) => {
      await admin.getByRole("button", { name: `Test ${usage}`, exact: true }).click();
      await admin.waitForTimeout(1900);
      return (await admin.locator('[class*="cmdRow"]', { hasText: usage }).first().textContent()) ?? "";
    };
    const rows = await admin.locator('[class*="cmdRow"]').count();
    check("dock lists the commands, tallies included", rows >= 18 && (await admin.locator('[class*="cmdName"]', { hasText: "!mirrors" }).count()) === 1, `${rows} rows`);
    const heads = await admin.locator('[class*="cmdGroupHead"]').allTextContents();
    check("commands are grouped by who can run them", heads.join("|") === "Anyone|Mods and you|You only", heads.join("|"));
    const rm = await rowRun("!mirrors");
    check("row Test runs a mod command as a mod", /Ran !mirrors/.test(rm) && /✓ mirrors \+1/.test(rm), rm.slice(0, 160));
    await admin.getByRole("button", { name: "Viewer", exact: true }).click();
    const rv = await rowRun("!mirrors");
    check("“Viewer” checks the command is refused", /mods \/ broadcaster only/.test(rv), rv.slice(0, 160));
    await admin.getByRole("button", { name: "Who can", exact: true }).click();
    await admin.getByRole("button", { name: "Test !so <channel>", exact: true }).click();
    check("!so row hands you the line to finish", (await admin.inputValue("#testLine")) === "!so " && (await admin.inputValue('[aria-label="Viewer name"]')) === "rawad663");
    if (SHOTS) await admin.locator("section", { hasText: "Every command, who can use it" }).screenshot({ path: join(ROOT, ".verify", "commands.png") });

    await ctx.close();
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
