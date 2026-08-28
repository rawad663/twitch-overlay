import type { AwayState } from "@/bus/types";

export type Star = {
  x: number;
  y: number;
  name: string;
  born: number;
  last: number;
  bright: number;
};

export type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  name: string;
  /** ember = a gain (sub/gift/raid). Follows and waves stay violet. */
  ember: boolean;
};

export type Bloom = { x: number; y: number; vx: number; vy: number; life: number; max: number };

export type Dust = { x: number; y: number; r: number; a: number; vy: number; vx: number };

export type Mote = { a: number; sp: number; r: number; size: number };

/** What the engine hands React, at a few Hz — never per frame. */
export type SceneStatus = {
  state: AwayState;
  kicker: string;
  title: string;
  timer: string;
  sub: string;
  over: boolean;
  goals: Array<{ label: string; value: number; target: number; done: boolean }>;
};
