"use client";

import { useEffect, useState } from "react";
import { CLIENT_ID_KEY } from "@/bus/types";
import { readString, writeString } from "@/bus/storage";
import s from "../overlay.module.css";

/**
 * The landing page for Twitch's implicit OAuth redirect. The token arrives in
 * the URL fragment, which is why this lives on the overlay route: the fragment
 * never reaches a server. The user copies it into the OBS dock because a
 * normal browser cannot write to OBS's separate storage profile.
 *
 * Renders nothing at all unless a token is actually in the hash.
 */
export function OAuthHelper() {
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const t = hash.get("access_token");
    if (!t) return;
    // scrub the token out of the address bar as soon as we have it
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setToken(t);
    setClientId(readString(CLIENT_ID_KEY));
  }, []);

  if (!token) return null;

  const base = window.location.origin + window.location.pathname;
  const url = `${base}?live=1&client_id=${encodeURIComponent(clientId.trim() || "YOUR_CLIENT_ID")}&token=${encodeURIComponent(token)}`;

  const onId = (v: string) => {
    setClientId(v);
    if (v.trim()) writeString(CLIENT_ID_KEY, v.trim());
  };

  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  return (
    <div className={s.oauth}>
      <div className={s.oauthCard}>
        <h1>Follow-alert token ready</h1>
        <label>
          Twitch access token
          <input type="password" readOnly autoComplete="off" value={token} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <button type="button" onClick={() => {
          navigator.clipboard?.writeText(token).then(() => setTokenCopied(true), () => {});
        }}>
          {tokenCopied ? "Token copied!" : "Copy token for OBS dock"}
        </button>
        <p className={s.oauthHint}>
          In OBS, open Overlay Control → Milestones, paste this into Twitch access token, and
          select Save token. Every loaded source updates automatically. This browser cannot
          save directly into OBS. Keep the token private; authorize again when it expires.
        </p>
        <details>
          <summary>Legacy setup: token in source URL</summary>
        <label>
          Client ID
          <input
            spellCheck={false}
            placeholder="paste your Client ID"
            value={clientId}
            onChange={(e) => onId(e.target.value)}
          />
        </label>
        <label>
          OBS browser-source URL
          <textarea readOnly spellCheck={false} value={url} onFocus={(e) => e.target.select()} />
        </label>
        <button type="button" onClick={copy}>
          {copied ? "Copied!" : "Copy URL"}
        </button>
        <p className={s.oauthHint}>
          Paste this whole URL into OBS&rsquo;s browser source. The token expires in ~60 days.
        </p>
        </details>
      </div>
    </div>
  );
}
