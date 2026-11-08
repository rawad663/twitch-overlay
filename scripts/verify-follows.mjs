/** Four exported overlay pages, real Web Locks/bus, simulated Twitch only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve("out");
const base = "/twitch-overlay";
const server = createServer(async (req, res) => {
  let path = new URL(req.url, "http://localhost").pathname.slice(base.length);
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(root + sep)) return res.writeHead(404).end();
  try {
    const data = await readFile(file);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
    res.setHeader("content-type", mime[extname(file)] ?? "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}${base}`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const errors = [];
  context.on("weberror", (event) => errors.push(String(event.error())));
  let subscriptions = 0;
  await context.route("https://api.twitch.tv/helix/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const subscription = path.endsWith("/eventsub/subscriptions");
    if (subscription) subscriptions++;
    await route.fulfill({
      status: subscription ? 202 : 200,
      contentType: "application/json",
      body: JSON.stringify(path.endsWith("/users") ? { data: [{ id: "channel-id" }] } : { data: [], total: 123 }),
    });
  });
  await context.addInitScript(() => {
    window.testSockets = [];
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      onmessage = null;
      onclose = null;
      onerror = null;
      onopen = null;
      constructor(url) {
        this.url = url;
        if (url.includes("eventsub")) {
          window.testSockets.push(this);
          setTimeout(() => this.emit("session_welcome", { session: { id: "test-session", keepalive_timeout_seconds: 60 } }), 20);
        }
        setTimeout(() => this.onopen?.(), 0);
      }
      send() {}
      close() { this.readyState = 3; }
      emit(type, payload, id) {
        this.onmessage?.({ data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) });
      }
    };
  });
  const pages = await Promise.all(["hud", "chill", "afk", "soon"].map(async (mode) => {
    const page = await context.newPage();
    await page.goto(`${origin}/?live=1&mode=${mode}&token=test-token&client_id=test-client`);
    return page;
  }));
  const admin = await context.newPage();
  await admin.goto(`${origin}/admin/`);
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 4);
  assert.equal(subscriptions, 1, "four sources must create one Twitch subscription");
  const counts = await Promise.all(pages.map((page) => page.evaluate(() => window.testSockets.filter((s) => s.readyState === 1).length)));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1);
  const ownerIndex = counts.findIndex((count) => count === 1);
  const owner = pages[ownerIndex];
  await owner.evaluate(() => {
    const socket = window.testSockets.find((s) => s.readyState === 1);
    const event = { subscription: { type: "channel.follow" }, event: { user_name: "SharedViewer" } };
    socket.emit("notification", event, "follow-once");
    socket.emit("notification", event, "follow-once");
  });
  for (const index of [0, 1]) await pages[index].getByText(/SharedViewer/).first().waitFor();
  console.log("PASS: one subscription across four pages; HUD and Chill both display the follow");

  await owner.close();
  const remaining = pages.filter((_, index) => index !== ownerIndex);
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 3);
  assert.equal(subscriptions, 2, "closing the owner must create one replacement subscription");
  const nextCounts = await Promise.all(remaining.map((page) => page.evaluate(() => window.testSockets.filter((s) => s.readyState === 1).length)));
  assert.equal(nextCounts.reduce((a, b) => a + b, 0), 1);
  const nextOwner = remaining[nextCounts.findIndex((count) => count === 1)];
  console.log("PASS: another source takes ownership after the owner closes");

  await nextOwner.evaluate(() => window.testSockets.find((s) => s.readyState === 1).emit("revocation", {
    subscription: { type: "channel.follow", status: "authorization_revoked" },
  }));
  await admin.getByText("⚠ Twitch authorization expired", { exact: true }).waitFor();
  await admin.getByText(/follow alerts revoked/).first().waitFor();
  for (const page of remaining) {
    assert.equal(await page.getByText(/follow alerts revoked|authorization expired/).count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: authorization errors appear only in the admin, never on the overlay");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
