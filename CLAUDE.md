# CLAUDE.md

Vanilla HTML/CSS/JS Twitch overlay. No build, no packages, no tests. Two files. Chat commands and OBS setup: see `README.md`.

## Files

- `rawad-overlay.html` — HUD (default) and AFK/BRB scene (`?mode=afk|brb|scene`). Twitch IRC, EventSub follows, Director, Scene canvas, Bus.
- `admin.html` — OBS Custom Browser Dock. Same GitHub Pages origin as the overlay; only works as a dock, never as a Chrome tab.

Hosted at `https://rawad663.github.io/twitch-overlay/`.

## Hard rules

- Keep `Bus` in both files byte-compatible (`v: 1`, `BUS_KEY = "rawad-control-msg"`, channel `rawad-control`). Any change to send/deliver/schema goes in both. Bump `BUILD` (currently `"bus-1"`) when the contract changes.
- Overlay sources auto-ack handled commands. The panel must **not** set `Bus.role` — otherwise it acks itself and delivery confirmation is a lie.
- Never put tokens or secrets in the HTML. Token is a URL query on the OBS source (`?token=` + `?client_id=`). `CONFIG.clientId` is the public app id only.
- Do not "fix" a disconnected admin by opening it in Chrome. Chrome is a different browser; no shared `localStorage` / BroadcastChannel with OBS CEF.
- `file://` blocks `localStorage`. Pages URLs are `https`.
- Do not add a build step, backend, TypeScript split, or sound files unless asked. Audio is synthesized via Web Audio.

## Architecture

```
Twitch IRC (justinfan*, tags+commands) ──► handle() ──► HUD / Scene
EventSub channel.follow (optional token) ──► alertFollow()
admin dock ── Bus (BC + storage + 500ms poll, deduped by id) ── overlay sources
```

- **IRC** reconnects every 4s. Follows are the one event IRC will not send; without a token that block no-ops.
- **Director** — one serial banner queue. Priority: raid 50 > massgift 45 > sub/gift 40 > bigcheer 35 > cheer 20 > follow 15 > system 10. Over `queueCap`, lowest prio is dropped; sub/gift/raid are never shed if they are the lowest remaining.
- **Scene** — canvas starfield. Pauses when OBS reports the source hidden (`obsstudio.onVisibilityChange`). Showing the source resets the timer. HUD lanes stay empty in scene mode (CSS hides `#rail`, `#strip`, `#poll`, `#oracle`, `#notice`).
- **Demo** — `!window.obsstudio && ?live !== 1`, or `?demo=1`. Fake traffic; no IRC.

### localStorage (`rawad-*`)

| Key | Writer | Purpose |
|-----|--------|---------|
| `rawad-control-msg` | Bus | Last bus message |
| `rawad-presence` | overlay, every 2s, **not** via Bus | Dock diagnostics: storage shared vs messaging dead |
| `rawad-tally` | HUD | `{ maps, deaths, mirrors }` |
| `rawad-settings` | overlay via panel `settings` | Volume, mute, goals — wins over URL/`CONFIG` |
| `rawad-clientid` | OAuth helper | Remembered public client id |

### Bus types

Panel → sources: `away.brb|afk|back|reset`, `tally.bump|set`, `poll.open|close`, `alert.test`, `oracle.say|fate`, `settings`, `ping`.

Sources → panel: `hello` (status heartbeat), `ack` `{ forId, forType, role }`.

Every source receives every command on purpose (HUD banner + scene shooting star stay in step). Inapplicable handlers no-op.

## Design

Tokens in `:root`: `--violet #7A2FF2`, `--deep #3D0F8A`, `--rune #A97BFF`, `--cream #F3EEE4`, `--ember #E8A33D`. **Ember is gains only** (subs, gifts, raids, big cheers). Follows stay violet.

1920×1080 stage, scaled to the source. HUD must stay out of PoE UI; scene must stay out of HUD lanes:

- strip `x520–1040 y16–92`
- rail `x26–82 y132–812`
- notice `x26–200 y96–112`
- banner `x470–1030 y620–822`

`?guide=1` draws those boxes.

## Conventions

- Edit `CONFIG` for channel/cooldowns/defaults. Everything else is the product.
- Comments explain how/why (OBS quirks, why ember is reserved). Do not add comments that summarize the change you just made.
- Match the file: section banners `/* ═══ */`, object modules (`Bus`, `Director`, `Scene`, `Sound`), no imports, defensive try/catch around storage.
- User-facing HTML goes through `esc()`.
- After bus changes, sources need **Refresh cache of current page** or they keep running pre-bus code. Diagnostics distinguish isolated storage vs stale cache.
