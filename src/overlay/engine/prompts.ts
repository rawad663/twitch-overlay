/**
 * Rotating prompts. These are author-controlled HTML — the <b> tags are ours,
 * and no chat text ever reaches them.
 */

export const AWAY_PROMPTS = [
  "Type <b>!fate</b> — the moon still answers",
  "Type <b>!clip</b> — the moon still has highlights",
  "Every chatter becomes a <b>star</b> up there",
  "Keep talking and the <b>moon rises</b>",
  "Follow to put your name in the <b>sky</b>",
  "<b>!fate</b> works even while I'm gone",
  "The constellation is built from <b>whoever's talking</b>",
];

export const SOON_PROMPTS = [
  "Type <b>!fate</b> — the moon answers before we even start",
  "Type <b>!clip</b> — warm up with a highlight",
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
  "Type <b>!clip</b> — pull a highlight over the moon",
  "The sky shifts with <b>how chat feels</b>",
  "Type <b>!moon</b> — help raise it",
  "Keep talking and the <b>moon rises</b>",
  "Type <b>!fate</b> — the moon still answers",
  "Type <b>!fatepoe</b> — Wraeclast still talks",
  "The constellation is built from <b>whoever's talking</b>",
];

export const CHILL_COMMANDS = [
  { c: "!wave", d: "Send a comet across the sky" },
  { c: "!heart", d: "Bloom your own star" },
  { c: "!moon", d: "Help raise the moon" },
  { c: "!clip", d: "Play a highlight over the moon" },
  { c: "!fate", d: "Ask the moon a question" },
  { c: "!fatepoe", d: "Ask the moon about Wraeclast" },
];

export function promptsFor(mode: string, chill: boolean, clipsOn = true) {
  const all = chill ? CHILL_PROMPTS : mode === "soon" ? SOON_PROMPTS : AWAY_PROMPTS;
  return clipsOn ? all : all.filter((p) => !p.includes("!clip"));
}

export function commandsFor(clipsOn: boolean) {
  return clipsOn ? CHILL_COMMANDS : CHILL_COMMANDS.filter((c) => c.c !== "!clip");
}
