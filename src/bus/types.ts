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

/** Bumped only when the send/deliver contract changes. Shown in diagnostics. */
export const BUILD = "bus-1";

export type BusRole = "hud" | "scene";

export type TallyDef = { key: string; label: string };

export type TallyCounts = Record<string, number>;

/** Settings the panel owns and the overlay persists. */
export type Settings = {
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
};

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
  token: boolean;
  clientId: string;
  away: AwaySnapshot;
  tally: TallyCounts;
  poll: PollSnapshot;
  settings: Settings;
  /** Scene sources don't poll Helix, so they report no totals at all. */
  totals?: Totals;
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
  | "burst";

/** Every message that can cross the bus, with its exact payload. */
export type BusPayloads = {
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
