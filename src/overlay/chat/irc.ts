import { CONFIG } from "@/config/config";
import { parse, type ParsedMessage } from "./parse";

export type IrcStatus = "connecting" | "live" | "off" | "demo";

/**
 * Anonymous Twitch IRC. `justinfan*` needs no token and still receives chat,
 * bits, subs, gifts and raids — follows are the one event it will not send,
 * which is why EventSub exists separately.
 */
export class Irc {
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private onMessage: (m: ParsedMessage) => void,
    private onStatus: (s: IrcStatus) => void,
  ) {}

  connect() {
    if (this.closed) return;
    this.onStatus("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("NICK justinfan" + ((Math.random() * 80000) | 0));
      ws.send("JOIN #" + CONFIG.channel);
      this.onStatus("live");
    };

    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws.send("PONG :tmi.twitch.tv");
          continue;
        }
        const m = parse(line);
        if (m) this.onMessage(m);
      }
    };

    ws.onerror = () => ws.close();
    ws.onclose = () => {
      this.onStatus("off");
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.closed || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, 4000);
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
