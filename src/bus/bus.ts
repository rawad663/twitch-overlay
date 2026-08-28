import {
  BUS_CHANNEL,
  BUS_KEY,
  type BusMessage,
  type BusPayloads,
  type BusRole,
  type BusType,
} from "./types";

/**
 * Links the overlay sources to the admin dock. Same-origin only, which in
 * practice means the panel must be an OBS *Custom Browser Dock* — a normal
 * Chrome tab is a different browser and shares nothing.
 *
 * Three redundant mechanisms, deduped by id, because OBS has a history of
 * breaking one or another between docks and sources:
 *   1. BroadcastChannel   2. storage events   3. polling the same key
 *
 * Sources set `role`, which makes them auto-ack handled commands. The panel
 * leaves `role` undefined — otherwise it would ack its own sends and the
 * delivery confirmation would be a lie.
 */
export class Bus {
  readonly id = Math.random().toString(36).slice(2);
  role?: BusRole;

  private ch: BroadcastChannel | null = null;
  private seen: string[] = [];
  private handlers = new Map<string, Array<(payload: unknown, msg: BusMessage) => void>>();
  private lastId = "";
  private poll: ReturnType<typeof setInterval> | null = null;
  private onStorage: ((e: StorageEvent) => void) | null = null;

  constructor(role?: BusRole) {
    this.role = role;
  }

  /** Number of unique messages this bus has accepted — surfaced in diagnostics. */
  get seenCount() {
    return this.seen.length;
  }

  init() {
    if (typeof window === "undefined") return this;

    try {
      this.ch = new BroadcastChannel(BUS_CHANNEL);
      this.ch.onmessage = (e) => this.deliver(e.data as BusMessage);
    } catch {
      /* no BroadcastChannel — the other two transports carry it */
    }

    this.onStorage = (e: StorageEvent) => {
      if (e.key !== BUS_KEY || !e.newValue) return;
      try {
        this.deliver(JSON.parse(e.newValue) as BusMessage);
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener("storage", this.onStorage);

    // covers storage events not firing across CEF views
    this.poll = setInterval(() => {
      let raw: string | null;
      try {
        raw = localStorage.getItem(BUS_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      try {
        const m = JSON.parse(raw) as BusMessage;
        if (m && m.id !== this.lastId) {
          this.lastId = m.id;
          this.deliver(m);
        }
      } catch {
        /* ignore malformed */
      }
    }, 500);

    return this;
  }

  /** Tear down every transport. Needed so React StrictMode can't leave two buses running. */
  destroy() {
    if (this.poll !== null) clearInterval(this.poll);
    this.poll = null;
    if (this.onStorage && typeof window !== "undefined") {
      window.removeEventListener("storage", this.onStorage);
    }
    this.onStorage = null;
    try {
      this.ch?.close();
    } catch {
      /* already gone */
    }
    this.ch = null;
    this.handlers.clear();
  }

  send<T extends BusType>(type: T, payload?: BusPayloads[T]): string {
    const msg: BusMessage<T> = {
      v: 1,
      id: this.id + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      from: this.id,
      type,
      payload: payload ?? ({} as BusPayloads[T]),
    };
    try {
      this.ch?.postMessage(msg);
    } catch {
      /* channel died — localStorage still carries it */
    }
    try {
      localStorage.setItem(BUS_KEY, JSON.stringify(msg));
    } catch {
      /* storage blocked — BroadcastChannel still carries it */
    }
    return msg.id;
  }

  on<T extends BusType>(type: T, fn: (payload: BusPayloads[T], msg: BusMessage<T>) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (payload: unknown, msg: BusMessage) => void);
    this.handlers.set(type, list);
    return () => {
      const cur = this.handlers.get(type);
      if (!cur) return;
      const i = cur.indexOf(fn as (payload: unknown, msg: BusMessage) => void);
      if (i !== -1) cur.splice(i, 1);
    };
  }

  deliver(msg: BusMessage) {
    if (!msg || msg.v !== 1 || msg.from === this.id) return; // ignore our own
    if (this.seen.indexOf(msg.id) !== -1) return;
    this.seen.push(msg.id);
    if (this.seen.length > 200) this.seen.splice(0, 100);

    const list = this.handlers.get(msg.type) ?? [];
    for (const fn of list) {
      try {
        fn(msg.payload, msg);
      } catch {
        /* one bad handler must not stop the rest */
      }
    }

    // Prove receipt back to whoever sent it — "nothing happened" should never
    // be a silent question, it should be an answerable one. Only sources ack.
    if (list.length && this.role && msg.type !== "ping" && msg.type !== "ack") {
      this.send("ack", { forId: msg.id, forType: msg.type, role: this.role });
    }
  }
}
