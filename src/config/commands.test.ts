import { describe, expect, it, vi } from "vitest";
import { handle, type ChatDeps } from "@/overlay/chat/handle";
import { parse } from "@/overlay/chat/parse";
import { DEFAULT_TALLY_DEFS } from "./config";
import { COMMANDS, tallyCommands, testerFor, type CommandInfo, type Who } from "./commands";

/** Everything allowed, so the only thing deciding the outcome is the permission gate. */
function deps(): ChatDeps {
  const ok = (cmd: string) => ({ cmd, ok: true, text: "ok" });
  return {
    chill: true,
    where: "away",
    ping: vi.fn(),
    star: vi.fn(),
    vibe: vi.fn(),
    balloons: vi.fn(),
    alerts: { welcome: vi.fn(), sub: vi.fn(), gift: vi.fn(), massGift: vi.fn(), raid: vi.fn(), cheer: vi.fn() },
    scene: { wave: vi.fn(), bloom: vi.fn(), brb: vi.fn(), soon: vi.fn(), afk: vi.fn(), back: vi.fn() },
    fate: vi.fn(),
    fatePoe: vi.fn(),
    say: vi.fn(),
    testAlert: vi.fn(),
    tally: { resolve: (w) => DEFAULT_TALLY_DEFS.find((d) => d.key === w || d.key === w + "s")?.key ?? null, bump: vi.fn(), set: vi.fn() },
    poll: { open: vi.fn(), close: vi.fn(), isOpen: () => true, vote: vi.fn() },
    firstMessage: () => false,
    cooldown: () => 0,
    moonHeadroom: () => 9,
    clip: () => ok("clip"),
    lab: () => ok("lab"),
    shoutout: () => ok("so"),
  };
}

const line = (c: CommandInfo) => c.test ?? c.usage.replace(/<[^>]+>/g, (m) => (m === "<n>" ? "3" : m === "<tally>" ? "maps" : "friend"));

async function as(c: CommandInfo, who: Who) {
  const t = testerFor(who);
  const badges = who === "rawad" ? "broadcaster/1" : t.mod ? "moderator/1" : "";
  const m = parse(`@badges=${badges};display-name=${t.user};id=x;mod=${t.mod ? 1 : 0} :${t.user}!x@x.tmi.twitch.tv PRIVMSG #rawad663 :${line(c)}`)!;
  return await handle(m, deps());
}

const rows = [...COMMANDS, ...tallyCommands(DEFAULT_TALLY_DEFS)];

describe("the dock's command list matches handle()", () => {
  it.each(rows.map((c) => [c.usage, c] as const))("%s", async (_, c) => {
    const allowed = await as(c, c.who);
    expect(allowed?.text).not.toBe("unknown command");
    expect(allowed?.text).not.toMatch(/only$/);

    if (c.who !== "anyone") expect((await as(c, "anyone"))?.text).toMatch(/only$/);
    if (c.who === "rawad") expect((await as(c, "mods"))?.text).toBe("Rawad only");
  });
});
