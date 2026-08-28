/**
 * Proves the ported Bus is still wire-compatible with the original.
 *
 * The old rawad-overlay.html is served from the same origin as the new app, so
 * BroadcastChannel and localStorage are shared exactly as they are between an
 * OBS dock and its sources. If the new panel can drive the old overlay — and
 * the old panel can drive the new one — the contract survived the migration.
 *
 * Run `npm run build` first.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = join(ROOT, "out");
const BASE = "/twitch-overlay";
const PORT = 4321;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
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
      if (!file.startsWith(OUT) || !existsSync(file)) return res.writeHead(404).end("404");
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const url = (p) => `http://localhost:${PORT}${BASE}/${p}`;

  /* ── new panel → OLD overlay ── */
  {
    const legacy = await ctx.newPage();
    // quiet source — demo traffic would shed the low-priority `system` banner
    await legacy.routeWebSocket(/irc-ws\.chat\.twitch\.tv/, () => {});
    await legacy.goto(url("legacy/rawad-overlay.html?live=1"), { waitUntil: "networkidle" });

    const admin = await ctx.newPage();
    await admin.goto(url("admin/"), { waitUntil: "networkidle" });
    await admin.waitForTimeout(3000);

    const conn = (await admin.textContent('[class*="conn"]'))?.trim() ?? "";
    check("new panel sees the OLD overlay", conn.includes("Connected"), conn.slice(0, 48));

    // the old overlay writes its own ack — confirm the new panel counts it
    await admin.fill('input[placeholder="Message for the banner"]', "legacy interop");
    await admin.locator("button", { hasText: "Send" }).first().click();
    await admin.waitForTimeout(1400);
    const toast = (await admin.textContent('[class*="toast"]'))?.trim() ?? "";
    check("OLD overlay acks the new panel's command", toast.startsWith("✓"), toast);

    const line = (await legacy.textContent("#oLine").catch(() => "")) ?? "";
    check("OLD overlay rendered it", line.includes("legacy interop"), line.slice(0, 48));

    await legacy.close();
    await admin.close();
  }

  /* ── OLD panel → new overlay ── */
  {
    const overlay = await ctx.newPage();
    await overlay.routeWebSocket(/irc-ws\.chat\.twitch\.tv/, () => {});
    await overlay.goto(url("?live=1"), { waitUntil: "networkidle" });

    const legacyAdmin = await ctx.newPage();
    await legacyAdmin.goto(url("legacy/admin.html"), { waitUntil: "networkidle" });
    await legacyAdmin.waitForTimeout(3000);

    const conn = (await legacyAdmin.textContent("#conn"))?.trim() ?? "";
    check("OLD panel sees the new overlay", conn.includes("Connected"), conn.replace(/\s+/g, " ").slice(0, 48));

    await legacyAdmin.fill("#oracleLine", "old panel speaking");
    await legacyAdmin.click("#bSay");
    await legacyAdmin.waitForTimeout(1500);

    const toast = (await legacyAdmin.textContent("#toast"))?.trim() ?? "";
    check("new overlay acks the OLD panel", toast.startsWith("✓"), toast);

    const line = (await overlay.textContent('[class*="oLine"]').catch(() => "")) ?? "";
    check("new overlay rendered it", line.includes("old panel speaking"), line.slice(0, 48));

    await overlay.close();
    await legacyAdmin.close();
  }

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} interop checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
