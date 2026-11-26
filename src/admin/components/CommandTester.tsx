"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bus } from "@/bus/bus";
import type { ChatResultPayload, TallyDef } from "@/bus/types";
import { COMMANDS, tallyCommands, testerFor, type CommandInfo, type Who } from "@/config/commands";
import { CONFIG } from "@/config/config";
import s from "../admin.module.css";
import { Button, Hint, Section } from "./ui";

/** !clip claims after up to 400ms, then has to cross the bus back. */
const COLLECT_MS = 1500;

const VIEW: Record<ChatResultPayload["view"], string> = {
  hud: "HUD",
  away: "Away scene",
  chill: "Lounge",
};

const GROUPS: { who: Who; title: string }[] = [
  { who: "anyone", title: "Anyone" },
  { who: "mods", title: "Mods and you" },
  { who: "rawad", title: "You only" },
];

type As = "auto" | Who;
const AS: { as: As; label: string }[] = [
  { as: "auto", label: "Who can" },
  { as: "anyone", label: "Viewer" },
  { as: "mods", label: "Mod" },
  { as: "rawad", label: "You" },
];

type Run = { key: string; line: string; pending: boolean; results: ChatResultPayload[] };

function Results({ run }: { run: Run }) {
  return (
    <div className={s.verdict} role="status">
      <div className={s.drow}>
        <span className={s.drowKey}>{run.pending ? `Running ${run.line}…` : `Ran ${run.line}`}</span>
      </div>
      {run.results.map((r, i) => (
        <div key={i} className={s.drow}>
          <span className={s.drowKey}>
            {VIEW[r.view]}
            {r.visible ? "" : " (hidden)"}
          </span>
          <span className={`${s.drowVal} ${r.outcome?.ok ? s.yes : s.no}`}>
            {r.outcome ? `${r.outcome.ok ? "✓" : "✕"} ${r.outcome.text}` : "not a command"}
          </span>
        </div>
      ))}
      {!run.pending && run.results.length === 0 && (
        <div className={s.drow}>
          <span className={`${s.drowVal} ${s.no}`}>
            No source answered. Refresh the OBS sources&apos; cache — an old bundle doesn&apos;t know this test.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Every chat command with who may run it, each with a Test button that sends
 * the line through every open source's real command path and lists what each
 * did — so "nothing happened" always comes with a reason. Tests use live
 * state: a test !clip really plays and starts the cooldown.
 */
export function CommandTester({
  bus,
  disabled,
  tallyDefs,
}: {
  bus: Bus | null;
  disabled: boolean;
  tallyDefs: TallyDef[];
}) {
  const [as, setAs] = useState<As>("auto");
  const [text, setText] = useState("!clip");
  const [user, setUser] = useState("test_viewer");
  const [mod, setMod] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forId = useRef<string | null>(null);
  const custom = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => [...COMMANDS, ...tallyCommands(tallyDefs)], [tallyDefs]);

  useEffect(() => {
    if (!bus) return;
    return bus.on("chat.result", (p) => {
      if (p.forId !== forId.current) return;
      setRun((cur) => (cur ? { ...cur, results: [...cur.results, p] } : cur));
    });
  }, [bus]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const send = (key: string, line: string, who: { user: string; mod: boolean }) => {
    const t = line.trim();
    if (!bus || !t) return;
    setRun({ key, line: t, pending: true, results: [] });
    forId.current = bus.send("chat.test", { text: t, user: who.user, mod: who.mod });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRun((cur) => (cur ? { ...cur, pending: false } : cur)), COLLECT_MS);
  };

  const test = (c: CommandInfo) => {
    const tester = testerFor(as === "auto" ? c.who : as);
    if (!c.test) {
      // needs an argument only you can pick: hand it to the custom line
      setText(c.usage.split(" ")[0] + " ");
      setUser(tester.user);
      setMod(tester.mod);
      custom.current?.focus();
      return;
    }
    send(c.usage, c.test, tester);
  };

  return (
    <Section title="Commands" disabled={disabled}>
      <Hint>
        Every command, who can use it and where it works. <b>Test</b> runs it on every open source, exactly as
        if it came from chat, and shows what each one did or why not. “Who can” tests as the right person;
        pick Viewer to check a command is refused.
      </Hint>
      <div className={s.seg} style={{ margin: "8px 0" }} role="group" aria-label="Test as">
        {AS.map((a) => (
          <button
            key={a.as}
            type="button"
            className={as === a.as ? s.segOn : ""}
            aria-pressed={as === a.as}
            onClick={() => setAs(a.as)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {GROUPS.map((g) => (
        <div key={g.who} className={s.cmdGroup}>
          <div className={s.cmdGroupHead}>{g.title}</div>
          {rows
            .filter((c) => c.who === g.who)
            .map((c) => (
              <div key={c.usage} className={s.cmdRow}>
                <div className={s.cmdHead}>
                  <code className={s.cmdName}>{c.usage}</code>
                  <Button variant="ghost" onClick={() => test(c)} aria-label={`Test ${c.usage}`}>
                    {c.test ? "Test" : "Try…"}
                  </Button>
                </div>
                <div className={s.cmdWhat}>{c.what}</div>
                <div className={s.cmdWhere}>
                  {c.where}
                  {c.live ? <span className={s.cmdLive}> · test {c.live}</span> : null}
                </div>
                {run?.key === c.usage && <Results run={run} />}
              </div>
            ))}
        </div>
      ))}

      <label className={s.label} htmlFor="testLine">
        Any chat line
      </label>
      <input
        id="testLine"
        ref={custom}
        className={s.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send("custom", text, { user: user.trim() || "test_viewer", mod });
        }}
      />
      <div className={s.row2} style={{ marginTop: 8 }}>
        <input
          aria-label="Viewer name"
          className={s.input}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <label className={s.clipToggle}>
          <input type="checkbox" checked={mod} onChange={(e) => setMod(e.target.checked)} />
          As mod
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <Button size="block" onClick={() => send("custom", text, { user: user.trim() || "test_viewer", mod })}>
          Run
        </Button>
      </div>
      {run?.key === "custom" && <Results run={run} />}
      <Hint>
        Name it <code>{CONFIG.channel}</code> to test as yourself. Without “As mod”, viewer cooldowns apply to
        that name. !lab, !so and cooldown replies are checked but never posted to chat from here.
      </Hint>
    </Section>
  );
}
