"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRESENCE_KEY, type AlertKind, type HelloPayload, type Settings, type Totals } from "@/bus/types";
import { BUILD } from "@/bus/types";
import { writeJSON } from "@/bus/storage";
import { useBus, useInterval, useLatest } from "@/bus/useBus";
import { CONFIG, DEFAULT_SETTINGS } from "@/config/config";
import { loadSettings, mergeSettings, persistSettings } from "@/config/settings";

import type { OverlayParams } from "./hooks/useMode";
import { useStageScale } from "./hooks/useStageScale";
import { useMoon } from "./hooks/useMoon";
import { useTallies } from "./hooks/useTallies";
import { usePoll } from "./hooks/usePoll";
import { useCooldowns } from "./hooks/useCooldowns";

import { Director, type AlertEvent } from "./director/director";
import { Alerts } from "./director/alerts";
import { FATES, pick, esc } from "./director/copy";
import { Sound } from "./audio/sound";
import { Scene } from "./engine/scene";
import {
  SAVE_THROTTLE_MS,
  SessionLedger,
  loadSession,
  saveSession,
} from "./engine/session";
import type { SceneStatus } from "./engine/types";
import { Irc, type IrcStatus } from "./chat/irc";
import { handle } from "./chat/handle";
import { EventSub, type EventSubStatus } from "./twitch/eventsub";
import { Milestones, EMPTY_TOTALS } from "./twitch/milestones";
import { startDemo } from "./demo";

import { Rail } from "./components/Rail";
import { Strip } from "./components/Strip";
import { Goals } from "./components/Goals";
import { Poll } from "./components/Poll";
import { Oracle } from "./components/Oracle";
import { Zones } from "./components/Zones";
import { SceneLayer } from "./components/SceneLayer";
import { OAuthHelper } from "./components/OAuthHelper";
import s from "./overlay.module.css";

/** Shown for the frame or two before the engine emits its first snapshot. */
const IDLE_STATUS: SceneStatus = {
  state: "idle",
  kicker: "",
  title: "",
  timer: "",
  sub: "",
  over: false,
  goals: [],
};

export function OverlayApp({ params }: { params: OverlayParams }) {
  const { chill, scene, demo, mode, guide } = params;
  const stageStyle = useStageScale();
  // session start — a useState initializer, so the clock isn't read during render
  const [t0] = useState(() => Date.now());

  // sources report a role; the panel never does
  const bus = useBus(scene ? "scene" : "hud");

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [banner, setBanner] = useState<AlertEvent | null>(null);
  const [notice, setNotice] = useState("");
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus | null>(null);
  const [guideOn, setGuideOn] = useState(false);
  const [ircStatus, setIrcStatus] = useState<IrcStatus>(demo ? "demo" : "connecting");
  const [esStatus, setEsStatus] = useState<EventSubStatus>("off");

  const poll = usePoll();
  const tallies = useTallies(settings.tallyDefs);
  const { cooldown, clear: clearCooldown } = useCooldowns();

  /* ── settings: URL params seed, saved settings win ── */
  useEffect(() => {
    const seed: Settings = {
      ...DEFAULT_SETTINGS,
      ...(params.volume !== null ? { volume: params.volume } : {}),
      muted: params.muted,
    };
    setSettings(loadSettings(seed));
  }, [params.volume, params.muted]);

  /* ── long-lived objects ──
     Created once via a useState initializer rather than a lazy ref, so they
     never touch a ref during render. They own their own state and are driven
     imperatively; React only holds the handle. */
  const [sound] = useState(() => new Sound());
  useEffect(() => {
    sound.configure(settings.volume, settings.muted);
  }, [sound, settings.volume, settings.muted]);

  const [director] = useState(() => new Director((n) => sound.play(n)));

  useEffect(() => {
    const off = director.subscribe(setBanner);
    return () => void off();
  }, [director]);
  useEffect(() => () => director.destroy(), [director]);

  const sceneRef = useRef<Scene | null>(null);
  const milestonesRef = useRef<Milestones | null>(null);
  const [ledger] = useState(() => SessionLedger.from(loadSession()));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback(
    (who: string, line: string) => {
      director.push("system", who, esc(line));
    },
    [director],
  );

  const moon = useMoon({
    // the hint stays down while anything is queued, not just while animating
    suppressed: () => director.active() || !!poll.poll,
    onFull: (count) =>
      say("The moon is full.", `Chat lit it up — ${count} messages this minute.`),
    t0,
    initialBeats: ledger.beats,
  });

  const flushSession = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveSession(ledger.dump(moon.beats.current));
  }, [ledger, moon.beats]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      saveSession(ledger.dump(moon.beats.current));
    }, SAVE_THROTTLE_MS);
  }, [ledger, moon.beats]);

  const ping = useCallback(() => {
    moon.ping();
    scheduleSave();
  }, [moon.ping, scheduleSave]);

  /* Mood decay used to live on the chill canvas. The HUD has to keep scoring
     too, or Lounge would open calm after a hype PoE session. */
  useInterval(() => ledger.vibe.decay(), 2000);

  /* ── the scene engine ── */
  const onCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      if (!el) {
        sceneRef.current?.destroy();
        sceneRef.current = null;
        return;
      }
      const sc = new Scene({
        chill,
        mode,
        demo,
        minutes: params.minutes,
        beats: moon.beats.current,
        session: ledger,
        onStatus: (st) => {
          setSceneStatus(st);
          setGuideOn(sceneRef.current?.guideOn ?? false);
        },
      });
      sceneRef.current = sc;
      sc.mount(el);
    },
    [chill, mode, demo, params.minutes, moon.beats, ledger],
  );

  /* OBS hide/show. Showing a source is the one-click reset — it re-arms the
     countdown and replays the chill intro. Hidden sources keep running
     otherwise, so pausing here is what stops a hidden scene burning a core.
     Flush the sky first: OBS may destroy the page as soon as we go hidden. */
  useEffect(() => {
    const onVis = (e: Event) => {
      const detail = (e as CustomEvent<{ visible?: boolean }>).detail;
      const visible = detail ? detail.visible !== false : true;
      if (!visible) flushSession();
      sceneRef.current?.setVisible(visible);
    };
    window.addEventListener("obsSourceVisibleChanged", onVis);
    if (window.obsstudio) {
      window.obsstudio.onVisibilityChange = (v: boolean) => {
        if (!v) flushSession();
        sceneRef.current?.setVisible(!!v);
      };
    }
    return () => window.removeEventListener("obsSourceVisibleChanged", onVis);
  }, [flushSession]);

  useEffect(() => {
    const onHide = () => flushSession();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flushSession();
    };
  }, [flushSession]);

  /* ── alerts ── */
  const alerts = useMemo(
    () =>
      new Alerts(director, {
        note: (type, name) => sceneRef.current?.note(type, name),
        bump: (kind, n) => milestonesRef.current?.bump(kind, n),
      }),
    [director],
  );

  const fate = useCallback(
    (user: string) => {
      if (!cooldown("fate", user, CONFIG.fateCooldown)) return;
      say(`The moon answers ${user} —`, pick(FATES));
    },
    [cooldown, say],
  );

  const testAlert = useCallback(
    (kind: AlertKind, who: string) => {
      const u = who || "test_viewer";
      switch (kind) {
        case "follow":
          return void alerts.follow(u);
        case "welcome":
          return alerts.welcome(u);
        case "resub":
          return alerts.sub(u, 14);
        case "gift":
          return alerts.gift(u, "someone_else");
        case "massgift":
          return alerts.massGift(u, 20);
        case "raid":
          return alerts.raid(u, 137);
        case "cheer":
          return alerts.cheer(u, 250);
        case "bigcheer":
          return alerts.cheer(u, 5000);
        case "wave":
          return sceneRef.current?.wave(u);
        case "heart": {
          const first = sceneRef.current?.recent[0];
          if (first) sceneRef.current?.bloom(first);
          return;
        }
        case "moon":
          for (let i = 0; i < CONFIG.moonNudge; i++) ping();
          return;
        case "burst":
          // seven at once — the only way to actually see the queue behave
          alerts.follow(u);
          alerts.follow(u + "_2");
          alerts.sub(u, 1);
          alerts.cheer(u, 300);
          alerts.gift(u, "someone");
          alerts.raid(u, 42);
          alerts.massGift(u, 5);
          return;
        default:
          return alerts.sub(u, 1);
      }
    },
    [alerts, ping],
  );

  /* ── chat ── */
  const deps = useMemo(
    () => ({
      chill,
      ping,
      star: (login: string, name: string) => {
        ledger.star(login, name);
        sceneRef.current?.chat(login, name);
        scheduleSave();
      },
      vibe: (msg: string) => {
        ledger.note(msg);
        scheduleSave();
      },
      alerts: {
        welcome: (u: string) => alerts.welcome(u),
        sub: (u: string, m?: string | number) => alerts.sub(u, m),
        gift: (u: string, r?: string) => alerts.gift(u, r),
        massGift: (u: string, c?: string | number) => alerts.massGift(u, c),
        raid: (u: string, v?: string | number) => alerts.raid(u, v),
        cheer: (u: string, b?: string | number) => alerts.cheer(u, b),
      },
      scene: {
        wave: (n: string) => sceneRef.current?.wave(n),
        bloom: (l: string) => sceneRef.current?.bloom(l),
        brb: (m?: string) => sceneRef.current?.brb(m),
        soon: (m?: string) => sceneRef.current?.soon(m),
        afk: () => sceneRef.current?.afk(),
        back: () => sceneRef.current?.back(),
      },
      fate,
      say,
      testAlert,
      tally: { resolve: tallies.resolve, bump: tallies.bump, set: tallies.set },
      poll: {
        open: poll.open,
        close: poll.close,
        isOpen: poll.isOpen,
        vote: poll.vote,
      },
      firstMessage: (login: string) => {
        const first = ledger.see(login);
        if (first) scheduleSave();
        return first;
      },
      cooldown,
      moonHeadroom: () =>
        Math.max(0, CONFIG.fullMoonMessages - moon.beats.current.length - 1),
    }),
    [chill, ping, ledger, scheduleSave, alerts, fate, say, testAlert, tallies, poll, cooldown, moon],
  );

  // The IRC socket outlives any single render, so it reaches the current
  // dispatch table through a ref rather than being torn down per keystroke.
  const depsRef = useLatest(deps);

  /* ── live connections (or demo traffic) ── */
  useEffect(() => {
    if (demo) {
      setIrcStatus("demo");
      return startDemo({
        chill,
        deps: () => depsRef.current,
        scene: () => sceneRef.current,
      });
    }

    const irc = new Irc((m) => handle(m, depsRef.current), setIrcStatus);
    irc.connect();
    return () => irc.destroy();
  }, [demo, chill, depsRef]);

  useEffect(() => {
    if (demo || !params.token || !params.clientId) return;
    const auth = { token: params.token, clientId: params.clientId };
    const es = new EventSub(
      auth,
      CONFIG.channel,
      (u) => alerts.follow(u),
      setEsStatus,
      setNotice,
    );
    void es.start();
    return () => es.destroy();
  }, [demo, params.token, params.clientId, alerts]);

  /* Lifetime totals — HUD only. A scene source has no milestone widget, and
     two sources polling would double the API traffic for one number. */
  useEffect(() => {
    if (scene || demo || !params.token || !params.clientId) return;
    const m = new Milestones(
      { token: params.token, clientId: params.clientId },
      CONFIG.channel,
      setTotals,
      setNotice,
    );
    milestonesRef.current = m;
    void m.refresh();
    const id = setInterval(() => void m.refresh(), CONFIG.totalsPollSeconds * 1000);
    return () => {
      clearInterval(id);
      milestonesRef.current = null;
    };
  }, [scene, demo, params.token, params.clientId]);

  /* ── bus: commands in ── */
  useEffect(() => {
    if (!bus) return;
    const off = [
      bus.on("away.brb", (p) => sceneRef.current?.brb(p.minutes)),
      bus.on("away.soon", (p) => sceneRef.current?.soon(p.minutes)),
      bus.on("away.afk", () => sceneRef.current?.afk()),
      bus.on("away.back", () => sceneRef.current?.back()),
      bus.on("away.reset", () => sceneRef.current?.again()),
      bus.on("tally.bump", (p) => tallies.bump(p.key, parseInt(String(p.delta), 10) || 0)),
      bus.on("tally.set", (p) => tallies.set(p.key, Math.max(0, parseInt(String(p.value), 10) || 0))),
      bus.on("poll.open", (p) => poll.open(p.text || "Yes or no?", p.a || "Yes", p.b || "No")),
      bus.on("poll.close", () => {
        if (poll.isOpen()) poll.close();
      }),
      bus.on("alert.test", (p) => testAlert(p.kind || "sub", p.user || "test_viewer")),
      bus.on("oracle.say", (p) => {
        if (p.line) say(p.who || "Rawad says —", p.line);
      }),
      bus.on("oracle.fate", (p) => {
        const u = p.user || "the panel";
        clearCooldown("fate", u); // the panel shouldn't be rate-limited
        fate(u);
      }),
      bus.on("settings", (p) => {
        setSettings((cur) => {
          const next = mergeSettings(cur, p);
          persistSettings(next);
          return next;
        });
      }),
    ];
    return () => off.forEach((fn) => fn());
  }, [bus, tallies, poll, testAlert, say, fate, clearCooldown]);

  /* ── bus: status out ── */
  const hello = useCallback(() => {
    if (!bus) return;
    const sc = sceneRef.current;
    const payload: HelloPayload = {
      role: scene ? "scene" : "hud",
      mode: mode === "hud" ? "hud" : mode,
      demo,
      build: BUILD,
      irc: ircStatus,
      eventsub: esStatus,
      token: !!params.token,
      clientId: params.clientId,
      away: {
        state: sc?.state ?? (chill ? "chill" : "idle"),
        until: sc?.until ?? 0,
        since: sc?.since ?? t0,
        follows: sc?.follows ?? 0,
        subs: sc?.subs ?? 0,
        messages: sc?.messages ?? 0,
      },
      tally: tallies.counts,
      poll: poll.poll
        ? { open: true, a: poll.poll.a, b: poll.poll.b, left: poll.poll.left }
        : { open: false },
      settings,
      totals: scene ? undefined : totals,
    };
    bus.send("hello", payload);
  }, [bus, scene, mode, demo, ircStatus, esStatus, params, chill, t0, tallies.counts, poll.poll, settings, totals]);

  useEffect(() => {
    if (!bus) return;
    // answer a panel that just opened, rather than making it wait for the tick
    return bus.on("ping", () => hello());
  }, [bus, hello]);
  useInterval(hello, bus ? 2000 : null);
  useEffect(() => {
    hello();
  }, [hello]);

  /* A plain localStorage marker, independent of the bus. If the dock can read
     this, OBS shares storage between docks and sources and any failure is in
     the messaging; if it can't, storage is isolated and the bus can never
     work. That distinction is what the panel's diagnostics report. */
  useInterval(() => {
    writeJSON(PRESENCE_KEY, {
      role: scene ? "scene" : "hud",
      mode: mode === "hud" ? "hud" : mode,
      build: BUILD,
      ts: Date.now(),
    });
  }, 2000);

  /* Browsers refuse to start audio without a gesture. */
  useEffect(() => {
    const unlock = () => sound.ready();
    window.addEventListener("click", unlock, { once: true });
    return () => window.removeEventListener("click", unlock);
  }, [sound]);

  /* ── render ── */
  const bannerActive = !!banner;
  const pollOn = !!poll.poll;

  const rootClass = [
    s.root,
    demo && !scene ? s.bg : "",
    scene && !chill ? s.sceneBg : "",
    chill ? s.chillBg : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className={s.stage} style={stageStyle}>
        {guide && <Zones chill={chill} />}

        {/* The HUD belongs to its own source. In scene mode it simply isn't
            mounted — the away scene is layered UNDER the HUD in OBS, so
            drawing it twice would double every lane. */}
        {!scene && (
          <>
            <Rail t0={t0} />
            <Strip moon={moon} defs={settings.tallyDefs} counts={tallies.counts} hit={tallies.hit} />
            <Goals totals={totals} settings={settings} suppressed={bannerActive || pollOn} />
            <div className={`${s.notice} ${notice ? s.on : ""}`}>{notice}</div>
            <Poll poll={poll.poll} />
          </>
        )}

        {/* One mount only — swapping between two SceneLayers once the first
            status arrived would tear the canvas down and restart the engine. */}
        {scene && (
          <SceneLayer
            status={sceneStatus ?? IDLE_STATUS}
            mode={mode}
            chill={chill}
            guideOn={guideOn}
            onCanvas={onCanvas}
          />
        )}

        {/* Chill has no HUD layered over it, so the banner comes back here —
            moved right to clear the camera frame. */}
        {(!scene || chill) && <Oracle evt={banner} lowered={pollOn} chill={chill} />}
      </div>

      <OAuthHelper />
    </div>
  );
}
