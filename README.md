# RAWAD overlay

PoE-flavored Twitch overlay for [rawad663](https://twitch.tv/rawad663). Two static HTML files, no build, no server. Hosted on [GitHub Pages](https://rawad663.github.io/twitch-overlay/).

## Files

| File | Role |
|------|------|
| [`rawad-overlay.html`](rawad-overlay.html) | 1920×1080 overlay. Default is the HUD; `?mode=afk` / `?mode=brb` / `?mode=soon` is the full-screen away scene. |
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
   Use `?mode=afk` if you want elapsed time instead of a countdown, or `?mode=soon` for a starting-soon countdown. The dock’s **Starting soon** / **Start BRB** / **AFK** buttons switch the same source without changing the URL.
3. **Control dock** — View → Docks → Custom Browser Docks…
   ```
   https://rawad663.github.io/twitch-overlay/admin.html
   ```
   Opening that URL in Chrome will never connect — Chrome is a different browser and shares no storage with OBS. `file://` also blocks `localStorage`.

After a bus/code change, right-click each browser source → **Refresh cache of current page**. The dock’s Diagnostics section tells you whether storage is shared and whether sources are answering.

For phone or remote control, use the `!brb` / `!soon` / `!afk` / `!back` chat commands instead of the dock.

## URL params (`rawad-overlay.html`)

| Param | Effect |
|-------|--------|
| `mode=afk` / `brb` / `soon` / `scene` | Full-screen away scene instead of HUD |
| `min=15` | Countdown minutes (with `mode=brb` or `mode=soon`) |
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
| `!<command>` | Bump a tally, e.g. `!map` or `!maps` (both singular and plural work) |
| `!undo <command>` | Decrement a tally |
| `!set <command> <n>` | Set a tally |
| `!poll Question \| Yes \| No` | Open a 60s poll |
| `!endpoll` | Close the poll |
| `!say <text>` | Oracle banner |
| `!testalert [kind]` | Fake alert (`follow`, `welcome`, `sub`, `raid`, `burst`, …) |
| `!brb [minutes]` | Start BRB |
| `!soon [minutes]` | Start “starting soon” |
| `!afk` | Start AFK |
| `!back` | End away |

## Tallies

The HUD's tally strip (default: Maps / Deaths / Mirrors) is fully editable from the admin dock's **Tallies** section — rename the label, rename the chat command, remove a tally, or add new ones with **+ Add tally**. Each tally's command word doubles as its storage key (`maps` → `!map`/`!maps` both bump it); typing a new command auto-slugs it to lowercase letters/digits. Changes push live to every open source and persist like the other settings.

## New chatters

The first time each login sends a chat message in a session, the overlay fires a low-priority "welcome" banner (`!testalert welcome` to preview). It's session-only — resets when the HUD source reloads — and needs no token, since it's driven by IRC chat, not follows.

## Follow alerts and milestones

IRC covers chat, bits, subs, gifts, and raids anonymously. Follow alerts and the HUD lifetime counters need a Twitch app + token.

Normal path: the admin dock’s **Milestones** section builds the authorize URL. Copy it, open it in a **normal browser** (not the dock), allow, then paste the overlay’s generated OBS URL into the HUD browser source.

Fallback if no source is running:

```
https://id.twitch.tv/oauth2/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://rawad663.github.io/twitch-overlay/rawad-overlay.html
  &response_type=token
  &scope=moderator:read:followers+channel:read:subscriptions
```

- `moderator:read:followers` — follow alerts (EventSub)
- `channel:read:subscriptions` — sub milestone total
- Follower totals work with any valid token, even without those scopes

Redirect URI on the Twitch app must be the Pages overlay URL. Token lasts ~60 days and stays in the OBS source URL, never in the file. An expired token only disables follow alerts and the milestone widget; everything else still works.

HUD milestones are **lifetime** totals (e.g. `1,247 / 1,300 FOLLOWERS`) against targets set in the dock. The away scene’s Follows / Subs / Messages goals remain **session** counters from while you’re AFK.

## Preview

Open `rawad-overlay.html` in a browser. You get a backdrop and fake traffic. `?live=1` talks to the real channel. `?guide=1` shows the HUD lanes vs PoE UI.

Edit the `CONFIG` block at the top of the overlay script for channel, cooldowns, and defaults. Saved dock settings (`localStorage`) override URL params and `CONFIG`.
