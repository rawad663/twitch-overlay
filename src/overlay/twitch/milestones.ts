import type { Totals } from "@/bus/types";
import { fetchTotal, resolveUserId, type Auth, type TotalResult } from "./helix";

export const EMPTY_TOTALS: Totals = {
  follows: null,
  subs: null,
  followsState: "off",
  subsState: "off",
};

/**
 * Lifetime follower / sub totals, polled from Helix. Only the HUD runs this —
 * a scene source has no milestone widget, and two sources polling would double
 * the API traffic for one number.
 */
export class Milestones {
  private userId: string | null = null;
  totals: Totals = { ...EMPTY_TOTALS };

  constructor(
    private auth: Auth,
    private channel: string,
    private onChange: (t: Totals) => void,
    /** surfaced in the HUD's corner notice */
    private onNotice: (text: string) => void,
  ) {}

  /** Local optimistic bump so a live event moves the bar before the next poll. */
  bump(kind: "follows" | "subs", n: number) {
    const cur = this.totals[kind];
    if (cur === null) return;
    this.totals = { ...this.totals, [kind]: cur + n };
    this.onChange(this.totals);
  }

  private apply(kind: "follows" | "subs", result: TotalResult, next: Totals) {
    const stateKey = kind === "follows" ? "followsState" : "subsState";

    if (result.state === "ok") {
      next[kind] = result.total ?? null;
      next[stateKey] = "ok";
      return;
    }
    if (result.state === "expired" || result.state === "noscope") {
      // a 401 on subs while follows still works is almost always a missing scope
      if (kind === "subs" && result.state === "expired" && next.followsState === "ok") {
        next.subsState = "noscope";
      } else {
        next[stateKey] = result.state;
      }
      if (kind === "follows" && result.state === "expired") {
        this.onNotice("twitch token expired");
      }
      return;
    }
    // a transient error must not blank a total we already have
    if (next[kind] === null) next[stateKey] = result.state;
  }

  async refresh() {
    if (!this.auth.token || !this.auth.clientId) {
      this.totals = { ...this.totals, followsState: "off", subsState: "off" };
      this.onChange(this.totals);
      return;
    }

    if (!this.userId) this.userId = await resolveUserId(this.auth, this.channel);
    if (!this.userId) {
      this.totals = { ...this.totals, followsState: "error", subsState: "error" };
      this.onChange(this.totals);
      return;
    }

    const [f, s] = await Promise.all([
      // follower totals work with any valid token, subs need the scope
      fetchTotal(this.auth, `channels/followers?broadcaster_id=${this.userId}&first=1`),
      fetchTotal(this.auth, `subscriptions?broadcaster_id=${this.userId}&first=1`),
    ]);

    const next: Totals = { ...this.totals };
    this.apply("follows", f, next);
    this.apply("subs", s, next);
    this.totals = next;
    this.onChange(next);
  }
}
