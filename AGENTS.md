# CLAUDE.md

Next.js static export (App Router, React 19, TypeScript, CSS Modules) for a Twitch overlay + OBS control dock. Deployed to GitHub Pages by Actions. Chat commands and OBS setup: see `README.md`.

Was two hand-written HTML files until v2 — see git history if you need the pre-migration reference.

## Layout

```
app/
  layout.tsx            next/font + tokens.css
  page.tsx              → src/overlay/Overlay        (the 1920×1080 overlay)
  admin/page.tsx        → src/admin/AdminPanel        (the OBS dock)
src/
  bus/                  the control-bus contract — ONE copy, shared by both routes
  design/               tokens.css · stage.ts (all geometry)
  config/               config.ts (CONFIG) · settings.ts · routes.ts
  overlay/
    engine/             scene.ts · vibe.ts · draw.ts · prompts.ts   ← no React in here
    director/           director.ts · tiers.ts · copy.ts · alerts.ts
    chat/               irc.ts · parse.ts · handle.ts
    twitch/             helix.ts · eventsub.ts · milestones.ts
    audio/sound.ts      Web Audio synthesis, no files
    hooks/ components/  OverlayApp.tsx wires it all together
  admin/                hooks/ + components/, AdminPanel.tsx
scripts/                verify · compare · diff-shots (Playwright)
```

## Hard rules

- **The Bus lives in `src/bus/` and only there.** It used to be duplicated by hand between two files; that is what the module exists to prevent. `BUS_KEY`, the channel name, `v: 1`, the id format, the 500ms poll and the 200→100 `seen` ring are the wire contract. Bump `BUILD` (currently `"bus-1"`) only when that contract actually changes.
- **The panel must not set `Bus.role`.** Sources set it and auto-ack; if the panel set one it would ack itself and delivery confirmation would be a lie.
- **Never put tokens or secrets in the repo.** The token is a URL query on the OBS source (`?token=` + `?client_id=`). `CONFIG.clientId` is the public app id only. Scopes: `moderator:read:followers` (follow alerts), `channel:read:subscriptions` (sub milestone). Follower totals work with any valid token.
- **Ember is gains only** — subs, gifts, raids, big cheers, completed goals. Follows stay violet. Reach it through `--accent-gain`, never `--ember` directly. `vibe.test.ts` enforces it for the mood palettes.
- **React never renders per frame.** The scene engine owns its own rAF loop and all particle state; it emits a status snapshot at ≤4Hz for the headline. Anything at 60fps belongs in `engine/`, not in a hook.
- `basePath` is `/twitch-overlay` — this is a project Pages site and Next's asset URLs are absolute.
- Do not "fix" a disconnected admin by opening it in Chrome. Chrome is a different browser; no shared `localStorage` or BroadcastChannel with OBS CEF.
- Do not add a backend or sound files unless asked.

## Architecture

```
Twitch IRC (justinfan*, tags+commands) ──► parse() ──► handle() ──► HUD / Scene
EventSub channel.follow (optional token) ──► Alerts.follow()
Helix followers + subscriptions poll 60s ──► Milestones (HUD only)
admin dock ── Bus (BC + storage + 500ms poll, deduped by id) ── overlay sources
```

- **Mode** — `useOverlayParams()` reads `window.location.search` through `useSyncExternalStore` after mount, not `useSearchParams`: every param is client-only and this keeps the static export free of a prerender bailout. It returns null until mounted, which doubles as "don't open sockets yet".
- **IRC** reconnects every 4s. Follows are the one event it will not send; without a token that block no-ops.
- **`handle()`** takes a `ChatDeps` object rather than importing modules. That is deliberate: the single-file version had `Moon → Director → Milestones → Moon` forward references that would be a circular import here. **The mod gate ordering is load-bearing** — `!fate`, `!wave`, `!heart`, `!moon`, `!1`, `!2` sit *above* `if (!m.mod) return`.
- **Director** — one serial banner queue. Priority raid 50 > massgift 45 > sub/gift 40 > bigcheer 35 > cheer 20 > follow 15 > welcome 12 > system 10, FIFO within a tier. Over `queueCap` the lowest is shed, except sub/gift/massgift/raid which are never shed. React subscribes to the current banner only; the `key` on the banner element restarts the unfurl animation (the old code forced a reflow).
- **Alerts** — merges Twitch's noise: queued follows collapse into one banner, a `submysterygift` suppresses its per-recipient `subgift`s for 15s, and repeat cheers from one user coalesce for 6s.
- **Milestones** — HUD lifetime totals vs dock targets. Scene sources don't poll. A 401 on subs while follows still works is read as a missing scope, not an expired token. Away-scene `goalFollows` / `goalSubs` / `goalMessages` stay session gains.
- **Scene** — canvas starfield in `engine/scene.ts`, mounted by `SceneLayer` via a ref. Pauses when OBS reports the source hidden; showing it re-arms the mode, which makes hide/show a one-click reset. `mount()` calls `setVisible(true)` so a fresh load and a re-show take the same path.
- **Chill** (`?mode=chill`) — a scene, so it inherits the no-Helix / no-milestones / `role: "scene"` gates for free. Differences: no HUD is layered, so the banner comes *back* (repositioned right) and the root goes transparent — the canvas paints the backdrop and clears a hole for the camera behind it. `state` is `"chill"`, and `brb/soon/afk/back` no-op so an away command can't half-render a countdown over the camera.
- **Vibe** — chill-only ambience. Intensity from the shared `beats` array; mood from a keyword tally that decays on a 2s timer and eases per frame. Counts words and discards them — chat text never reaches the canvas.
- **Demo** — `!window.obsstudio && ?live !== 1`, or `?demo=1`. Fake traffic, no IRC.

### The `beats` array

The moon's timestamp array is the one piece of shared mutable state. `useMoon` trims it **in place** and never reassigns it, because the scene engine and Vibe both hold a reference — swapping the array would leave them reading a frozen copy forever.

### localStorage (`rawad-*`)

| Key | Writer | Purpose |
|---|---|---|
| `rawad-control-msg` | Bus | Last bus message |
| `rawad-presence` | overlay, every 2s, **not** via Bus | Dock diagnostics: storage shared vs messaging dead |
| `rawad-tally` | HUD | `{ [key]: count }` |
| `rawad-settings` | overlay, on panel `settings` | Volume, mute, away goals, milestone targets, `tallyDefs` |
| `rawad-clientid` | OAuth helper + dock | Remembered public client id |

Every access goes through `src/bus/storage.ts` — OBS can block storage outright and a throw must never take a render down.

### Bus types

Panel → sources: `away.brb|soon|afk|back|reset`, `tally.bump|set`, `poll.open|close`, `alert.test`, `oracle.say|fate`, `settings`, `ping`.

Sources → panel: `hello` (2s heartbeat, plus HUD-only `totals`), `ack` `{ forId, forType, role }`.

Every source receives every command on purpose (HUD banner + scene shooting star stay in step). Inapplicable handlers no-op.

**The `settings` message is deliberately partial.** The panel has no UI for `brbMinutes` / `fullMoonMessages` / `bigCheer`, and `mergeSettings` only takes keys that are present and correctly typed, so those survive. Sending a full object would clobber them — there's a test.

## Design

Tokens in `src/design/tokens.css`: `--violet #7A2FF2`, `--deep #3D0F8A`, `--rune #A97BFF`, `--cream #F3EEE4`, `--ember #E8A33D` (via `--accent-gain`).

**All geometry lives in `src/design/stage.ts`** — the canvas draws, the star keep-out test and the `?guide=1` boxes read the same constants, so a lane can only move in one place. 1920×1080 stage, CSS-scaled to the source.

HUD must stay out of PoE's UI; the away scene must stay out of the HUD's lanes (it is layered underneath in OBS):

- strip `x520 y16 520×76` · goals `x520 y100 520×50` · rail `x26 y132 56×680` · notice `x26 y96` · banner `x470 y620 560×202`

Chill has no HUD over it, so it uses its own set (`CONFIG.camera` drives the first):

- title stack `x80 y60 620×216` · camera `x80 y300 620×620` (the **circle inscribed** in that square: cx390 cy610 r310) · banner `x860 y690 700×160` · guide/prompt `x760 y856 1100×174` · moon `cx1420 cy360 r190`

`?guide=1` draws them (`?mode=chill&guide=1` for the chill set).

## Conventions

- Edit `CONFIG` in `src/config/config.ts` for channel/cooldowns/copy. Everything else is the product.
- Comments explain how/why (OBS quirks, why ember is reserved, why an ordering is load-bearing). Do not add comments that summarise the change you just made.
- Chat-sourced strings go through `esc()` before any `dangerouslySetInnerHTML`. Only `director/copy.ts` output and the author-written prompt arrays are allowed near it.
- Effects that open sockets or start timers must be idempotent — StrictMode double-mounts them in dev, and OBS re-shows sources in production.
- `eslint.config.mjs` downgrades four React Compiler rules to warnings, with the reasoning inline. Everything else, including `rules-of-hooks` and `exhaustive-deps`, is an error.
- After a deploy, sources need **Refresh cache of current page** or they keep running the old bundle. Diagnostics distinguishes isolated storage from a stale cache.
