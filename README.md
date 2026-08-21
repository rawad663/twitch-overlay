# RAWAD overlay

PoE-flavored Twitch overlay for [rawad663](https://twitch.tv/rawad663). Two static HTML files, no build, no server. Hosted on [GitHub Pages](https://rawad663.github.io/twitch-overlay/).

## Files

| File | Role |
|------|------|
| [`rawad-overlay.html`](rawad-overlay.html) | 1920×1080 overlay. Default is the HUD; `?mode=afk` / `?mode=brb` is the full-screen away scene. |
| [`admin.html`](admin.html) | Control panel. Same Pages origin as the overlay, but it only talks to sources when OBS opens it as a **Custom Browser Dock**. |

## OBS setup

All URLs are from `https://rawad663.github.io/twitch-overlay/`.

1. **HUD** — Browser Source, 1920×1080, shutdown when not visible off, **transparent**.
   ```
   https://rawad663.github.io/twitch-overlay/rawad-overlay.html
   ```
2. **Away scene** — second Browser Source, same size, layered **under** the HUD. Showing this source starts a fresh timer.
   ```
   https://rawad663.github.io/twitch-overlay/rawad-overlay.html?mode=brb
   ```
   Use `?mode=afk` if you want elapsed time instead of a countdown.
3. **Control dock** — View → Docks → Custom Browser Docks…
   ```
   https://rawad663.github.io/twitch-overlay/admin.html
   ```
   Opening that URL in Chrome will never connect — Chrome is a different browser and shares no storage with OBS. `file://` also blocks `localStorage`.

After a bus/code change, right-click each browser source → **Refresh cache of current page**. The dock’s Diagnostics section tells you whether storage is shared and whether sources are answering.

For phone or remote control, use the `!brb` / `!afk` / `!back` chat commands instead of the dock.

## URL params (`rawad-overlay.html`)

| Param | Effect |
|-------|--------|
| `mode=afk` / `brb` / `scene` | Full-screen away scene instead of HUD |
| `min=15` | BRB countdown minutes (with `mode=brb`) |
| `live=1` | Connect to Twitch even outside OBS (skips demo traffic) |
| `demo=1` | Force fake chat/alerts |
| `guide=1` | Draw PoE safe-zone boxes |
| `token=` / `client_id=` | Follow alerts (EventSub). Token stays in the OBS URL, never in the file |
| `volume=0.5` | Alert volume 0–1 |
| `mute=1` | Mute sounds |

Outside OBS, the overlay auto-demos unless you pass `?live=1`.

## Chat commands

**Anyone**

| Command | Action |
|---------|--------|
| `!fate` | Oracle roll (per-viewer cooldown) |
| `!1` / `!2` | Vote in an open poll |

**Mod / broadcaster**

| Command | Action |
|---------|--------|
| `!map` / `!death` / `!mirror` | Bump a tally (`maps` / `deaths` also work) |
| `!undo <key>` | Decrement a tally |
| `!set <key> <n>` | Set a tally |
| `!poll Question \| Yes \| No` | Open a 60s poll |
| `!endpoll` | Close the poll |
| `!say <text>` | Oracle banner |
| `!testalert [kind]` | Fake alert (`follow`, `sub`, `raid`, `burst`, …) |
| `!brb [minutes]` | Start BRB |
| `!afk` | Start AFK |
| `!back` | End away |

## Follow alerts

IRC covers chat, bits, subs, gifts, and raids anonymously. Follows need a Twitch app + token.

1. Create an app at [Twitch Developer Console](https://dev.twitch.tv/console/apps). Redirect URI = the Pages overlay URL.
2. Authorize with the implicit grant (`response_type=token`) so Twitch lands on the overlay with `#access_token=…`.
3. The overlay’s helper builds a ready-to-paste OBS URL (`?live=1&client_id=…&token=…`) and scrubs the token from the address bar.

Token lasts ~60 days. An expired token only disables follow alerts; everything else still works.

## Preview

Open `rawad-overlay.html` in a browser. You get a backdrop and fake traffic. `?live=1` talks to the real channel. `?guide=1` shows the HUD lanes vs PoE UI.

Edit the `CONFIG` block at the top of the overlay script for channel, cooldowns, and defaults. Saved dock settings (`localStorage`) override URL params and `CONFIG`.
