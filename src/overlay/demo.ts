import type { ChatDeps } from "./chat/handle";
import type { Scene } from "./engine/scene";

const NAMES = [
  "exilewick",
  "moonlitgrind",
  "ruinbound",
  "chaosorbit",
  "vaal_kitten",
  "sixlink_sam",
];

const CROWD = Array.from({ length: 12 }, (_, i) => `wanderer_${i + 1}`);

const CHATTER = [
  "pog that drop",
  "lol no way",
  "chill vibes tonight",
  "gg",
  "this build is cracked",
  "gm everyone",
  "cozy stream",
  "sheesh",
  "hello!",
  "that was insane",
];

const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0]!;

/**
 * Fake traffic so the overlay can be designed in a browser. Runs instead of
 * IRC, never alongside it — outside OBS this is the default, and `?live=1`
 * turns it off.
 */
export function startDemo({
  chill,
  deps,
  scene,
}: {
  chill: boolean;
  deps: () => ChatDeps;
  scene: () => Scene | null;
}) {
  const timers: Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = [];
  const every = (ms: number, fn: () => void) => timers.push(setInterval(fn, ms));
  const once = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  const all = [...NAMES, ...CROWD];

  // steady chatter — feeds the moon, the stars and the vibe
  every(900, () => {
    const d = deps();
    const who = pick(all);
    d.ping();
    d.star(who, who);
    d.vibe(pick(CHATTER));
  });

  once(2500, () => deps().fate(pick(NAMES)));
  every(16000, () => deps().fate(pick(NAMES)));

  if (chill) {
    every(11000, () => scene()?.wave(pick(NAMES)));
    every(7000, () => {
      const r = scene()?.recent;
      if (r?.length) scene()?.bloom(pick(r));
    });
  }

  every(21000, () => deps().alerts.welcome(pick(NAMES)));
  every(27000, () => deps().alerts.sub(pick(NAMES), 1));
  every(41000, () => deps().alerts.gift(pick(NAMES), pick(CROWD)));
  every(30000, () => deps().alerts.cheer(pick(NAMES), 1200));
  once(4000, () => deps().testAlert("burst", pick(NAMES)));

  every(8000, () => {
    const d = deps();
    if (!d.poll.isOpen()) d.poll.open("Run it again?", "Yes", "No");
  });
  every(600, () => {
    const d = deps();
    if (d.poll.isOpen()) d.poll.vote(pick(all) + Math.random(), Math.random() > 0.45 ? "a" : "b");
  });

  every(1400, () => {
    const d = deps();
    const key = d.tally.resolve(pick(["maps", "deaths", "mirrors"]));
    if (key && Math.random() > 0.5) d.tally.bump(key, 1);
  });

  return () => {
    for (const t of timers) {
      clearInterval(t as ReturnType<typeof setInterval>);
      clearTimeout(t as ReturnType<typeof setTimeout>);
    }
  };
}
