"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PRESENCE_KEY,
  type AlertKind,
  type CommandOutcome,
  type HelloPayload,
  type Settings,
  type SourceView,
  type Totals,
} from "@/bus/types";
import { BUILD } from "@/bus/types";
import { writeJSON } from "@/bus/storage";
import { SharedFollows } from "@/bus/follows";
import { effectiveCredentials } from "@/bus/credentials";
import { useCredentialsSnapshot } from "@/bus/useCredentials";
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
import { FATES, FATES_POE, pick, esc } from "./director/copy";
import { Sound } from "./audio/sound";
import { Scene } from "./engine/scene";
import { BalloonField } from "./engine/balloons";
import {
  SAVE_THROTTLE_MS,
  SessionLedger,
  loadSession,
  saveSession,
} from "./engine/session";
import type { SceneStatus } from "./engine/types";
import { Irc, type IrcStatus } from "./chat/irc";
import { LabChat } from "./chat/lab";
import { labActive } from "@/config/lab";
import { handle, type ChatDeps } from "./chat/handle";
import type { ChatMessage } from "./chat/parse";
import { claimOnce, formatLeft } from "./claim";
import type { BalloonGlyph } from "./chat/emotes";
import { EventSub, type EventSubStatus } from "./twitch/eventsub";
import { Milestones, EMPTY_TOTALS } from "./twitch/milestones";
import { startDemo } from "./demo";

import { Rail } from "./components/Rail";
import { Strip } from "./components/Strip";
import { LabCard } from "./components/LabCard";
import { Goals } from "./components/Goals";
import { Poll } from "./components/Poll";
import { Oracle } from "./components/Oracle";
import { Zones } from "./components/Zones";
import { SceneLayer } from "./components/SceneLayer";
import { BalloonLayer } from "./components/BalloonLayer";
import { ClipPlayer } from "./components/ClipPlayer";
import { OAuthHelper } from "./components/OAuthHelper";
import { useClips } from "./clips/useClips";
import { useSupportCards } from "./cards/useSupportCards";
import { cardSrcs, useCardImageUrls } from "./cards/images";
import { SupportCard } from "./components/SupportCard";
import { fetchClip, fetchShoutout } from "./twitch/helix";
import { trailerDue } from "./trailer/trailer";
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
  const storedCredentials = useCredentialsSnapshot();
  const { token, clientId } = effectiveCredentials(storedCredentials, params);
  const { chill, scene, demo, mode, guide } = params;
  const stageStyle = useStageScale();
  // session start — a useState initializer, so the clock isn't read during render
  const [t0] = useState(() => Date.now());

  // sources report a role; the panel never does
  const bus = useBus(scene ? "scene" : "hud");

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [banner, setBanner] = useState<AlertEvent | null>(null);
  const [labNotice, setLabNotice] = useState("");
  const labChat = useRef<LabChat | null>(null);
  const [labNow, setLabNow] = useState(() => new Date());
  useInterval(() => setLabNow(new Date()), 1000);
  const activeLab = labActive(settings, labNow);
  const [notice, setNotice] = useState("");
  const [followNotice, setFollowNotice] = useState("");
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus | null>(null);
  const [guideOn, setGuideOn] = useState(false);
  const [ircStatus, setIrcStatus] = useState<IrcStatus>(demo ? "demo" : "connecting");
  const [esStatus, setEsStatus] = useState<EventSubStatus>("off");

  const poll = usePoll();
  const tallies = useTallies(settings.tallyDefs);
  const { cooldown } = useCooldowns();
  const [sceneVisible, setSceneVisible] = useState(true);
  // true once OBS has actually reported visibility (see HelloPayload.visibleKnown)
  const [visKnown, setVisKnown] = useState(false);
  const where: SourceView = chill ? "chill" : scene ? "away" : "hud";
  /* The HUD is layered over the away scene in OBS, so while brb / soon / afk
     is up both sources are on air. The HUD stands down then and the moon's
     pip takes clips; otherwise two cards would play with doubled audio. */
  const [awayUp, setAwayUp] = useState(false);
  /* …and the dock is not the only way an away scene gets on air: an OBS scene
     switch, a `?mode=soon` URL or a HUD reload all bypass it. So the HUD also
     listens to the scene sources' heartbeat and yields to any that OBS has
     confirmed visible. */
  const sceneBeats = useRef(new Map<string, { onAir: boolean; at: number }>());
  const [sceneOnAir, setSceneOnAir] = useState(false);
  useEffect(() => {
    if (!bus || scene) return;
    return bus.on("hello", (p, msg) => {
      if (p.role !== "scene" || !p.visibleKnown) return;
      sceneBeats.current.set(msg.from, { onAir: !!p.visible, at: Date.now() });
    });
  }, [bus, scene]);
  useInterval(
    () => {
      const now = Date.now();
      let on = false;
      for (const [id, b] of sceneBeats.current) {
        if (now - b.at > 6000) sceneBeats.current.delete(id);
        else if (b.onAir) on = true;
      }
      setSceneOnAir(on);
    },
    scene ? null : 1000,
  );

  const clips = useClips({
    canShow: scene || (!awayUp && !sceneOnAir),
    preferred: scene ? visKnown : true,
    modsOnly: !scene,
    visible: sceneVisible,
    bannerActive: !!banner,
    pollOpen: !!poll.poll,
    clipsEnabled: settings.clipsEnabled,
    cooldown,
  });

  const cards = useSupportCards(settings, labNow);
  const { replace: replaceCards, show: showCard, next: nextCard, snapshot: cardSnapshot } = cards;
  const cardsOn = cards.library.on;
  const [cardRev, setCardRev] = useState(0);
  const cardUrls = useCardImageUrls(cardSrcs(cards.library.cards), { token, clientId }, cardRev);

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
  const afkReasonRef = useRef(settings.afkReason);
  afkReasonRef.current = settings.afkReason;

  const [director] = useState(() => new Director((n) => sound.play(n)));
  const [balloons] = useState(() => new BalloonField());

  useEffect(() => {
    const off = director.subscribe(setBanner);
    return () => void off();
  }, [director]);
  useEffect(() => () => director.destroy(), [director]);
  useEffect(() => () => balloons.destroy(), [balloons]);

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
      sc.setAfkReason(afkReasonRef.current);
      sc.mount(el);
    },
    [chill, mode, demo, params.minutes, moon.beats, ledger],
  );

  useEffect(() => {
    sceneRef.current?.setAfkReason(settings.afkReason);
  }, [settings.afkReason]);

  /* OBS hide/show. Showing a source is the one-click reset — it re-arms the
     countdown and replays the chill intro. Hidden sources keep running
     otherwise, so pausing here is what stops a hidden scene burning a core.
     Flush the sky first: OBS may destroy the page as soon as we go hidden. */
  useEffect(() => {
    // Every source receives follows; only the visible banner source should sound.
    sound.setFollowVisible(!scene || chill);
    const onVis = (e: Event) => {
      const detail = (e as CustomEvent<{ visible?: boolean }>).detail;
      const visible = detail ? detail.visible !== false : true;
      sound.setFollowVisible((!scene || chill) && visible);
      setSceneVisible(visible);
      setVisKnown(true);
      if (!visible) flushSession();
      sceneRef.current?.setVisible(visible);
      balloons.setVisible(visible);
    };
    window.addEventListener("obsSourceVisibleChanged", onVis);
    if (window.obsstudio) {
      window.obsstudio.onVisibilityChange = (v: boolean) => {
        sound.setFollowVisible((!scene || chill) && !!v);
        setSceneVisible(!!v);
        setVisKnown(true);
        if (!v) flushSession();
        sceneRef.current?.setVisible(!!v);
        balloons.setVisible(!!v);
      };
    }
    return () => window.removeEventListener("obsSourceVisibleChanged", onVis);
  }, [flushSession, balloons, sound, scene, chill]);

  /* The starting-soon trailer. The video is a Media Source on its own OBS
     scene, so "play it at two minutes" is a scene cut, and the cut has to land
     on the tick the countdown crosses the trailer's length for the video to
     end at zero. Watched on a short timer of its own: the engine's status
     snapshot is too coarse, and its rAF stops while the source is hidden. */
  const trailer = params.trailer;
  const trailerSeen = useRef<{ until: number; left: number | null }>({ until: 0, left: null });
  useInterval(() => {
    const sc = sceneRef.current;
    if (!trailer || !sc || !sceneVisible || sc.state !== "soon" || !sc.until) {
      trailerSeen.current = { until: 0, left: null };
      return;
    }
    const left = sc.until - Date.now();
    // a re-armed countdown is a new one: it has to cross the line itself
    const prev = trailerSeen.current.until === sc.until ? trailerSeen.current.left : null;
    trailerSeen.current = { until: sc.until, left };
    if (trailerDue(prev, left, trailer.leadMs)) window.obsstudio?.setCurrentScene?.(trailer.scene);
  }, trailer ? 100 : null);

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

  // the per-viewer gate lives in handle(), so the dock's button is never rate-limited
  const rollFate = useCallback(
    (user: string, lines: readonly string[]) => {
      say(`The moon answers ${user} —`, pick(lines));
    },
    [say],
  );
  const fate = useCallback((user: string) => rollFate(user, FATES), [rollFate]);
  const fatePoe = useCallback((user: string) => rollFate(user, FATES_POE), [rollFate]);

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
        case "balloon":
          return balloons.spawn(
            ["🔥", "😂", "💜", "⭐", "🌙", "🎉"].map((text) => ({ kind: "emoji" as const, text })),
          );
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
    [alerts, ping, balloons],
  );

  /* ── !so ──
     Goes wherever clips go right now (HUD over gameplay, the moon when an
     away / lounge source is on air), claimed so exactly one source looks the
     channel up, plays the clip and posts the line. */
  const clipOwner = useLatest({
    canShow: scene || (!awayUp && !sceneOnAir),
    visible: sceneVisible,
    preferred: scene ? visKnown : true,
  });
  const playShoutout = clips.playShoutout;
  const shoutout = useCallback(
    async (login: string, msgId: string, test = false): Promise<CommandOutcome> => {
      const no = (text: string): CommandOutcome => ({ cmd: "so", ok: false, text });
      const own = clipOwner.current;
      if (!own.canShow) return no("the away / lounge source on air does it");
      if (!own.visible) return no("this source is hidden in OBS");
      if (!own.preferred) await new Promise((r) => setTimeout(r, 400));
      if (!(await claimOnce(`so:${msgId || Math.random().toString(36)}`))) {
        return { cmd: "so", ok: true, text: "another source is doing it" };
      }
      if (!token || !clientId) return no("needs the Twitch sign-in (Milestones) to look the channel up");
      const so = await fetchShoutout({ token, clientId }, login);
      if (!so) return no(`no Twitch channel called "${login}" (or Twitch didn't answer)`);

      const line = `Go check out ${so.name} at https://twitch.tv/${so.login}${so.game ? ` — they were last playing ${so.game}` : ""}!`;
      if (so.clip) playShoutout(so.clip, { login: so.login, name: so.name, game: so.game });
      else say("Go check them out —", `${so.name} · twitch.tv/${so.login}${so.game ? ` · ${so.game}` : ""}`);

      const lab = labChat.current;
      const blocked = lab ? lab.blocked() : "demo mode";
      let chat: string;
      if (blocked) chat = `chat line NOT sent: ${blocked}`;
      else if (test) chat = "chat line ready (not sent from the tester)";
      else {
        void lab!.say(line);
        chat = "chat line sent";
      }
      const shown = so.clip ? `playing “${so.clip.title}”` : "they have no clips — banner instead";
      return { cmd: "so", ok: true, text: `shoutout to ${so.name} — ${shown} · ${chat}` };
    },
    [clipOwner, token, clientId, playShoutout, say],
  );

  /* ── chat ── */
  const deps = useMemo(
    (): ChatDeps => ({
      chill,
      where,
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
      balloons: (glyphs: BalloonGlyph[]) => balloons.spawn(glyphs),
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
        // the HUD has no scene, but it still has to hand clips over
        brb: (m?: string) => {
          setAwayUp(true);
          sceneRef.current?.brb(m);
        },
        soon: (m?: string) => {
          setAwayUp(true);
          sceneRef.current?.soon(m);
        },
        afk: () => {
          setAwayUp(true);
          sceneRef.current?.afk();
        },
        back: () => {
          setAwayUp(false);
          sceneRef.current?.back();
        },
      },
      fate,
      fatePoe,
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
      clip: clips.request,
      lab: (msgId: string): CommandOutcome => {
        const lab = labChat.current;
        if (!lab) return { cmd: "lab", ok: false, text: "chat replies are off in demo mode" };
        const blocked = lab.blocked();
        if (blocked) return { cmd: "lab", ok: false, text: blocked };
        const left = lab.labLeft();
        // no leftMs: the answer is already sitting in chat, a "cooldown" reply would be noise
        if (left) return { cmd: "lab", ok: false, text: `answered ${formatLeft(15000 - left)} ago — next answer in ${formatLeft(left)}` };
        void lab.reply(msgId);
        return { cmd: "lab", ok: true, text: "replying in chat" };
      },
      shoutout: (login: string, msgId: string) => shoutout(login, msgId),
    }),
    [shoutout, chill, where, ping, ledger, scheduleSave, alerts, fate, fatePoe, say, testAlert, tallies, poll, cooldown, moon, clips.request, balloons],
  );

  /** A viewer whose command is held by a timer hears so in chat, threaded under their message. */
  const tellViewer = useCallback((m: ChatMessage, o: CommandOutcome | null) => {
    if (!o?.leftMs || !m.id) return;
    void labChat.current?.cooldownReply(
      m.id,
      m.login,
      o.cmd,
      `@${m.user} !${o.cmd} is on cooldown — try again in ${formatLeft(o.leftMs)}`,
    );
  }, []);

  // The IRC socket outlives any single render, so it reaches the current
  // dispatch table through a ref rather than being torn down per keystroke.
  const depsRef = useLatest(deps);

  useEffect(() => {
    if (demo) return;
    const responder = new LabChat({ token, clientId }, CONFIG.channel, setLabNotice);
    labChat.current = responder;
    void responder.start();
    return () => { responder.destroy(); labChat.current = null; };
  }, [demo, token, clientId]);

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

    const irc = new Irc((m) => {
      const r = handle(m, depsRef.current);
      if (r && m.kind === "chat") void Promise.resolve(r).then((o) => tellViewer(m, o));
    }, setIrcStatus);
    irc.connect();
    return () => irc.destroy();
  }, [demo, chill, depsRef, tellViewer]);

  useEffect(() => {
    if (demo || !bus) return;
    const auth = { token, clientId };
    const shared = new SharedFollows(
      bus,
      CONFIG.channel,
      !!(auth.token && auth.clientId),
      (sink) => {
        const es = new EventSub(auth, CONFIG.channel, sink.follow, sink.status, sink.notice, sink.terminal);
        void es.start();
        return () => es.destroy();
      },
      (u) => alerts.follow(u),
      (status, detail) => { setEsStatus(status); setFollowNotice(detail); },
    ).start();
    return () => shared.destroy();
  }, [bus, demo, token, clientId, alerts]);

  /* Lifetime totals — HUD only. A scene source has no milestone widget, and
     two sources polling would double the API traffic for one number. */
  useEffect(() => {
    if (scene || demo) return;
    setTotals(EMPTY_TOTALS);
    setNotice("");
    if (!token || !clientId) return;
    let active = true;
    const m = new Milestones(
      { token, clientId },
      CONFIG.channel,
      (value) => { if (active) setTotals(value); },
      (value) => { if (active) setNotice(value); },
    );
    milestonesRef.current = m;
    void m.refresh();
    const id = setInterval(() => void m.refresh(), CONFIG.totalsPollSeconds * 1000);
    return () => {
      active = false;
      clearInterval(id);
      milestonesRef.current = null;
    };
  }, [scene, demo, token, clientId]);

  /* ── bus: commands in ── */
  useEffect(() => {
    if (!bus) return;
    const off = [
      bus.on("away.brb", (p) => {
        setAwayUp(true);
        sceneRef.current?.brb(p.minutes);
      }),
      bus.on("away.soon", (p) => {
        setAwayUp(true);
        sceneRef.current?.soon(p.minutes);
      }),
      bus.on("away.afk", () => {
        setAwayUp(true);
        sceneRef.current?.afk();
      }),
      bus.on("away.back", () => {
        setAwayUp(false);
        sceneRef.current?.back();
      }),
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
        fate(u);
      }),
      bus.on("settings", (p) => {
        setSettings((cur) => {
          const next = mergeSettings(cur, p);
          persistSettings(next);
          return next;
        });
      }),
      bus.on("clips", (p) => clips.replace(p.clips)),
      bus.on("cards", (p) => {
        replaceCards(p.library);
        // an upload may have landed in IndexedDB under an id we already tried
        setCardRev((n) => n + 1);
      }),
      bus.on("card.show", (p) => showCard(p.id)),
      bus.on("card.next", () => nextCard()),
      bus.on("clip.play", (p, msg) => void clips.playNow(p.slug, "the panel", msg.id)),
      bus.on("clip.stop", () => clips.stop()),
      bus.on("clip.resolve", (p) => {
        if (!token || !clientId || !p.slug) return;
        void fetchClip({ token, clientId }, p.slug).then((meta) => {
          if (meta) bus.send("clip.meta", meta);
        });
      }),
    ];
    return () => off.forEach((fn) => fn());
  }, [bus, tallies, poll, testAlert, say, fate, clips.replace, clips.playNow, clips.stop, replaceCards, showCard, nextCard, token, clientId]);

  /* ── bus: the dock's command tester ──
     The line goes through the SAME handle() as real chat, against this
     source's real state, so "works in the tester" means "works on stream".
     Two things are dry-run because they would post to the real channel: the
     !lab answer and the cooldown reply. Their readiness is reported instead. */
  useEffect(() => {
    if (!bus) return;
    return bus.on("chat.test", (p, msg) => {
      const user = (p.user || "test_viewer").trim();
      const m: ChatMessage = {
        kind: "chat",
        id: msg.id,
        bits: 0,
        login: user.toLowerCase(),
        user,
        msg: (p.text || "").trim(),
        mod: !!p.mod,
        glyphs: [],
      };
      const live = depsRef.current;
      const deps: ChatDeps = {
        ...live,
        // a test line should never greet test_viewer with a banner that then blocks !clip
        firstMessage: () => false,
        shoutout: (login, id) => shoutout(login, id, true),
        lab: () => {
          const lab = labChat.current;
          if (!lab) return { cmd: "lab", ok: false, text: "chat replies are off in demo mode" };
          const blocked = lab.blocked();
          if (blocked) return { cmd: "lab", ok: false, text: blocked };
          const left = lab.labLeft();
          if (left) return { cmd: "lab", ok: false, text: `shared cooldown — ${formatLeft(left)} left` };
          return { cmd: "lab", ok: true, text: "ready — would answer in chat (not sent from the tester)" };
        },
      };
      void Promise.resolve(handle(m, deps)).then((o) => {
        let outcome = o;
        if (o?.leftMs) {
          const blocked = labChat.current?.blocked() ?? "demo mode";
          outcome = { ...o, text: `${o.text} · ${blocked ? `viewer NOT told: ${blocked}` : "viewer gets a chat reply"}` };
        }
        bus.send("chat.result", {
          forId: msg.id,
          role: scene ? "scene" : "hud",
          view: where,
          visible: sceneVisible,
          outcome,
        });
      });
    });
  }, [bus, depsRef, scene, where, sceneVisible, shoutout]);

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
      labNotice,
      followNotice,
      twitchNotice: notice,
      token: !!token,
      clientId,
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
      clipPlays: clips.clipPlays,
      clip: clips.snapshot,
      card: scene ? undefined : cardSnapshot(!cardsOn),
      visible: sceneVisible,
      visibleKnown: visKnown,
    };
    bus.send("hello", payload);
  }, [bus, scene, mode, demo, ircStatus, esStatus, followNotice, labNotice, notice, token, clientId, chill, t0, tallies.counts, poll.poll, settings, totals, clips.clipPlays, clips.snapshot, cardSnapshot, cardsOn, sceneVisible, visKnown]);

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
        {guide && <Zones chill={chill} scene={scene} />}

        {/* The HUD belongs to its own source. In scene mode it simply isn't
            mounted — the away scene is layered UNDER the HUD in OBS, so
            drawing it twice would double every lane. */}
        {!scene && (
          <>
            <Rail t0={t0} />
            <LabCard active={activeLab} settings={settings} />
            <Strip moon={moon} defs={settings.tallyDefs} counts={tallies.counts} hit={tallies.hit} />
            <Goals totals={totals} settings={settings} suppressed={bannerActive || pollOn} />
            <Poll poll={poll.poll} />
            <SupportCard
              card={cards.card}
              urls={cardUrls}
              seconds={cards.library.paused ? 0 : cards.library.seconds}
              x={cards.library.x}
              y={cards.library.y}
              show={cards.library.on}
              showKey={cards.showKey}
            />
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
            labActive={activeLab}
            clipsOn={clips.clipsOn}
            clipPlaying={!!clips.playing}
            onCanvas={onCanvas}
          />
        )}

        <ClipPlayer
          key={clips.playing?.startedAt ?? "idle"}
          clip={clips.playing}
          where={chill ? "chill" : scene ? "away" : "hud"}
          onEnd={clips.stop}
          onDuration={clips.retime}
        />

        {/* Chill has no HUD layered over it, so the banner comes back here —
            moved right to clear the camera frame. */}
        {(!scene || chill) && <Oracle evt={banner} lowered={pollOn} chill={chill} />}

        {/* After SceneLayer so querySelector("canvas") still hits the sky. */}
        <BalloonLayer field={balloons} />
      </div>

      <OAuthHelper />
    </div>
  );
}
