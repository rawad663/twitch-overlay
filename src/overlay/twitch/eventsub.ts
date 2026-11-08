import { helix, resolveUserId, type Auth } from "./helix";
import type { FollowStatus } from "@/bus/types";

export type EventSubStatus = FollowStatus;

type Envelope = {
  metadata?: { message_type?: string; message_id?: string };
  payload?: {
    session?: { id?: string; reconnect_url?: string; keepalive_timeout_seconds?: number | null };
    subscription?: { type?: string; status?: string };
    event?: { user_name?: string; user_login?: string };
  };
};

/**
 * Follow alerts. IRC covers everything else anonymously, but it will not send
 * follows — so this is the only part of the overlay that needs a token, and
 * the only part that silently no-ops without one.
 */
export class EventSub {
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;
  private closed = false;
  private starting = false;
  private sockets = new Map<WebSocket, ReturnType<typeof setTimeout>>();

  constructor(
    private auth: Auth,
    private channel: string,
    private onFollow: (user: string, id?: string) => void,
    private onStatus: (s: EventSubStatus) => void,
    private onNotice: (text: string) => void,
  ) {}

  async start() {
    if (this.closed || this.starting || this.sockets.size) return;
    if (!this.auth.token || !this.auth.clientId) {
      this.onStatus("off");
      return;
    }
    this.onStatus("connecting");
    this.starting = true;
    if (!this.userId) this.userId = await resolveUserId(this.auth, this.channel);
    this.starting = false;
    if (this.closed) return;
    if (!this.userId) {
      this.onNotice("follow alerts: unable to resolve channel — check token and client ID");
      this.reconnect();
      return;
    }
    this.connect("wss://eventsub.wss.twitch.tv/ws");
  }

  private connect(url: string, handoff = false) {
    if (this.closed) return;
    const ws = new WebSocket(url);
    let keepaliveMs = 10000;
    const arm = (ms: number) => {
      clearTimeout(this.sockets.get(ws));
      this.sockets.set(ws, setTimeout(() => this.reconnect(), ms));
    };
    // Track connecting sockets too: failures before welcome still need retry/cleanup.
    arm(15000);

    ws.onmessage = (e) => {
      if (this.closed || !this.sockets.has(ws)) return;
      let d: Envelope;
      try {
        d = JSON.parse(String(e.data)) as Envelope;
      } catch {
        return;
      }
      const type = d.metadata?.message_type;

      if (type === "session_welcome") {
        const timeout = d.payload?.session?.keepalive_timeout_seconds;
        if (typeof timeout === "number" && timeout > 0) keepaliveMs = timeout * 1000;
        // on a reconnect handoff, only drop the old socket once this one is welcomed
        if (this.ws && this.ws !== ws) {
          this.drop(this.ws);
        }
        this.ws = ws;
        arm(keepaliveMs + 1000);
        const id = d.payload?.session?.id;
        // Twitch transfers subscriptions on a handoff; POSTing again conflicts.
        if (handoff) {
          this.onStatus("live");
          this.onNotice("");
        } else if (id) void this.subscribe(id, ws); // must happen within 10s
        else this.reconnect();
      } else if (type === "session_keepalive") {
        arm(keepaliveMs + 1000);
      } else if (type === "notification") {
        arm(keepaliveMs + 1000);
        if (d.payload?.subscription?.type === "channel.follow") {
          const ev = d.payload.event ?? {};
          const user = ev.user_name || ev.user_login || "someone";
          if (d.metadata?.message_id) this.onFollow(user, d.metadata.message_id);
          else this.onFollow(user);
        }
      } else if (type === "session_reconnect") {
        const next = d.payload?.session?.reconnect_url;
        if (next && this.sockets.size === 1) {
          arm(30000);
          this.connect(next, true);
        }
      } else if (type === "revocation") {
        this.onStatus(d.payload?.subscription?.status === "authorization_revoked" ? "expired" : "error");
        this.onNotice("follow alerts revoked — authorize Twitch again");
        this.destroy();
      }
    };

    ws.onclose = () => {
      if (!this.sockets.has(ws)) return;
      this.reconnect();
    };

    ws.onerror = () => {
      if (this.sockets.has(ws)) this.reconnect();
    };
  }

  private async subscribe(sessionId: string, ws: WebSocket) {
    try {
      const r = await helix(this.auth, "eventsub/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "channel.follow",
          version: "2",
          condition: {
            broadcaster_user_id: this.userId,
            moderator_user_id: this.userId,
          },
          transport: { method: "websocket", session_id: sessionId },
        }),
      });
      if (this.closed || this.ws !== ws) return;
      if (r.ok) {
        this.onStatus("live");
        this.onNotice("");
        return;
      }
      this.onStatus(r.status === 401 ? "expired" : "error");
      this.onNotice(r.status === 401
        ? "follow alerts: check token and client ID, then authorize Twitch again"
        : r.status === 403
          ? "follow alerts need moderator:read:followers — authorize as the channel owner"
          : r.status === 429
            ? "Twitch connection limit reached — refresh every OBS overlay source to close old listeners; retrying in 60 seconds"
            : `follow alerts unavailable (Twitch ${r.status})`);
      if (r.status === 401 || r.status === 403) this.destroy();
      else this.reconnect(r.status === 429 ? 60000 : 15000, "error");
    } catch {
      if (this.closed || this.ws !== ws) return;
      this.onNotice("follow alerts offline");
      this.reconnect();
    }
  }

  private drop(ws: WebSocket) {
    clearTimeout(this.sockets.get(ws));
    this.sockets.delete(ws);
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try { ws.close(); } catch { /* already gone */ }
    if (this.ws === ws) this.ws = null;
  }

  private reconnect(delay = 5000, status: EventSubStatus = "connecting") {
    if (this.closed) return;
    for (const ws of this.sockets.keys()) this.drop(ws);
    this.onStatus(status);
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.start();
    }, delay);
  }

  destroy() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    for (const ws of this.sockets.keys()) this.drop(ws);
  }
}
