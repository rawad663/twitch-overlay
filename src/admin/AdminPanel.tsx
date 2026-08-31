"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBus } from "@/bus/useBus";
import type { AlertKind, Settings, SettingsPatch, TallyDef } from "@/bus/types";
import { DEFAULT_SETTINGS } from "@/config/config";
import { normalizeTallyDefs } from "@/config/settings";
import s from "./admin.module.css";
import { useSources } from "./hooks/useSources";
import { useSendAndConfirm } from "./hooks/useSendAndConfirm";
import { useDiagnostics } from "./hooks/useDiagnostics";
import { ConnBanner, Sources } from "./components/Sources";
import { Away } from "./components/Away";
import { Tallies } from "./components/Tallies";
import { PollPanel } from "./components/PollPanel";
import { Alerts } from "./components/Alerts";
import { SoundGoals } from "./components/SoundGoals";
import { Milestones } from "./components/Milestones";
import { Diagnostics } from "./components/Diagnostics";

export function AdminPanel() {
  // no role — the panel must never ack, or delivery confirmation is a lie
  const bus = useBus();
  const { sources, live, connected } = useSources(bus);
  const { send, toast } = useSendAndConfirm(bus);
  const diag = useDiagnostics(bus, sources.length);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [minutes, setMinutes] = useState(DEFAULT_SETTINGS.brbMinutes);
  const seeded = useRef(false);

  /**
   * Adopt the overlay's settings once, then own them. Re-adopting on every
   * hello would fight the user mid-drag on the volume slider.
   */
  useEffect(() => {
    if (seeded.current || !live?.settings) return;
    seeded.current = true;
    const adopted: Settings = {
      ...DEFAULT_SETTINGS,
      ...live.settings,
      tallyDefs: normalizeTallyDefs(live.settings.tallyDefs),
    };
    setSettings(adopted);
    setMinutes(adopted.brbMinutes);
  }, [live?.settings]);

  /**
   * Settings go out unconfirmed on purpose — the volume slider fires per drag
   * tick and would bury the toast under a hundred acks.
   *
   * The patch is also deliberately partial: the panel has no UI for
   * fullMoonMessages / bigCheer, and the overlay only overwrites keys that are
   * present, so sending the whole object would clobber them.
   */
  const patch = useCallback(
    (p: SettingsPatch) => {
      setSettings((cur) => {
        const next = { ...cur, ...p };
        bus?.send("settings", {
          volume: next.volume,
          muted: next.muted,
          goalFollows: next.goalFollows,
          goalSubs: next.goalSubs,
          goalMessages: next.goalMessages,
          milestoneFollows: next.milestoneFollows,
          milestoneSubs: next.milestoneSubs,
          showMilestones: next.showMilestones,
          tallyDefs: next.tallyDefs,
          afkReason: next.afkReason,
        });
        return next;
      });
    },
    [bus],
  );

  const onDefs = useCallback((defs: TallyDef[]) => patch({ tallyDefs: defs }), [patch]);

  const away = useCallback(
    (type: "away.brb" | "away.soon" | "away.afk" | "away.back" | "away.reset") => {
      const labels: Record<string, string> = {
        "away.brb": "BRB",
        "away.soon": "Starting soon",
        "away.afk": "AFK",
        "away.back": "Back",
        "away.reset": "Reset",
      };
      if (type === "away.brb" || type === "away.soon") {
        send(type, { minutes: minutes || 15 }, labels[type]!);
      } else {
        send(type, {}, labels[type]!);
      }
    },
    [send, minutes],
  );

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <h1 className={s.title}>Rawad — Overlay Control</h1>

        <ConnBanner count={sources.length} />
        <Sources sources={sources} />

        <Away
          away={live?.away}
          minutes={minutes}
          onMinutes={setMinutes}
          reason={settings.afkReason}
          onReason={(afkReason) => patch({ afkReason })}
          send={away}
          disabled={!connected}
        />

        <Tallies
          defs={settings.tallyDefs}
          counts={live?.tally}
          onDefs={onDefs}
          onBump={(key, delta) => send("tally.bump", { key, delta }, `${key} ${delta > 0 ? "+1" : "-1"}`)}
          onSet={(key, value) => send("tally.set", { key, value }, `${key} = ${value}`)}
          disabled={!connected}
        />

        <PollPanel
          poll={live?.poll}
          onOpen={(text, a, b) => send("poll.open", { text, a, b }, "Open poll")}
          onClose={() => send("poll.close", {}, "End poll")}
          disabled={!connected}
        />

        <Alerts
          onTest={(kind: AlertKind) => send("alert.test", { kind }, `Test ${kind}`)}
          onSay={(line) => send("oracle.say", { line }, "Say")}
          onFate={() => send("oracle.fate", {}, "Fate")}
          disabled={!connected}
        />

        <SoundGoals settings={settings} patch={patch} />

        <Milestones
          settings={settings}
          patch={patch}
          totals={live?.totals}
          liveClientId={live?.clientId ?? ""}
        />

        <Diagnostics diag={diag} />
      </div>

      <div
        className={`${s.toast} ${toast ? s.toastShow : ""} ${
          toast ? (toast.ok ? s.toastOk : s.toastNo) : ""
        }`}
        role="status"
      >
        {toast?.text}
      </div>
    </div>
  );
}
