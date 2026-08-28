/**
 * Rotating prompts. These are author-controlled HTML — the <b> tags are ours,
 * and no chat text ever reaches them.
 */

export const AWAY_PROMPTS = [
  "Type <b>!fate</b> — the moon still answers",
  "Every chatter becomes a <b>star</b> up there",
  "Keep talking and the <b>moon rises</b>",
  "Follow to put your name in the <b>sky</b>",
  "<b>!fate</b> works even while I'm gone",
  "The constellation is built from <b>whoever's talking</b>",
];

export const SOON_PROMPTS = [
  "Type <b>!fate</b> — the moon answers before we even start",
  "Every chatter becomes a <b>star</b> up there",
  "Follow now and your name is already in the <b>sky</b>",
  "Talk — the moon is listening <b>right now</b>",
  "Light it up before we <b>drop</b>",
  "The constellation is built from <b>whoever's talking</b>",
];

/**
 * Chill alternates flavour with literal command reveals — a viewer who only
 * ever glances at the screen once should still catch a command.
 */
export const CHILL_PROMPTS = [
  "Type <b>!wave</b> — send a comet across the sky",
  "Every chatter becomes a <b>star</b> up there",
  "Type <b>!heart</b> — find your own star and bloom it",
  "The sky shifts with <b>how chat feels</b>",
  "Type <b>!moon</b> — help raise it",
  "Keep talking and the <b>moon rises</b>",
  "Type <b>!fate</b> — the moon still answers",
  "The constellation is built from <b>whoever's talking</b>",
];

export const CHILL_COMMANDS = [
  { c: "!wave", d: "Send a comet across the sky" },
  { c: "!heart", d: "Bloom your own star" },
  { c: "!moon", d: "Help raise the moon" },
  { c: "!fate", d: "Ask the moon a question" },
];

export function promptsFor(mode: string, chill: boolean) {
  if (chill) return CHILL_PROMPTS;
  return mode === "soon" ? SOON_PROMPTS : AWAY_PROMPTS;
}
