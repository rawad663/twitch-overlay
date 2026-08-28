import { helix, resolveUserId, type Auth } from "./helix";

export type EventSubStatus = "off" | "connecting" | "live" | "expired" | "error";

type Envelope = {
  metadata?: { message_type?: string };
  payload?: {
    session?: { id?: string; reconnect_url?: string };
    subscription?: { type?: string };
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

  constructor(
    private auth: Auth,
    private channel: string,
    private onFollow: (user: string) => void,
    private onStatus: (s: EventSubStatus) => void,
    private onNotice: (text: string) => void,
  ) {}

  async start() {
    if (this.closed) return;
    if (!this.auth.token || !this.auth.clientId) {
      this.onStatus("off");
      return;
    }
    this.onStatus("connecting");

    if (!this.userId) this.userId = await resolveUserId(this.auth, this.channel);
    if (!this.userId) {
      this.onStatus("expired");
      this.onNotice("twitch token expired");
      return;
    }
    this.connect("wss://eventsub.wss.twitch.tv/ws");
  }

  private connect(url: string) {
    if (this.closed) return;
    const ws = new WebSocket(url);

    ws.onmessage = (e) => {
      let d: Envelope;
      try {
        d = JSON.parse(String(e.data)) as Envelope;
      } catch {
        return;
      }
      const type = d.metadata?.message_type;

      if (type === "session_welcome") {
        // on a reconnect handoff, only drop the old socket once this one is welcomed
        if (this.ws && this.ws !== ws) {
          try {
            this.ws.close();
          } catch {
            /* already gone */
          }
        }
        this.ws = ws;
        const id = d.payload?.session?.id;
        if (id) void this.subscribe(id); // must happen within 10s
      } else if (type === "notification") {
        if (d.payload?.subscription?.type === "channel.follow") {
          const ev = d.payload.event ?? {};
          this.onFollow(ev.user_name || ev.user_login || "someone");
        }
      } else if (type === "session_reconnect") {
        const next = d.payload?.session?.reconnect_url;
        if (next) this.connect(next);
      } else if (type === "revocation") {
        this.onNotice("follow alerts revoked");
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return; // superseded by a reconnect, nothing to do
      this.ws = null;
      if (this.closed) return;
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.start();
      }, 5000);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    };
  }

  private async subscribe(sessionId: string) {
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
      if (r.ok) {
        this.onStatus("live");
        this.onNotice("");
        return;
      }
      this.onStatus(r.status === 401 ? "expired" : "error");
      this.onNotice(r.status === 401 ? "twitch token expired" : "follow alerts unavailable");
    } catch {
      this.onStatus("error");
      this.onNotice("follow alerts offline");
    }
  }

  destroy() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* already gone */
      }
      this.ws = null;
    }
  }
}
