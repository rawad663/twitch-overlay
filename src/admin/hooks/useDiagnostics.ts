"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bus } from "@/bus/bus";
import { useInterval } from "@/bus/useBus";
import { rawadKeys, readJSON, storageProbe } from "@/bus/storage";
import { PRESENCE_KEY, type PresenceRecord } from "@/bus/types";

export type DiagRow = { key: string; value: string; ok: boolean };

export type Diagnostics = {
  rows: DiagRow[];
  verdict: string;
  /** the clipboard blob, verdict and user-agent included */
  report: string;
};

/**
 * The dock's self-check. Its whole job is to separate two failures that look
 * identical from the outside: storage being isolated between OBS views (the
 * bus can never work) versus sources running cached pre-bus code (a refresh
 * fixes it). `rawad-presence` is what tells them apart — it's a plain
 * localStorage marker written by every source, independent of the bus.
 */
export function useDiagnostics(bus: Bus | null, sourceCount: number): Diagnostics {
  const [diag, setDiag] = useState<Diagnostics>({ rows: [], verdict: "", report: "" });

  const run = useCallback(() => {
    const rows: DiagRow[] = [];

    const bcOk = typeof BroadcastChannel !== "undefined";
    rows.push({ key: "BroadcastChannel", value: bcOk ? "supported" : "UNSUPPORTED", ok: bcOk });

    const lsOk = storageProbe();
    rows.push({ key: "localStorage", value: lsOk ? "read/write ok" : "BLOCKED", ok: lsOk });

    const presence = readJSON<PresenceRecord>(PRESENCE_KEY);
    const presenceAge = presence ? Math.round((Date.now() - presence.ts) / 1000) : Infinity;
    const presenceFresh = presenceAge < 8;
    rows.push({
      key: "Source presence",
      value: presence
        ? `${presence.role}/${presence.mode} · build ${presence.build || "pre-bus"} · ${presenceAge}s ago`
        : "none found",
      ok: presenceFresh,
    });

    const keys = rawadKeys();
    rows.push({
      key: "Shared keys",
      value: keys.length ? keys.join(", ") : "none",
      ok: keys.length > 0,
    });

    const seen = bus?.seenCount ?? 0;
    rows.push({ key: "Bus messages seen", value: String(seen), ok: seen > 0 });
    rows.push({ key: "Sources answering", value: String(sourceCount), ok: sourceCount > 0 });

    let verdict: string;
    if (sourceCount > 0) {
      verdict = "Working — the panel and your sources are talking.";
    } else if (!lsOk) {
      verdict =
        "localStorage is blocked here. Check the dock URL is the https Pages address, not a local file.";
    } else if (presence && presenceFresh) {
      verdict =
        "Storage IS shared — a source is alive and writing presence — but bus messages aren't arriving. " +
        "The sources are almost certainly running cached pre-bus code: right-click each browser source → Refresh cache of current page.";
    } else if (presence) {
      verdict = `Storage is shared, but the last source presence is ${presenceAge}s old. Is the source still open and visible in OBS?`;
    } else if (keys.length) {
      verdict =
        "Storage is shared with something, but no source presence was found — the sources are likely running cached pre-bus code. Refresh cache on each browser source.";
    } else {
      verdict =
        "No shared keys at all. Either nothing is running, or OBS is isolating storage between this dock and the sources — in which case the transport needs to move to obs-websocket.";
    }

    const report =
      rows.map((r) => `${r.key}: ${r.value}`).join("\n") +
      `\n\nVerdict: ${verdict}\nUA: ${navigator.userAgent}`;

    setDiag({ rows, verdict, report });
  }, [bus, sourceCount]);

  // run once on open (and whenever the source count moves) so the panel never
  // shows a blank second before the first tick
  useEffect(run, [run]);
  useInterval(run, 1000);

  return diag;
}
