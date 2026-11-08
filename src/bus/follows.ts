import type { Bus } from "./bus";
import { readJSON, writeJSON } from "./storage";
import type { FollowSnapshot, FollowStatus } from "./types";

type Sink = {
  follow: (user: string, id?: string) => void;
  status: (status: FollowStatus) => void;
  notice: (notice: string) => void;
};

const FRESH_MS = 6000;
const RETAIN_MS = 30000;

/** One exclusive browser lock owns Twitch; all sources consume the same journal.
 * The dedicated storage key keeps bursts intact when OBS only supports polling
 * and unrelated control messages overwrite the bus's last-message slot.
 * Tokens never leave the source that owns the connection.
 */
export class SharedFollows {
  private stopped = false;
  private requesting = false;
  private release: (() => void) | null = null;
  private disconnect: (() => void) | null = null;
  private off: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private snapshot: FollowSnapshot | null = null;
  private latest: FollowSnapshot | null = null;
  private seen = new Map<string, number>();
  private since = Date.now();
  private lastAt = 0;
  private key: string;

  constructor(
    private bus: Bus,
    private channel: string,
    private eligible: boolean,
    private connect: (sink: Sink) => () => void,
    private onFollow: (user: string) => void,
    private onState: (status: FollowStatus, notice: string) => void,
    private locks: Pick<LockManager, "request"> | undefined = globalThis.navigator?.locks,
  ) {
    this.key = `rawad-follows-${channel}`;
  }

  start() {
    // A newly loaded source must not replay follows from before it existed.
    const previous = readJSON<FollowSnapshot>(this.key);
    if (Array.isArray(previous?.events)) {
      for (const event of previous.events) this.seen.set(event.id, event.at);
    }
    this.off = this.bus.on("follow.sync", (snapshot) => this.receive(snapshot));
    this.poll = setInterval(() => this.read(), 500);
    this.heartbeat = setInterval(() => {
      if (this.snapshot) this.publish();
      else void this.acquire();
    }, 2000);
    this.read();
    void this.acquire();
    return this;
  }

  private read() {
    if (this.stopped || this.snapshot) return;
    const stored = readJSON<FollowSnapshot>(this.key);
    if (stored) this.receive(stored);
    if (Date.now() - this.lastAt > FRESH_MS) {
      this.onState(this.eligible ? "connecting" : "off",
        this.eligible ? "Waiting for the shared Twitch listener" : "No shared Twitch listener — authorize at least one loaded source");
      if (this.eligible && !this.locks) this.unavailable();
    }
  }

  private unavailable() {
    this.onState("error", "Shared follow listener unavailable — update OBS and use the HTTPS overlay URL");
  }

  private async acquire() {
    if (this.stopped || !this.eligible || this.requesting) return;
    if (!this.locks) { this.unavailable(); return; }
    this.requesting = true;
    try {
      await this.locks.request(this.key, { ifAvailable: true }, async (lock) => {
        if (!lock || this.stopped) return;
        const held = new Promise<void>((resolve) => { this.release = resolve; });
        this.snapshot = {
          channel: this.channel, owner: this.bus.id, at: Date.now(),
          status: "connecting", notice: "", events: this.latest?.events ?? [],
        };
        this.publish();
        try {
          this.disconnect = this.connect({
            follow: (user, id) => {
              if (!this.snapshot || this.stopped) return;
              const eventId = id ?? `${this.bus.id}-${Date.now()}-${Math.random()}`;
              if (this.seen.has(eventId)) return;
              this.snapshot.events.push({ id: eventId, user, at: Date.now() });
              this.publish();
            },
            status: (status) => {
              if (!this.snapshot || this.stopped) return;
              this.snapshot.status = status;
              this.publish();
            },
            notice: (notice) => {
              if (!this.snapshot || this.stopped) return;
              this.snapshot.notice = notice;
              this.publish();
            },
          });
          await held;
        } finally {
          this.disconnect?.();
          this.disconnect = null;
          this.snapshot = null;
          this.release = null;
        }
      });
    } catch {
      if (!this.stopped) this.unavailable();
    } finally {
      this.requesting = false;
    }
  }

  private publish() {
    if (!this.snapshot || this.stopped) return;
    const now = Date.now();
    this.snapshot.at = now;
    this.snapshot.events = this.snapshot.events.filter((e) => now - e.at < RETAIN_MS).slice(-200);
    const snapshot = { ...this.snapshot, events: [...this.snapshot.events] };
    writeJSON(this.key, snapshot);
    this.bus.send("follow.sync", snapshot);
    this.receive(snapshot);
  }

  private receive(snapshot: FollowSnapshot) {
    if (this.stopped || snapshot.channel !== this.channel || !Array.isArray(snapshot.events)) return;
    if (this.snapshot && snapshot.owner !== this.bus.id) return;
    const now = Date.now();
    if (now - snapshot.at > FRESH_MS || snapshot.at < this.lastAt) return;
    this.lastAt = snapshot.at;
    this.latest = snapshot;
    this.onState(snapshot.status, snapshot.notice);
    for (const [id, at] of this.seen) if (now - at >= RETAIN_MS) this.seen.delete(id);
    for (const event of snapshot.events) {
      if (event.at < this.since || now - event.at >= RETAIN_MS || this.seen.has(event.id)) continue;
      this.seen.set(event.id, event.at);
      this.onFollow(event.user);
    }
  }

  destroy() {
    this.stopped = true;
    this.off?.();
    if (this.poll) clearInterval(this.poll);
    if (this.heartbeat) clearInterval(this.heartbeat);
    // Close Twitch before releasing the lock so the next owner cannot overlap.
    this.disconnect?.();
    this.disconnect = null;
    this.release?.();
  }
}
