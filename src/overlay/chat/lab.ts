import type { Credentials } from "@/bus/credentials";
import { readJSON, writeJSON } from "@/bus/storage";
import { loadSettings } from "@/config/settings";
import { labReply } from "@/config/lab";

/** Serialize replies across OBS sources; fail closed if shared storage/locks fail. */
export class LabChat {
  private stopped = false;
  private userId = "";
  private abort = new AbortController();
  constructor(private auth: Credentials, private channel: string, private notice: (s: string) => void) {}
  async start() {
    if (!this.auth.token || !this.auth.clientId) { this.notice("!lab: authorize Twitch in Milestones to enable replies."); return; }
    if (!navigator.locks) { this.notice("!lab: shared locks unavailable. Update OBS and use HTTPS."); return; }
    try {
      const res = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${this.auth.token}` }, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]) });
      if (!res.ok) throw new Error("!lab: Twitch authorization failed. Authorize again.");
      const data = await res.json();
      if (data.login?.toLowerCase() !== this.channel.toLowerCase() || data.client_id !== this.auth.clientId || !data.user_id) throw new Error(`!lab: authorize as ${this.channel}.`);
      if (!data.scopes?.includes("user:write:chat")) throw new Error("!lab: authorize Twitch again to grant chat replies (user:write:chat).");
      if (this.stopped) return;
      this.userId = data.user_id;
      this.notice("!lab: ready — replies as " + this.channel);
    } catch (e) { if (!this.stopped) this.notice(e instanceof Error && e.message.startsWith("!lab:") ? e.message : "!lab: unable to reach Twitch. Refresh the source to retry."); }
  }
  async reply() {
    if (this.stopped || !this.userId || !navigator.locks) return;
    try {
      await navigator.locks.request(`rawad-lab-${this.channel}`, { ifAvailable: true }, async lock => {
        if (!lock || this.stopped) return;
        const key = `rawad-lab-reply-${this.channel}`;
        const now = Date.now();
        const last = readJSON<number>(key);
        if (typeof last === "number" && now - last < 15000) return;
        if (!writeJSON(key, now)) { this.notice("!lab: OBS blocked storage; replies disabled to avoid duplicates."); return; }
        const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.auth.token}`, "Client-Id": this.auth.clientId, "Content-Type": "application/json" },
          body: JSON.stringify({ broadcaster_id: this.userId, sender_id: this.userId, message: labReply(loadSettings()) }),
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
        });
        if (this.stopped) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) this.userId = "";
          this.notice(`!lab: reply failed (Twitch ${res.status}).${res.status === 401 || res.status === 403 ? " Authorize Twitch again." : " Try again after the cooldown."}`);
          return;
        }
        const body = await res.json();
        this.notice(body.data?.[0]?.is_sent ? "!lab: ready — last reply sent" : "!lab: Twitch did not send the reply. Check moderation settings.");
      });
    } catch { if (!this.stopped) this.notice("!lab: reply failed. Check connection; try again after the cooldown."); }
  }
  destroy() { this.stopped = true; this.abort.abort(); }
}
