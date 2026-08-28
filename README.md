# RAWAD overlay

PoE-flavored Twitch overlay for [rawad663](https://twitch.tv/rawad663). A Next.js static export — no server, no database — deployed to [GitHub Pages](https://rawad663.github.io/twitch-overlay/) by GitHub Actions.

```bash
npm install
npm run dev        # http://localhost:3000/twitch-overlay/
npm run check      # types + lint + unit tests
npm run build      # static export into ./out
```

## Routes

| Route | Role |
|---|---|
| `/` | The 1920×1080 overlay. Default is the HUD; `?mode=afk` / `brb` / `soon` is the full-screen away scene; `?mode=chill` is the camera-on chill scene. Also the OAuth redirect target. |
| `/admin/` | Control panel. Same origin as the overlay, but it only reaches sources when OBS opens it as a **Custom Browser Dock**. |

## OBS setup

All URLs are from `https://rawad663.github.io/twitch-overlay/`.

1. **HUD** — Browser Source, 1920×1080, shutdown when not visible off, **transparent**.
   ```
   https://rawad663.github.io/twitch-overlay/
   ```
2. **Away scene** — second Browser Source, same size, layered **under** the HUD. Showing this source starts a fresh timer.
   ```
   https://rawad663.github.io/twitch-overlay/?mode=brb
   ```
   Use `?mode=afk` for elapsed time instead of a countdown, or `?mode=soon` for a starting-soon countdown. The dock's **Starting soon** / **Start BRB** / **AFK** buttons switch the same source without changing the URL.
3. **Chill scene** — its own scene, Browser Source at 1920×1080, **transparent**, with your camera source placed *behind* it. Do not layer the HUD on top.
   ```
   https://rawad663.github.io/twitch-overlay/?mode=chill
   ```
   The source punches a transparent hole for the camera. Add `&guide=1` once to draw the keep-out boxes and size the camera source to the circle. See [Chill scene](#chill-scene).
4. **Control dock** — View → Docks → Custom Browser Docks…
   ```
   https://rawad663.github.io/twitch-overlay/admin/
   ```
   Opening that URL in Chrome will never connect — Chrome is a different browser and shares no storage with OBS.

After a deploy, right-click each browser source → **Refresh cache of current page**. The dock's Diagnostics section tells you whether storage is shared and whether sources are answering.

For phone or remote control, use the `!brb` / `!soon` / `!afk` / `!back` chat commands instead of the dock.

## URL params

| Param | Effect |
|---|---|
| `mode=afk` / `brb` / `soon` / `scene` | Full-screen away scene instead of the HUD |
| `mode=chill` | Camera-on chill scene (no countdown, chat effects, vibe layer) |
| `min=15` | Countdown minutes (with `mode=brb` or `mode=soon`) |
| `live=1` | Connect to Twitch even outside OBS (skips demo traffic) |
| `demo=1` | Force fake chat/alerts |
| `guide=1` | Draw the keep-out boxes |
| `token=` / `client_id=` | Follow alerts and lifetime totals. Stays in the OBS URL, never in the repo |
| `volume=0.5` | Alert volume 0–1 |
| `mute=1` | Mute sounds |

Outside OBS the overlay auto-demos unless you pass `?live=1`. Saved dock settings override URL params.

## Chat commands

**Anyone**

| Command | Action |
|---|---|
| `!fate` | Oracle roll (per-viewer cooldown) |
| `!1` / `!2` | Vote in an open poll |
| `!wave` | **Chill only** — comet across the sky with your name |
| `!heart` | **Chill only** — bloom your own star |
| `!moon` | **Chill only** — nudge the chat-energy ring |

**Mod / broadcaster**

| Command | Action |
|---|---|
| `!<command>` | Bump a tally, e.g. `!map` or `!maps` (singular and plural both work) |
| `!undo <command>` | Decrement a tally |
| `!set <command> <n>` | Set a tally |
| `!poll Question \| Yes \| No` | Open a 60s poll |
| `!endpoll` | Close the poll |
| `!say <text>` | Oracle banner |
| `!testalert [kind]` | Fake alert (`follow`, `welcome`, `sub`, `raid`, `burst`, …) |
| `!brb [minutes]` / `!soon [minutes]` / `!afk` / `!back` | Away state |

## Tallies

The HUD's tally strip (default: Maps / Deaths / Mirrors) is editable from the dock's **Tallies** section — rename the label, rename the chat command, remove one, or add more. Each tally's command word doubles as its storage key (`maps` → `!map` and `!maps` both bump it). Changes push live to every open source and persist.

## Chill scene

`?mode=chill` is the camera-on "just chatting" scene. It keeps the away scene's starfield — every chatter becomes a named star, follows and subs fly comets — and drops the countdown, because you aren't going anywhere.

The source owns the whole 1920×1080 stage and clears a transparent hole for the camera behind it. The camera **frame is the circle inscribed** in `CONFIG.camera`'s bounding square; `?mode=chill&guide=1` draws it. Move it by editing `CONFIG.camera` in [`src/config/config.ts`](src/config/config.ts) — the keep-out zone follows automatically.

Unlike the away scene, **the HUD is not layered on top**, so the alert banner renders here instead, moved right to clear the camera. Away commands deliberately no-op on a chill source; it's a separate OBS scene you switch to.

**Vibe layer.** The palette and motion drift with chat: message rate drives intensity, and a small keyword dictionary nudges the mood between calm / cozy / funny / hype. Words are counted and discarded — no chat text is ever drawn, so there's nothing to moderate. Every mood stays inside the violet→rune ramp; ember stays reserved for gains (there's a test for it).

## Follow alerts and milestones

IRC covers chat, bits, subs, gifts and raids anonymously. Follow alerts and the HUD lifetime counters need a Twitch app + token.

The dock's **Milestones** section builds the authorize URL. Copy it, open it in a **normal browser** (not the dock), allow, then paste the overlay's generated OBS URL into the HUD browser source.

- `moderator:read:followers` — follow alerts (EventSub)
- `channel:read:subscriptions` — sub milestone total
- Follower totals work with any valid token, even without those scopes

The Twitch app's redirect URI must be exactly `https://rawad663.github.io/twitch-overlay/`. Tokens last ~60 days and stay in the OBS source URL, never in the repo. An expired token only disables follow alerts and the milestone widget; everything else still works.

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): types, lint and unit tests gate the build, then the export is published to Pages.

**One-time setup:** repo Settings → Pages → Source → **GitHub Actions**.

## Verifying

Beyond `npm run check`, three browser harnesses run the real exported site:

| Command | What it proves |
|---|---|
| `npm run verify` | Every mode renders, lanes land on their stage coordinates, the canvas paints, the camera hole is really transparent, and the dock drives a live source end to end |
| `npm run verify:interop` | The bus is still wire-compatible with the pre-migration HTML, in both directions |
| `npm run compare` | Screenshots the new app against the originals in `legacy/` and reports the pixel delta |

`npm run verify:shots` writes PNGs to `.verify/`. Run `npm run build` first — all three serve `./out`.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the module map, the control-bus contract and the design rules.

The [`legacy/`](legacy/) directory holds the two original single-file versions. They are the reference the comparison harness diffs against, and can be deleted once you're happy with the port.
