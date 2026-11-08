"use client";

import { useEffect, useState } from "react";
import { CLIENT_ID_KEY, type Settings, type SettingsPatch, type Totals } from "@/bus/types";
import { readString, writeString } from "@/bus/storage";
import { clearCredentials, parseCredentials, saveCredentials } from "@/bus/credentials";
import { useCredentialsSnapshot } from "@/bus/useCredentials";
import { authorizeUrl, TWITCH_REDIRECT_URL } from "@/config/twitchAuth";
import { validateToken } from "@/config/validateToken";
import { CONFIG } from "@/config/config";
import s from "../admin.module.css";
import { Button, Field, Hint, NumberInput, Section } from "./ui";

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
  const [tokenDraft, setTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const saved = parseCredentials(useCredentialsSnapshot());

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
  const saveToken = async () => {
    setSaving(true);
    setMessage("");
    const result = await validateToken(tokenDraft, CONFIG.channel);
    setSaving(false);
    if (!result.ok) {
      setError(true);
      setMessage(result.error);
      return;
    }
    if (!saveCredentials(result.auth)) {
      setError(true);
      setMessage("OBS blocked local storage. The token was not saved; existing credentials are unchanged.");
      return;
    }
    onClientId(result.auth.clientId);
    setTokenDraft("");
    setError(false);
    setMessage(result.subs
      ? "Token saved. All loaded overlay sources will reconnect automatically."
      : "Token saved for follows. Subscription totals need channel:read:subscriptions; authorize again to add it.");
  };

  const removeToken = () => {
    const ok = clearCredentials();
    setError(!ok);
    setMessage(ok
      ? "Saved token removed. Twitch authorization is disabled on these sources, including old token URLs."
      : "OBS blocked local storage. The saved token could not be removed.");
    if (ok) setTokenDraft("");
  };
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
          open it in a normal browser (not this dock), then copy the access token and save it below.
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
      <label className={s.label} htmlFor="authToken">Twitch access token</label>
      <input
        id="authToken"
        type="password"
        className={s.input}
        autoComplete="off"
        spellCheck={false}
        placeholder={saved?.token ? "Paste a replacement token" : "Paste the token from the authorization page"}
        value={tokenDraft}
        onChange={(e) => setTokenDraft(e.target.value)}
        disabled={saving}
      />
      <div className={s.row2} style={{ marginTop: 8 }}>
        <Button onClick={saveToken} disabled={saving || !tokenDraft.trim()}>
          {saving ? "Checking Twitch…" : "Save token"}
        </Button>
        <Button variant="remove" onClick={removeToken} disabled={saving || !saved?.token}>
          Remove saved token
        </Button>
      </div>
      <div className={s.hint} style={{ marginTop: 8 }}>
        {saved?.token ? "A token is saved in this browser profile." : "No token saved in this browser profile."}
        {" "}Save it in the OBS dock once for every source. It stays on this computer in browser
        storage, unencrypted, and is never included in control messages or diagnostics.
        After saving, remove <code>token</code> and <code>client_id</code> from source URLs;
        keep each source&rsquo;s <code>mode</code>. Saved credentials take priority over old URL tokens.
      </div>
      {message && <div role="status" className={error ? s.sourceWarning : s.verdict} style={{ marginTop: 8 }}>{message}</div>}
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
          dock would kill the panel. In your Twitch app settings, the OAuth Redirect URL must be
          exactly <code>{TWITCH_REDIRECT_URL}</code> (including the trailing slash).
        </Hint>
      </div>
    </Section>
  );
}
