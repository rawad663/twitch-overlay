import { CONFIG } from "@/config/config";
import type { Director, AlertEvent } from "./director";
import { WHO, phrase } from "./copy";

export type AlertSinks = {
  /** the scene's shooting star for this event */
  note: (type: string, name: string) => void;
  /** lifetime milestone counters (HUD only) */
  bump: (kind: "follows" | "subs", n: number) => void;
};

/**
 * Turns Twitch events into banners. The merging rules here exist because
 * Twitch's raw event stream is much noisier than a viewer wants to watch.
 */
export class Alerts {
  /**
   * Twitch sends submysterygift AND an individual subgift per recipient.
   * Without this, a 20-sub bomb would fire 21 banners.
   */
  private giftBomb = new Map<string, { left: number; until: number }>();

  /**
   * The same user cheering repeatedly within a few seconds collapses into one
   * banner rather than a stutter of them.
   */
  private cheerLog = new Map<string, { at: number; total: number; evt: AlertEvent }>();

  constructor(
    private director: Director,
    private sinks: AlertSinks,
  ) {}

  /** Merge follows that are still waiting, so a raid-flood is one banner, not twenty. */
  follow(user: string) {
    this.sinks.note("follow", user);
    this.sinks.bump("follows", 1);

    const waiting = this.director.pending("follow");
    if (waiting) {
      waiting.names.push(user);
      const n = waiting.names.length;
      waiting.who = WHO.follows!;
      waiting.html = phrase("follows", { n });
      this.director.touch(waiting);
      return;
    }
    const evt = this.director.push("follow", WHO.follow!, phrase("follow", { u: user }));
    evt.names = [user];
    return evt;
  }

  welcome(user: string) {
    this.director.push("welcome", WHO.welcome!, phrase("welcome", { u: user }));
  }

  sub(user: string, months?: string | number) {
    this.sinks.note("sub", user);
    const m = parseInt(String(months ?? ""), 10) || 0;
    // resubs are already in the lifetime total — bumping would overshoot until the next poll
    if (m <= 1) this.sinks.bump("subs", 1);
    if (m > 1) this.director.push("sub", WHO.resub!, phrase("resub", { u: user, n: m }));
    else this.director.push("sub", WHO.sub!, phrase("sub", { u: user }));
  }

  massGift(user: string, count?: string | number) {
    this.sinks.note("massgift", user);
    const n = parseInt(String(count ?? ""), 10) || 1;
    this.sinks.bump("subs", n);
    this.giftBomb.set(user, { left: n, until: Date.now() + 15000 });
    this.director.push("massgift", WHO.massgift!, phrase("massgift", { u: user, n }));
  }

  gift(user: string, recipient?: string) {
    const bomb = this.giftBomb.get(user);
    if (bomb && bomb.left > 0 && Date.now() < bomb.until) {
      bomb.left--; // part of a bomb we already announced
      return;
    }
    this.sinks.note("gift", user); // only the gifts that actually announce
    this.sinks.bump("subs", 1);
    this.director.push(
      "gift",
      WHO.gift!,
      phrase("gift", { u: user, r: recipient || "someone" }),
    );
  }

  raid(user: string, viewers?: string | number) {
    this.sinks.note("raid", user);
    const n = parseInt(String(viewers ?? ""), 10) || 0;
    this.director.push("raid", WHO.raid!, phrase("raid", { u: user, n }));
  }

  cheer(user: string, bits?: string | number) {
    const n = parseInt(String(bits ?? ""), 10) || 0;
    if (!n) return;
    const now = Date.now();

    const recent = this.cheerLog.get(user);
    if (recent && now - recent.at < 6000) {
      recent.at = now;
      recent.total += n;
      const t = recent.total;
      const big = t >= CONFIG.bigCheer;
      // only rewrite it if it hasn't already been on screen and gone
      if (this.director.pending(big ? "bigcheer" : "cheer") === recent.evt) {
        recent.evt.who = big ? WHO.bigcheer! : WHO.cheer!;
        recent.evt.html = phrase(big ? "bigcheer" : "cheer", { u: user, n: t });
        this.director.touch(recent.evt);
        return;
      }
    }

    const big = n >= CONFIG.bigCheer;
    const evt = this.director.push(
      big ? "bigcheer" : "cheer",
      big ? WHO.bigcheer! : WHO.cheer!,
      phrase(big ? "bigcheer" : "cheer", { u: user, n }),
    );
    this.cheerLog.set(user, { at: now, total: n, evt });
  }
}
