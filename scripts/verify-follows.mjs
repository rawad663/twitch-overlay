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
async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "timed out waiting for Twitch subscription");
    await new Promise((done) => setTimeout(done, 50));
  }
}
try {
  const context = await browser.newContext();
  const errors = [];
  context.on("weberror", (event) => errors.push(String(event.error())));
  let subscriptions = 0;
  const usedTokens = [];
  const rejectedTokens = new Set();
  let rejectedSubscriptions = 0;
  await context.route("https://id.twitch.tv/oauth2/validate", async (route) => {
    const invalid = route.request().headers().authorization === "OAuth invalid-token";
    await route.fulfill({ status: invalid ? 401 : 200, contentType: "application/json", body: JSON.stringify({
      client_id: "test-client", user_id: "channel-id", login: "rawad663", expires_in: 3600,
      scopes: ["moderator:read:followers", "channel:read:subscriptions"],
    }) });
  });
  await context.route("https://api.twitch.tv/helix/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const subscription = path.endsWith("/eventsub/subscriptions");
    const rejected = subscription && rejectedTokens.has(route.request().headers().authorization);
    if (rejected) rejectedSubscriptions++;
    if (subscription && !rejected) {
      subscriptions++;
      usedTokens.push(route.request().headers().authorization);
    }
    await route.fulfill({
      status: rejected ? 403 : subscription ? 202 : 200,
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
    await page.goto(`${origin}/?live=1&mode=${mode}`);
    return page;
  }));
  const admin = await context.newPage();
  await admin.goto(`${origin}/admin/`);
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub off/g)?.length === 4);
  assert.equal(subscriptions, 0, "clean URLs must wait for authorization");
  await admin.getByLabel("Twitch access token", { exact: true }).fill("test-token");
  await admin.getByRole("button", { name: "Save token", exact: true }).click();
  await admin.getByText("Token saved. All loaded overlay sources will reconnect automatically.", { exact: true }).waitFor();
  assert.equal(await admin.getByLabel("Twitch access token", { exact: true }).inputValue(), "");
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 4);
  assert.equal(subscriptions, 1, "four sources must create one Twitch subscription");
  assert.equal(usedTokens[0], "Bearer test-token");
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
  await waitFor(() => subscriptions >= 2);
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 3);
  assert.equal(subscriptions, 2, "closing the owner must create one replacement subscription");
  const nextCounts = await Promise.all(remaining.map((page) => page.evaluate(() => window.testSockets.filter((s) => s.readyState === 1).length)));
  assert.equal(nextCounts.reduce((a, b) => a + b, 0), 1);
  const nextOwner = remaining[nextCounts.findIndex((count) => count === 1)];
  console.log("PASS: another source takes ownership after the owner closes");

  rejectedTokens.add("Bearer test-token");
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

  await admin.getByLabel("Twitch access token", { exact: true }).fill("replacement-token");
  await admin.getByRole("button", { name: "Save token", exact: true }).click();
  await waitFor(() => usedTokens.at(-1) === "Bearer replacement-token");
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 3);
  assert.equal(usedTokens.at(-1), "Bearer replacement-token");
  assert.equal(subscriptions, 3, "replacing an expired token must start one replacement listener");
  await admin.getByLabel("Twitch access token", { exact: true }).fill("invalid-token");
  await admin.getByRole("button", { name: "Save token", exact: true }).click();
  await admin.getByText("This token has expired or was revoked. Authorize Twitch again.", { exact: true }).waitFor();
  assert.equal(await admin.evaluate(() => JSON.parse(localStorage.getItem("rawad-twitch-auth")).token), "replacement-token");
  await admin.reload();
  assert.equal(await admin.getByLabel("Twitch access token", { exact: true }).inputValue(), "");
  await admin.getByText(/A token is saved in this browser profile/).waitFor();
  await remaining[0].reload();
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub live · shared/g)?.length === 3);
  assert.ok(remaining.every((page) => !page.url().includes("token=")));
  assert.equal(await admin.evaluate(() => {
    const keys = Object.keys(localStorage).filter((key) => key !== "rawad-twitch-auth");
    return keys.some((key) => /replacement-token|test-token/.test(localStorage.getItem(key)));
  }), false, "tokens must never enter the bus, settings, or diagnostic storage");
  console.log("PASS: saved credentials survive reload; renewal reconnects all sources; invalid replacement is rejected");

  await admin.getByRole("button", { name: "Remove saved token", exact: true }).click();
  await admin.waitForFunction(() => document.body.innerText.match(/EventSub off/g)?.length === 3);
  for (const page of remaining) {
    assert.equal(await page.evaluate(() => window.testSockets.filter((s) => s.readyState === 1).length), 0);
  }
  assert.equal(await admin.evaluate(() => JSON.parse(localStorage.getItem("rawad-twitch-auth")).token), "");
  assert.deepEqual(errors, []);
  console.log("PASS: removing stored credentials disconnects every source without a reload");

  // Legacy sources may carry different credentials. A rejected owner must not
  // keep the lock or repeatedly steal it from a source with working credentials.
  await admin.evaluate(() => localStorage.removeItem("rawad-twitch-auth"));
  rejectedTokens.add("Bearer rejected-legacy-token");
  const rejectedBefore = rejectedSubscriptions;
  const bad = await context.newPage();
  await bad.goto(`${origin}/?live=1&token=rejected-legacy-token&client_id=test-client`);
  await waitFor(() => rejectedSubscriptions > rejectedBefore);
  const successfulBefore = subscriptions;
  const healthy = await context.newPage();
  await healthy.goto(`${origin}/?live=1&mode=chill&token=healthy-legacy-token&client_id=test-client`);
  await waitFor(() => usedTokens.at(-1) === "Bearer healthy-legacy-token");
  assert.equal(subscriptions, successfulBefore + 1);
  await healthy.evaluate(() => window.testSockets.find((s) => s.readyState === 1).emit("notification", {
    subscription: { type: "channel.follow" }, event: { user_name: "FailoverViewer" },
  }, "failover-event"));
  await bad.getByText(/FailoverViewer/).first().waitFor();
  await healthy.getByText(/FailoverViewer/).first().waitFor();
  assert.equal(await bad.evaluate(() => window.testSockets.filter((s) => s.readyState === 1).length), 0);
  const failuresAfterTakeover = rejectedSubscriptions;
  await healthy.close();
  // Allow more than two election cycles to prove the rejected source stays out.
  await new Promise((done) => setTimeout(done, 4500));
  assert.equal(rejectedSubscriptions, failuresAfterTakeover);
  assert.deepEqual(errors, []);
  console.log("PASS: terminal authorization failure releases ownership; a healthy source delivers follows and the failed source cannot reclaim the lock");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
