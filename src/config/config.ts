import type { Settings, TallyDef } from "@/bus/types";

/**
 * Product defaults. Edit these for channel / cooldowns / copy — everything
 * else in `src/` is the product itself.
 *
 * Anything the admin dock can change also appears in `Settings`; saved dock
 * settings win over these and over URL params.
 */
export const CONFIG = {
  channel: "rawad663",

  /** messages in a 60s window that count as a full moon */
  fullMoonMessages: 25,
  /** seconds a viewer must wait between !fate rolls */
  fateCooldown: 120,
  pollSeconds: 60,

  /** public app id only — never a secret. Overridden by ?client_id= */
  clientId: "",

  /** bits at or above this get the loud treatment */
  bigCheer: 1000,
  /** ms between banners */
  alertGap: 650,
  queueCap: 10,

  volume: 0.5,
  brbMinutes: 15,

  maxStars: 120,
  starLabels: 8,
  constellation: 6,

  /** away-scene session goals (not the HUD's lifetime milestones) */
  goalFollows: 10,
  goalSubs: 3,
  goalMessages: 100,

  /**
   * Bounding SQUARE of the chill camera frame, [x1, y1, x2, y2]. The frame
   * drawn is the circle inscribed in it — see `cameraCircle` in design/stage.
   */
  camera: [80, 300, 700, 920] as [number, number, number, number],
  chillName: "Rawad",
  chillTagline: "Just chatting · chill stream",
  chillTopics: [
    "Path of Exile · maps & mayhem",
    "Chat runs the vibe tonight",
    "Ask me anything — !fate decides",
    "Build talk · loot talk · life talk",
    "Stick around, it gets weirder",
  ],
  topicSeconds: 12,

  waveCooldown: 45,
  moonCooldown: 180,
  /** messages-worth of energy one !moon is worth */
  moonNudge: 3,
  /** how long the full command list leads before collapsing to one line */
  guideSeconds: 15,

  /** HUD lifetime milestone targets */
  milestoneFollows: 1300,
  milestoneSubs: 50,
  showMilestones: true,
  totalsPollSeconds: 60,
};

export type Config = typeof CONFIG;

export const DEFAULT_TALLY_DEFS: TallyDef[] = [
  { key: "maps", label: "Maps" },
  { key: "deaths", label: "Deaths" },
  { key: "mirrors", label: "Mirrors" },
];

export const DEFAULT_SETTINGS: Settings = {
  volume: CONFIG.volume,
  muted: false,
  goalFollows: CONFIG.goalFollows,
  goalSubs: CONFIG.goalSubs,
  goalMessages: CONFIG.goalMessages,
  milestoneFollows: CONFIG.milestoneFollows,
  milestoneSubs: CONFIG.milestoneSubs,
  showMilestones: CONFIG.showMilestones,
  brbMinutes: CONFIG.brbMinutes,
  fullMoonMessages: CONFIG.fullMoonMessages,
  bigCheer: CONFIG.bigCheer,
  tallyDefs: DEFAULT_TALLY_DEFS,
  afkReason: "",
};
