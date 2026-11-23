/**
 * The control-bus wire contract.
 *
 * This used to be hand-duplicated between rawad-overlay.html and admin.html,
 * kept in sync by a rule in CLAUDE.md. It is now one module, and these types
 * are the enforcement. Nothing here may change without bumping BUILD.
 */

export const BUS_KEY = "rawad-control-msg";
export const BUS_CHANNEL = "rawad-control";
export const PRESENCE_KEY = "rawad-presence";
export const SETTINGS_KEY = "rawad-settings";
export const TALLY_KEY = "rawad-tally";
export const CLIENT_ID_KEY = "rawad-clientid";
export const CLIPS_KEY = "rawad-clips";
export const CLIP_PLAYS_KEY = "rawad-clip-plays";
export const CARDS_KEY = "rawad-cards";

/** Bumped only when the send/deliver contract changes. Shown in diagnostics. */
export const BUILD = "bus-5";

export type FollowStatus = "off" | "connecting" | "live" | "expired" | "error";
export type FollowSnapshot = {
  channel: string;
  owner: string;
  at: number;
  status: FollowStatus;
  notice: string;
  events: Array<{ id: string; user: string; at: number }>;
};

export type BusRole = "hud" | "scene";

export type TallyDef = { key: string; label: string };

export type TallyCounts = Record<string, number>;

export type LabKind = "" | "play" | "dev";

/** Settings the panel owns and the overlay persists. */
export type Settings = {
  labSummary: string;
  labDate: string;
  /** Short headline for the HUD lab card; the chat reply uses labSummary. */
  labTitle: string;
  labKind: LabKind;
  volume: number;
  muted: boolean;
  goalFollows: number;
  goalSubs: number;
  goalMessages: number;
  milestoneFollows: number;
  milestoneSubs: number;
  showMilestones: boolean;
  brbMinutes: number;
  fullMoonMessages: number;
  bigCheer: number;
  tallyDefs: TallyDef[];
  /** Shown as the AFK kicker; empty keeps the default line. */
  afkReason: string;
  /** Dock kill switch for !clip. Library stays put. */
  clipsEnabled: boolean;
};

/** A Twitch clip the dock has added to the rotation. */
export type ClipEntry = {
  slug: string;
  title: string;
  creator: string;
  duration: number;
  thumb: string;
  enabled: boolean;
  addedAt: number;
  /** True until Helix fills title / duration. Playable with a 30s default. */
  unresolved?: boolean;
};

export type ClipLibrary = { v: 1; clips: ClipEntry[] };

export type ClipPlayRecord = { count: number; lastAt: number };

export type ClipPlays = Record<string, ClipPlayRecord>;

export type ClipSnapshot = { slug: string; until: number } | null;

/** How a support card arranges its art around the text. */
export type CardLayout = "tile" | "art" | "row";

/**
 * One picture on a card. `src` is one of:
 *   lib:<name>        shipped in public/cards/ (always loads in OBS)
 *   up:<id>           uploaded in the dock, kept in IndexedDB on this PC
 *   twitch:sub:<ver>  the channel's own subscriber badge, read from Helix
 *   https://…         any image URL (Twitch emote CDN and the like)
 */
export type CardImage = { src: string; label: string };

/** Every condition that is set must hold; an empty one doesn't restrict. */
export type CardWhen = {
  /** "" any stream · "any" any lab night · or one lab kind */
  labs: "" | "any" | "play" | "dev";
  /** 0 = Sunday … 6 = Saturday, Eastern. Empty means every day. */
  days: number[];
  /** YYYY-MM-DD Eastern, inclusive. Empty means open-ended. */
  from: string;
  until: string;
};

export type SupportCard = {
  id: string;
  enabled: boolean;
  layout: CardLayout;
  kicker: string;
  title: string;
  /** `**word**` renders bold. Nothing else is markup. */
  body: string;
  /** Small link line under the body, e.g. pathofexile.com/twitchdrops */
  url: string;
  images: CardImage[];
  /** Vertical focus of the art layout's image, 0 top … 100 bottom. */
  focus: number;
  when: CardWhen;
};

export type CardLibrary = {
  v: 1;
  /** Master switch: off hides the card entirely. */
  on: boolean;
  /** Paused holds whichever card is up. */
  paused: boolean;
  seconds: number;
  /** Top-left of the 320×176 card on the stage. */
  x: number;
  y: number;
  cards: SupportCard[];
};

/** What the HUD is showing, for the dock's "on air" line. */
export type CardSnapshot = { id: string; until: number; eligible: number; hidden: boolean } | null;

/**
 * The panel deliberately sends a PARTIAL settings object — it has no UI for
 * brbMinutes / fullMoonMessages / bigCheer, and applySettings only overwrites
 * keys that are present, so those survive. Sending a full object would clobber
 * them with stale values.
 */
export type SettingsPatch = Partial<Settings>;

export type TotalsState = "off" | "ok" | "error" | "expired" | "noscope";

export type Totals = {
  follows: number | null;
  subs: number | null;
  followsState: TotalsState;
  subsState: TotalsState;
};

export type AwayState = "chill" | "afk" | "brb" | "soon" | "back" | "idle";

export type AwaySnapshot = {
  state: AwayState;
  until: number;
  since: number;
  follows: number;
  subs: number;
  messages: number;
};

export type PollSnapshot = { open: false } | { open: true; a: number; b: number; left: number };

export type HelloPayload = {
  role: BusRole;
  mode: string;
  demo: boolean;
  build: string;
  irc: string;
  eventsub: string;
  labNotice?: string;
  followNotice?: string;
  twitchNotice?: string;
  token: boolean;
  clientId: string;
  away: AwaySnapshot;
  tally: TallyCounts;
  poll: PollSnapshot;
  settings: Settings;
  /** Scene sources don't poll Helix, so they report no totals at all. */
  totals?: Totals;
  clipPlays: Record<string, number>;
  clip: ClipSnapshot;
  /** HUD only — scene sources don't mount the support card. */
  card?: CardSnapshot;
};

export type AckPayload = { forId: string; forType: string; role?: BusRole };

export type AlertKind =
  | "follow"
  | "welcome"
  | "sub"
  | "resub"
  | "gift"
  | "massgift"
  | "raid"
  | "cheer"
  | "bigcheer"
  | "wave"
  | "heart"
  | "moon"
  | "balloon"
  | "burst";

/** Every message that can cross the bus, with its exact payload. */
export type BusPayloads = {
  "follow.sync": FollowSnapshot;
  "away.brb": { minutes?: number };
  "away.soon": { minutes?: number };
  "away.afk": Record<string, never>;
  "away.back": Record<string, never>;
  "away.reset": Record<string, never>;
  "tally.bump": { key: string; delta: number };
  "tally.set": { key: string; value: number };
  "poll.open": { text: string; a: string; b: string };
  "poll.close": Record<string, never>;
  "alert.test": { kind: AlertKind; user?: string };
  "oracle.say": { line: string; who?: string };
  "oracle.fate": { user?: string };
  settings: SettingsPatch;
  clips: { clips: ClipEntry[] };
  "clip.play": { slug?: string };
  "clip.stop": Record<string, never>;
  "clip.resolve": { slug: string };
  "clip.meta": {
    slug: string;
    title: string;
    creator: string;
    duration: number;
    thumb: string;
  };
  cards: { library: CardLibrary };
  "card.show": { id: string };
  "card.next": Record<string, never>;
  ping: Record<string, never>;
  hello: HelloPayload;
  ack: AckPayload;
};

export type BusType = keyof BusPayloads;

export type BusMessage<T extends BusType = BusType> = {
  v: 1;
  id: string;
  ts: number;
  from: string;
  type: T;
  payload: BusPayloads[T];
};

export type PresenceRecord = {
  role: BusRole;
  mode: string;
  build: string;
  ts: number;
};
