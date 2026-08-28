"use client";

import { useEffect, useState } from "react";
import { CLIENT_ID_KEY, type Settings, type SettingsPatch, type Totals } from "@/bus/types";
import { readString, writeString } from "@/bus/storage";
import { OVERLAY_URL } from "@/config/routes";
import s from "../admin.module.css";
import { Button, Field, Hint, NumberInput, Section } from "./ui";

const AUTH_SCOPES = "moderator:read:followers channel:read:subscriptions";

function authorizeUrl(clientId: string) {
  const params = new URLSearchParams({
    client_id: clientId || "YOUR_CLIENT_ID",
    redirect_uri: OVERLAY_URL(),
    response_type: "token",
    scope: AUTH_SCOPES,
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

function totalsLine(totals: Totals | null | undefined) {
  if (!totals) return "Waiting for totals from the HUD…";
  const bits: string[] = [];
  const n = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));

  if (totals.followsState === "ok") bits.push(`${n(totals.follows)} followers`);
  else if (totals.followsState === "expired") bits.push("followers — token expired");
  else if (totals.followsState === "off") bits.push("followers — no token");
  else if (totals.follows !== null) bits.push(`${n(totals.follows)} followers`);

  if (totals.subsState === "ok") bits.push(`${n(totals.subs)} subs`);
  else if (totals.subsState === "noscope" || totals.subsState === "expired")
    bits.push("subs — token missing channel:read:subscriptions");
  else if (totals.subsState === "off") bits.push("subs — no token");
  else if (totals.subs !== null) bits.push(`${n(totals.subs)} subs`);

  return bits.length ? bits.join("  ·  ") : "No totals yet.";
}

export function Milestones({
  settings,
  patch,
  totals,
  liveClientId,
}: {
  settings: Settings;
  patch: (p: SettingsPatch) => void;
  totals: Totals | null | undefined;
  liveClientId: string;
}) {
  const [clientId, setClientId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setClientId(readString(CLIENT_ID_KEY));
  }, []);

  // adopt whatever the running source is actually using, so the two can't drift
  useEffect(() => {
    if (liveClientId) setClientId((cur) => cur || liveClientId);
  }, [liveClientId]);

  const onClientId = (v: string) => {
    setClientId(v);
    if (v.trim()) writeString(CLIENT_ID_KEY, v.trim());
  };

  const url = authorizeUrl(clientId.trim());
  const needsAuth =
    totals?.subsState === "noscope" ||
    totals?.subsState === "expired" ||
    totals?.subsState === "off";

  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <Section title="Milestones">
      <div className={s.hint} style={{ margin: "0 0 9px" }}>
        {totalsLine(totals)}
      </div>
      <div className={s.row2}>
        <Field label="Followers" id="mFollows">
          <NumberInput
            id="mFollows"
            value={settings.milestoneFollows}
            onChange={(n) => patch({ milestoneFollows: n })}
          />
        </Field>
        <Field label="Subs" id="mSubs">
          <NumberInput
            id="mSubs"
            value={settings.milestoneSubs}
            onChange={(n) => patch({ milestoneSubs: n })}
          />
        </Field>
      </div>
      <div className={s.row2} style={{ marginTop: 8 }}>
        <Button
          variant={settings.showMilestones ? "ghost" : "warn"}
          onClick={() => patch({ showMilestones: !settings.showMilestones })}
        >
          {settings.showMilestones ? "Hide on HUD" : "Show on HUD"}
        </Button>
      </div>

      {needsAuth && (
        <div className={s.verdict} style={{ marginTop: 11 }}>
          Sub totals need a token with <code>channel:read:subscriptions</code>. Copy the URL below,
          open it in a normal browser (not this dock), then paste the overlay&rsquo;s generated OBS
          URL into the HUD source.
        </div>
      )}

      <label className={s.label} htmlFor="authClientId">
        Client ID
      </label>
      <input
        id="authClientId"
        className={s.input}
        spellCheck={false}
        placeholder="Twitch app client id"
        value={clientId}
        onChange={(e) => onClientId(e.target.value)}
      />
      <label className={s.label} htmlFor="authUrl">
        Authorize URL
      </label>
      <div className={s.row2}>
        <input
          id="authUrl"
          className={s.input}
          style={{ flex: 1, width: "auto" }}
          readOnly
          spellCheck={false}
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="ghost" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <div style={{ marginTop: 10 }}>
        <Hint>
          Lifetime totals, polled from Twitch. Open the authorize URL in a browser — navigating this
          dock would kill the panel.
        </Hint>
      </div>
    </Section>
  );
}
