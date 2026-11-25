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

5. **Starting-soon trailer** (optional) — a two-minute video that plays as the countdown reaches 2:00 and ends as it hits zero. See [Starting-soon trailer](#starting-soon-trailer).

Chat energy, the constellation and chill vibe persist across HUD / chill / away — every source writes a shared snapshot, so switching scenes does not empty the sky. Showing an away source still starts a fresh timer. Keep **Shutdown source when not visible** off.

If you use the HUD in more than one game scene (POE, LEAGUE, …), put the HUD browser source in its own scene and add that scene as a source in each game scene so you are not running two HUD copies.

After a deploy, right-click each browser source → **Refresh cache of current page**. The dock's Diagnostics section tells you whether storage is shared and whether sources are answering.

For phone or remote control, use the `!brb` / `!soon` / `!afk` / `!back` chat commands instead of the dock.

## URL params

| Param | Effect |
|---|---|
| `mode=afk` / `brb` / `soon` / `scene` | Full-screen away scene instead of the HUD |
| `mode=chill` | Camera-on chill scene (no countdown, chat effects, vibe layer) |
| `min=15` | Countdown minutes (with `mode=brb` or `mode=soon`) |
| `trailer=Scene%20Name` | With `mode=soon`: cut to that OBS scene when the countdown reaches the trailer's length |
| `lead=120` | Trailer length in seconds (with `trailer=` or `mode=trailer`) |
| `mode=trailer` | Transparent layer over the trailer video: countdown chip, then tonight's lab card |
| `card=113.6` | With `mode=trailer`: seconds in, when tonight's card comes up |
| `chip=0` | With `mode=trailer`: hide the countdown chip |
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
| `!fate` | Real-life oracle roll (per-viewer cooldown) |
| `!fatepoe` | Path of Exile oracle roll (shares the !fate cooldown) |
| `!1` / `!2` | Vote in an open poll |
| `!wave` | **Chill only** — comet across the sky with your name |
| `!heart` | **Chill only** — bloom your own star |
| `!moon` | **Chill only** — nudge the chat-energy ring |
| `!clip` | Play the least-shown clip from the dock library |

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

## Emoji balloons

Unicode emoji and Twitch emotes in chat float up from the bottom of the overlay as short-lived balloons — automatic, no command. Caps live in `CONFIG` (`balloonPerMessage`, `balloonMax`). The dock's **Balloons** button (or `!testalert balloon`) fires a burst. Third-party emotes (7TV / BTTV / FFZ) are not included.

## Clips

The dock's **Clips** section holds a rotation of Twitch clip links. Chat types `!clip` to play the one shown least often, as a picture-in-picture card. During gameplay the HUD plays it top right, under the lab card, covering the minimap while it runs. On the AFK / BRB / starting-soon or lounge source it plays over the moon. While `!brb` / `!soon` / `!afk` is up the HUD stands down, because it is layered over the away scene and the two would otherwise play together; `!back` hands clips back to the HUD.

Limits (in `CONFIG`): 2 minutes between any two clips, 15 minutes per viewer (mods skip that one), 8 per rolling hour. `!clip` is ignored while a clip is already up, while a banner or poll is showing, when the library is empty, or when the dock rotation switch is off. The away / lounge prompt only mentions `!clip` when something is actually in rotation.

Paste `clips.twitch.tv/…`, `twitch.tv/<chan>/clip/…`, or a bare slug. The HUD (the source with the token) fills in title and duration over the bus so the card knows when to leave.

## Support cards

A small card on the HUD, left of the camera by default, that rotates through reasons to subscribe. Manage it in the dock's **Support cards** section:

- **Cards on / Pause / Next ›** — hide them all, hold the current card, or skip ahead. The line under the buttons says what's on air and when it changes.
- **Seconds each, Left (x), Top (y)** — rotation speed and where the 320×176 card sits on the 1920×1080 stage. `?guide=1` draws the default spot.
- **The list** — tick a card in or out of rotation, ▲▼ to reorder, **Show** to put it up now for one full turn (even if its schedule says no). Click a card to edit it.
- **The editor** — a live preview of the real card, three layouts (*Tile*: one framed picture; *Art*: a picture fading in from the right; *Row*: up to three pictures with labels), kicker / title / body with length limits so nothing overflows (`**word**` is bold), an optional link line, and a schedule: every stream or lab nights (any, play or dev), weekdays, and a from/until date range. Lab nights follow the dock's lab for today, or the usual schedule when none is set.
- **Pictures** come from the shipped library, your sub badges (once the dock has a Twitch connection), uploads, or any `https://` image link. Uploads are kept in this OBS profile only, so use **Copy backup** and keep the text somewhere safe; **Restore…** brings it back.

Alert banners and polls open in the middle of the screen, so the card stays up through them.

## Tallies

The HUD's tally strip (default: Maps / Deaths / Mirrors) is editable from the dock's **Tallies** section — rename the label, rename the chat command, remove one, or add more. Each tally's command word doubles as its storage key (`maps` → `!map` and `!maps` both bump it). Changes push live to every open source and persist.

## Chill scene

`?mode=chill` is the camera-on "just chatting" scene. It keeps the away scene's starfield — every chatter becomes a named star, follows and subs fly comets — and drops the countdown, because you aren't going anywhere.

The source owns the whole 1920×1080 stage and clears a transparent hole for the camera behind it. The camera **frame is the circle inscribed** in `CONFIG.camera`'s bounding square; `?mode=chill&guide=1` draws it. Move it by editing `CONFIG.camera` in [`src/config/config.ts`](src/config/config.ts) — the keep-out zone follows automatically.

Unlike the away scene, **the HUD is not layered on top**, so the alert banner renders here instead, moved right to clear the camera. Away commands deliberately no-op on a chill source; it's a separate OBS scene you switch to.

**Vibe layer.** The palette and motion drift with chat: message rate drives intensity, and a small keyword dictionary nudges the mood between calm / cozy / funny / hype. Words are counted and discarded — no chat text is ever drawn, so there's nothing to moderate. Every mood stays inside the violet→rune ramp; ember stays reserved for gains (there's a test for it).

## Starting-soon trailer

The video is a local file, so OBS plays it from a **Media Source** on its own scene. The overlay does two things around it: the starting-soon source cuts to that scene at the right second, and a transparent layer over the video shows a small countdown and then tonight's lab.

**One-time setup**

1. Make a scene, for example `Starting Soon Trailer`, with these sources from bottom to top:
   - **`[Overlay] Starting Soon`** — *Add Existing*, the same source the Starting Soon scene uses. It keeps counting under the video and is what shows when the video ends.
   - **Media Source** — *Local File* = the trailer; **Loop** off; **Restart playback when source becomes active** on; **Show nothing when playback ends** on.
   - **Browser Source** — 1920×1080, fitted to the canvas, shutdown when not visible off:
     ```
     https://rawad663.github.io/twitch-overlay/?mode=trailer
     ```
2. On the existing `[Overlay] Starting Soon` source, add the scene name to the URL (spaces as `%20`) and set **Page permissions** to **Advanced access to OBS**. Without that permission OBS does not let a page change scenes, and nothing happens.
   ```
   …&mode=soon&trailer=Starting%20Soon%20Trailer
   ```

**What happens on a stream night**

- Start the countdown as usual. It must start with more than two minutes on it; a shorter one never plays the trailer.
- At 2:00 the overlay cuts to the trailer scene, which restarts the video. A chip in the top right keeps the countdown visible.
- For the last seconds, the layer covers the video's end card with **tonight's lab**: the headline and summary saved in the dock's Lab section, shown only on the lab's own Eastern date. With no lab saved for today, the video's own end card stays.
- When the video ends, the card stays up (or the starting-soon scene shows through) until you switch to your game scene.

Cutting to the trailer scene by hand plays the same thing: the layer keeps its own clock from the moment OBS shows it.

A different trailer length: put `&lead=<seconds>` on both URLs, and `&card=<seconds>` on the layer for where its end card begins. `?mode=trailer&card=2&lead=20` in a normal browser previews the card with a sample lab.

## Follow alerts and milestones

IRC covers chat, bits, subs, gifts and raids anonymously. Follow alerts and the HUD lifetime counters need a Twitch app + token.

Follow banners play a bright rising chime (live events and the dock's test follow use the same cue).
It respects the dock's volume and mute controls. Queued follows that merge into one banner play
one chime; hidden sources and away-scene layers stay silent for follows so they do not double the
visible HUD or Chill banner's sound. The cue is synthesized locally with no audio-file download.

The OBS dock's **Milestones** section builds the authorize URL. Copy it, open it in a **normal browser** (not the dock), and authorize as the channel owner. On the landing page choose **Copy token for OBS dock**, then paste it into **Twitch access token** in the OBS dock and select **Save token**. Twitch validates the account and follower permission; the matching public Client ID is filled automatically.

The token is saved once in OBS's shared local storage. Every loaded source reconnects automatically,
including the HUD's lifetime counters, without editing source URLs. After saving, remove `token`
and `client_id` from source URLs while keeping `mode` and other settings. When the token expires,
repeat authorization and save the replacement in the dock once. The password field clears after
save and never displays the stored token. Browser storage is unencrypted and local to the OBS
profile; a normal browser tab has separate storage and cannot configure OBS this way.

Existing token URLs remain a fallback until credentials are saved. Saved credentials override
URL credentials. **Remove saved token** clears the secret and leaves an empty authorization record
that disables even legacy URL tokens, so removing it cannot silently reactivate an old token.
Saving a new token reconnects the sources. If storage is blocked, the dock reports the failure;
it does not claim a successful save. Tokens never enter control messages, settings, or diagnostics.

- `moderator:read:followers` — follow alerts (EventSub)
- `channel:read:subscriptions` — sub milestone total
- Follower totals work with any valid token, even without those scopes

If test follows show but live follows do not, check **Sources → EventSub** in the OBS dock.
Tests bypass Twitch entirely; working follower totals also do not prove that follow alerts are authorized.
The source rendering the banner should report `live`. For `off` or `expired`,
authorize again as the channel owner with the Milestones URL and save the new token in the dock.
For `error`, follow the diagnostic message shown there (for example, a connection limit is not a token expiry).
Follow events are shared by all loaded sources. Only one authorized source connects to Twitch;
the others receive its events and status without opening more EventSub connections. All sources
with access to the saved credentials can take over when the current owner closes. The HUD uses
those same credentials for lifetime totals. Preserve each source's `mode` when updating URLs.
`connecting` means the listener is connecting or retrying. After deploying a listener fix,
use **Refresh cache of current page** on the OBS browser sources.

The shared listener uses an exclusive browser lock and automatically transfers ownership when
its source closes. Follow events use the control bus plus a short storage journal for OBS's polling
fallback; tokens are never broadcast or stored in that journal. This needs a current OBS browser
engine with Web Locks support and the HTTPS source URL. Missing support is reported in the dock
instead of opening independent listeners. Twitch connection and milestone errors appear only in
the admin dock, never on the stream. A 429 pauses subscription retries for 60 seconds.

Permanent authorization failures (subscription 401/403 or revocation) also release ownership.
The rejected source continues receiving shared events but cannot own the listener again until
its credentials change or the source reloads. This lets a source with valid legacy credentials
take over. Temporary connection failures and rate limits keep ownership while retrying. If all
sources share an expired token, renew it in the dock; switching owners cannot repair that token.

When upgrading from independent listeners, refresh **all** overlay sources (HUD, Chill, AFK,
Soon, and any duplicates) and the control dock so old connections close. Mixed builds can still
hit Twitch's connection limit. The shared-listener bus build is `bus-3`.

The Twitch app's redirect URI must be exactly `https://rawad663.github.io/twitch-overlay/`. Tokens expire and must be renewed; they live only in the OBS profile or legacy source URLs, never in the repo. An expired token only disables follow alerts and the milestone widget; everything else still works.

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): types, lint and unit tests gate the build, then the export is published to Pages.

**One-time setup:** repo Settings → Pages → Source → **GitHub Actions**.

## Verifying

Beyond `npm run check`, two browser harnesses run the real exported site (run `npm run build` first — both serve `./out`):

| Command | What it proves |
|---|---|
| `npm run verify` | Every mode renders, lanes land on their stage coordinates, the canvas paints, the camera hole is really transparent, and the dock drives a live source end to end |
| `npm run verify:follows` | Four clean-URL pages share one simulated Twitch connection, hand off on owner close, and keep errors off-stream; dock token save, renewal, persistence, invalid replacement, and removal work across all sources |
| `npm run compare` | Screenshots this build against the live production site (or `COMPARE_BASE_URL` if set) for every mode and reports the pixel delta into `.verify/compare/` |

`npm run verify:shots` writes PNGs to `.verify/`.

`npm run compare` is informational, not a gate — [`.github/workflows/compare.yml`](.github/workflows/compare.yml) runs it on every PR and uploads the screenshots + `report.md` as a build artifact so a reviewer can see a visual diff before merge; it never fails the build over a pixel difference, only over a real error.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the module map, the control-bus contract and the design rules.

## Lab command

In the OBS admin dock, set **Today's lab**, choose its Eastern date, and **Save lab**. On that date the HUD shows a lab card in the top right (between PoE2's boss bar and the minimap): the lab kind, the **Card headline**, the summary clamped to two lines, and a `!lab` prompt for newcomers. A headline alone is enough: leave the summary empty and the card shows just the headline, and `!lab` replies with it. Any other date hides it.
**Clear lab**, an empty headline and summary, or any other date makes `!lab` return the Mon/Wed/Thu 7–10 PM Eastern schedule. Summaries are limited to 400 characters; the preview shows the current reply.

Reauthorize Twitch using the Milestones authorization URL and save the new token in the dock. The added `user:write:chat` permission lets the overlay reply as rawad663. Existing follow/sub permissions are retained. Lab status appears in the lab section; tokens never enter the control bus.

Refresh the cache of every OBS source and the dock after deploying (bus-5). Keep at least one overlay source loaded. HUD, Lounge and away scenes advertise `!lab`; a shared browser lock and persisted 15-second cooldown prevent multiple sources answering together. If locks or storage are unavailable, replies fail closed. No backend or StreamElements command is required. Disable any existing StreamElements `!lab` to avoid two responders.
