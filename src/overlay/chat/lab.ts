import type { Credentials } from "@/bus/credentials";
import { readJSON, writeJSON } from "@/bus/storage";
import { loadSettings } from "@/config/settings";
import { labReply } from "@/config/lab";
import { claimOnce } from "../claim";

/** Shared between every source: one !lab answer per window, whoever sends it. */
export const LAB_COOLDOWN_MS = 15000;
/** One cooldown reply per viewer per command in this window, so spamming can't flood chat. */
export const NOTICE_EVERY_MS = 60000;
const NOTICES_KEY = "rawad-cooldown-replies";

/**
 * Posts to chat as the channel account (Helix, `user:write:chat`). Started by
 * !lab, now also how a viewer hears their command is cooling down.
 * Serialized across OBS sources; fails closed if shared storage/locks fail.
 */
export class LabChat {
  private stopped = false;
  private userId = "";
  private status = "";
  private abort = new AbortController();
  constructor(private auth: Credentials, private channel: string, private notice: (s: string) => void) {}
  private setStatus(s: string) {
    this.status = s;
    this.notice(s);
  }
  async start() {
    if (!this.auth.token || !this.auth.clientId) { this.setStatus("!lab: authorize Twitch in Milestones to enable replies."); return; }
    if (!navigator.locks) { this.setStatus("!lab: shared locks unavailable. Update OBS and use HTTPS."); return; }
    try {
      const res = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${this.auth.token}` }, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]) });
      if (!res.ok) throw new Error("!lab: Twitch authorization failed. Authorize again.");
      const data = await res.json();
      if (data.login?.toLowerCase() !== this.channel.toLowerCase() || data.client_id !== this.auth.clientId || !data.user_id) throw new Error(`!lab: authorize as ${this.channel}.`);
      if (!data.scopes?.includes("user:write:chat")) throw new Error("!lab: authorize Twitch again to grant chat replies (user:write:chat).");
      if (this.stopped) return;
      this.userId = data.user_id;
      this.setStatus("!lab: ready — replies as " + this.channel);
    } catch (e) { if (!this.stopped) this.setStatus(e instanceof Error && e.message.startsWith("!lab:") ? e.message : "!lab: unable to reach Twitch. Refresh the source to retry."); }
  }

  /** Why a reply can't go out right now, or null when it can. Sync, for the dock tester. */
  blocked(): string | null {
    if (this.stopped) return "replier stopped";
    if (!this.userId) return this.status || "!lab: still checking Twitch authorization";
    return null;
  }

  /** ms until !lab answers again (shared across sources), 0 when it would answer now. */
  labLeft(now = Date.now()): number {
    const last = readJSON<number>(`rawad-lab-reply-${this.channel}`);
    return typeof last === "number" ? Math.max(0, LAB_COOLDOWN_MS - (now - last)) : 0;
  }

  async reply(parentId?: string) {
    if (this.stopped || !this.userId || !navigator.locks) return;
    try {
      await navigator.locks.request(`rawad-lab-${this.channel}`, { ifAvailable: true }, async lock => {
        if (!lock || this.stopped) return;
        const key = `rawad-lab-reply-${this.channel}`;
        const now = Date.now();
        const last = readJSON<number>(key);
        if (typeof last === "number" && now - last < LAB_COOLDOWN_MS) return;
        if (!writeJSON(key, now)) { this.setStatus("!lab: OBS blocked storage; replies disabled to avoid duplicates."); return; }
        await this.post(labReply(loadSettings()), parentId, true);
      });
    } catch { if (!this.stopped) this.setStatus("!lab: reply failed. Check connection; try again after the cooldown."); }
  }

  /**
   * "@viewer !clip is cooling down — 1:42". One source sends it (claimed on
   * the chat message id) and a viewer gets at most one per command per
   * minute, so spamming a command can't turn the channel account into spam.
   */
  async cooldownReply(msgId: string, login: string, cmd: string, text: string) {
    if (this.stopped || !this.userId || !msgId) return;
    const won = await claimOnce(`cd:${msgId}`, () => {
      const log = readJSON<Record<string, number>>(NOTICES_KEY) ?? {};
      const k = `${cmd}:${login}`;
      const now = Date.now();
      if (now - (log[k] ?? 0) < NOTICE_EVERY_MS) return false;
      for (const [key, at] of Object.entries(log)) if (now - at > NOTICE_EVERY_MS) delete log[key];
      log[k] = now;
      return writeJSON(NOTICES_KEY, log);
    });
    if (won && !this.stopped) await this.post(text, msgId, false);
  }

  /** A plain channel message (the !so line). Callers claim first; this does not dedupe. */
  async say(message: string) {
    if (this.stopped || !this.userId) return;
    await this.post(message, undefined, false);
  }

  private async post(message: string, parentId: string | undefined, isLab: boolean) {
    try {
      const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.auth.token}`, "Client-Id": this.auth.clientId, "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcaster_id: this.userId,
          sender_id: this.userId,
          message,
          ...(parentId ? { reply_parent_message_id: parentId } : {}),
        }),
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
      });
      if (this.stopped) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) this.userId = "";
        this.setStatus(`!lab: reply failed (Twitch ${res.status}).${res.status === 401 || res.status === 403 ? " Authorize Twitch again." : " Try again after the cooldown."}`);
        return;
      }
      const body = await res.json();
      const sent = body.data?.[0]?.is_sent;
      if (!sent) this.setStatus("!lab: Twitch did not send the reply. Check moderation settings.");
      else if (isLab) this.setStatus("!lab: ready — last reply sent");
    } catch { if (!this.stopped) this.setStatus("!lab: reply failed. Check connection; try again after the cooldown."); }
  }

  destroy() { this.stopped = true; this.abort.abort(); }
}
