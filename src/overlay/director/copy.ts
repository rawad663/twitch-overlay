/**
 * Alert copy. Same voice as the fates — the moon narrating, not a receipt
 * printer. `{u}` is the actor, `{r}` the recipient, `{n}` a count.
 */

export const FATES = [
  "The next rare you touch is worth more than you think. Sell it.",
  "Something in your stash has been waiting three leagues to be useful.",
  "You will die to a mechanic you have explained to chat before.",
  "Turn around. You walked past it.",
  "Your next six maps are quiet. The seventh is not.",
  "The build works. The pilot is the variable.",
  "Greed costs one portal tonight. Spend it early.",
  "A currency drop lands while you are reading this.",
  "You have enough regrets. Craft the item.",
  "The map you keep skipping holds the good one.",
  "Someone in chat is about to say the thing you needed to hear.",
  "Your gear is fine. Your resistances are not.",
  "Trade offer incoming. Take it.",
  "The boss dies this attempt if you stop dodging backwards.",
  "You are two levels from the passive that fixes everything.",
  "Log off one map later than you planned. Just one.",
  "A stranger will vouch for you tonight.",
  "That vendor recipe you forgot is worth doing.",
  "Nothing rare drops for an hour. Then everything does.",
  "The loot filter is hiding it from you on purpose.",
  "Your hideout is fine. Nobody is judging it. Some are.",
  "Patience, then violence. In that order.",
  "You will misclick something expensive. Breathe first.",
  "The moon says: hydrate, then run one more.",
];

export const COPY: Record<string, string[]> = {
  follow: [
    "{u} stepped into the moonlight.",
    "{u} is watching the sky with us now.",
    "The moon noticed {u}. So have we.",
    "{u} joined the vigil.",
    "One more shadow around the fire. Welcome, {u}.",
    "{u} followed the light all the way here.",
  ],
  follows: [
    "{n} new souls stepped into the moonlight.",
    "{n} more shadows around the fire. Welcome, all of you.",
    "The moon counted {n} arrivals. It approves.",
  ],
  sub: [
    "{u} swore an oath to the moon.",
    "The moon has a new devotee: {u}.",
    "{u} signed the pact. No takebacks.",
    "{u} chose the long night. Good choice.",
  ],
  resub: [
    "{u} has kept the vigil {n} months.",
    "{n} months and {u} still hasn't looked away.",
    "{u} renews the pact — {n} months deep.",
    "{n} months of loyalty from {u}. The moon remembers.",
  ],
  gift: [
    "{u} gifted {r} a sub. Generosity is its own magic.",
    "{u} handed {r} a place by the fire.",
    "{r} got pulled into the light by {u}.",
    "{u} paid {r}'s way into the vigil.",
  ],
  massgift: [
    "{u} loosed {n} subs on the sky.",
    "{n} subs from {u}. The whole chat owes them a drink.",
    "{u} went full moon and gifted {n}.",
    "{u} opened the vault — {n} subs, just like that.",
  ],
  raid: [
    "{u} broke through the clouds with {n}.",
    "{n} raiders behind {u}. Hold onto something.",
    "The sky splits — {u} arrives with {n}.",
    "{u} brought {n} souls with them. Make room.",
  ],
  cheer: [
    "{u} cheered {n} bits.",
    "{u} threw {n} bits at the moon.",
    "{n} bits from {u}. The moon accepts tribute.",
  ],
  bigcheer: [
    "{u} dropped {n} bits. The sky is listening.",
    "{n} bits from {u}. The moon actually flinched.",
    "{u} just lit the whole night up — {n} bits.",
  ],
  welcome: [
    "{u} steps out of the dark and says something.",
    "{u} speaks. The moon leans in.",
    "First words from {u}. Say hello back.",
    "{u} joins the fire for the first time tonight.",
  ],
};

export const WHO: Record<string, string> = {
  follow: "A new follower —",
  follows: "The gates open —",
  sub: "An oath sworn —",
  resub: "The vigil continues —",
  gift: "A gift given —",
  massgift: "The sky opens —",
  raid: "A raid arrives —",
  cheer: "Bits in the dark —",
  bigcheer: "Tribute paid —",
  welcome: "A new voice —",
};

export function pick<T>(a: readonly T[]): T {
  return a[(Math.random() * a.length) | 0]!;
}

/** Usernames come from chat — always escape before anything touches innerHTML. */
export function esc(s: unknown): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(s).replace(/[&<>"']/g, (c) => map[c]!);
}

export function b(s: unknown): string {
  return "<b>" + esc(s) + "</b>";
}

/** Fill {u} {r} {n}, bolding the parts that matter. */
export function phrase(set: string, vals: Record<string, string | number>): string {
  return pick(COPY[set]!).replace(/\{(u|r|n)\}/g, (_, k: string) => b(vals[k]));
}
