import type { TallyDef } from "@/bus/types";
import { CONFIG } from "./config";

/** Who `handle()` lets through. `commands.test.ts` checks every row against it. */
export type Who = "anyone" | "mods" | "rawad";

export type CommandInfo = {
  /** what a viewer types, args included, e.g. `!so <channel>` */
  usage: string;
  /** the line the dock's Test button sends; omitted when the command needs an argument only you can pick */
  test?: string;
  who: Who;
  what: string;
  where: string;
  /** a test of this changes something real (a count, the away scene) — said next to the button */
  live?: string;
};

const mins = (s: number) => (s % 60 ? `${s}s` : `${s / 60} min`);

/**
 * Every chat command, as the dock lists it. Copy only: the behaviour lives in
 * `overlay/chat/handle.ts`, and the test file fails if a row's `who` ever
 * stops matching what handle() actually allows.
 */
export const COMMANDS: CommandInfo[] = [
  {
    usage: "!fate",
    test: "!fate",
    who: "anyone",
    what: "Real-life oracle roll in a banner",
    where: `HUD and lounge · ${mins(CONFIG.fateCooldown)} per viewer`,
  },
  {
    usage: "!fatepoe",
    test: "!fatepoe",
    who: "anyone",
    what: "Path of Exile oracle roll",
    where: "HUD and lounge · shares the !fate cooldown",
  },
  {
    usage: "!lab",
    test: "!lab",
    who: "anyone",
    what: "Today's lab, answered in chat",
    where: "any source · 15s shared cooldown · needs the chat sign-in",
  },
  {
    usage: "!clip",
    test: "!clip",
    who: "anyone",
    what: "Plays the least-shown clip from the library",
    where: `away / lounge: anyone · over gameplay (HUD): mods and you · ${mins(CONFIG.clipCooldown)} between clips, ${mins(CONFIG.clipUserCooldown)} per viewer`,
    live: "really plays and starts the cooldown",
  },
  {
    usage: "!wave",
    test: "!wave",
    who: "anyone",
    what: "A shooting star with the viewer's name",
    where: `lounge only · ${mins(CONFIG.waveCooldown)} per viewer`,
  },
  {
    usage: "!heart",
    test: "!heart",
    who: "anyone",
    what: "Blooms the viewer's own star",
    where: `lounge only · ${mins(CONFIG.waveCooldown)} per viewer`,
  },
  {
    usage: "!moon",
    test: "!moon",
    who: "anyone",
    what: "Nudges the chat-energy moon (never all the way to full)",
    where: `lounge only · ${mins(CONFIG.moonCooldown)} per viewer`,
  },
  {
    usage: "!1 / !2",
    test: "!1",
    who: "anyone",
    what: "Votes in the open poll, once per viewer",
    where: "while a poll is open (shown on the HUD)",
  },
  {
    usage: "!so <channel>",
    who: "rawad",
    what: "Shoutout: their top clip with audio, a “go check them out” card and a chat line",
    where: "wherever clips are showing · needs the Twitch sign-in",
    live: "plays their clip; the chat line is not posted from here",
  },
  {
    usage: "!undo <tally>",
    who: "mods",
    what: "Takes one off a tally",
    where: "HUD strip",
  },
  {
    usage: "!set <tally> <n>",
    who: "mods",
    what: "Sets a tally to a number",
    where: "HUD strip",
  },
  {
    usage: "!poll Question | A | B",
    test: "!poll Test poll? | Yes | No",
    who: "mods",
    what: "Opens a 60s poll",
    where: "HUD",
    live: "opens a real poll",
  },
  { usage: "!endpoll", test: "!endpoll", who: "mods", what: "Closes the poll", where: "HUD" },
  {
    usage: "!say <text>",
    test: "!say Testing the banner",
    who: "mods",
    what: "Shows your text in a banner",
    where: "HUD and lounge",
    live: "shows on stream",
  },
  {
    usage: "!testalert [kind]",
    test: "!testalert sub",
    who: "mods",
    what: "Fires a fake alert (follow, sub, raid, burst…)",
    where: "HUD and lounge",
    live: "shows on stream",
  },
  {
    usage: "!brb [min] · !soon [min] · !afk · !back",
    test: "!afk",
    who: "mods",
    what: "Switches the away scene; the HUD hands clips over",
    where: "away scene (the lounge ignores them)",
    live: "really switches the away scene — !back after",
  },
];

/** One row per dock tally, since their command words are yours to rename. */
export function tallyCommands(defs: readonly TallyDef[]): CommandInfo[] {
  return defs.map((d) => ({
    usage: `!${d.key}`,
    test: `!${d.key}`,
    who: "mods",
    what: `+1 ${d.label} (singular or plural both work)`,
    where: "HUD strip",
    live: `really bumps ${d.label} — !undo ${d.key} after`,
  }));
}

/** The viewer the dock tests as, so the Test button checks the permission it claims. */
export function testerFor(who: Who): { user: string; mod: boolean } {
  if (who === "rawad") return { user: CONFIG.channel, mod: true };
  if (who === "mods") return { user: "test_mod", mod: true };
  return { user: "test_viewer", mod: false };
}
