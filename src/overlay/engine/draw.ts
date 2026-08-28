import { CONFIG } from "@/config/config";
import { STAGE_H, STAGE_W } from "@/design/stage";
import type { Scene } from "./scene";

type G = CanvasRenderingContext2D;
const TAU = 6.283;

/**
 * One frame. The ORDER here is load-bearing and every step's comment says why —
 * it took a while to find a sequence where the constellation, the camera hole
 * and the comets all behave.
 */
export function drawFrame(g: G, sc: Scene, now: number) {
  const t = now / 1000;
  g.clearRect(0, 0, STAGE_W, STAGE_H);

  const v = sc.chill ? sc.vibe.step(sc.beats, CONFIG.fullMoonMessages) : null;

  // Backdrop. Away modes keep their literal colours so nothing about the
  // existing scene shifts; chill reads its palette off the vibe instead.
  const bg = g.createRadialGradient(
    sc.chill ? sc.moonX : 1360,
    sc.chill ? sc.moonY : 360,
    80,
    960,
    540,
    1400,
  );
  bg.addColorStop(0, v ? sc.vibe.rgb("top", 1) : "#1a1030");
  bg.addColorStop(0.55, v ? sc.vibe.rgb("mid", 1) : "#0b0718");
  bg.addColorStop(1, "#06040d");
  g.fillStyle = bg;
  g.fillRect(0, 0, STAGE_W, STAGE_H);

  if (sc.chill) drawNebula(g, sc, t);

  drawDust(g, sc, v ? v.drift : 1);

  // Lines first so the moon occludes them — otherwise the constellation draws
  // straight across the moon's face and looks like scratches.
  drawLines(g, sc);

  /* The camera hole is punched after the constellation but before the bright
     elements, and that ordering is the whole trick: lines get clipped at the
     frame instead of drifting across your face, while a comet still streaks in
     front of the webcam like it's meant to. */
  if (sc.chill) {
    drawCamera(g, sc, t);
    drawNameplate(g, sc, now, t);
  }

  drawMoonBig(g, sc, now, t);
  drawStars(g, sc, now, t);
  drawShots(g, sc);
  drawBlooms(g, sc);
}

/* ── ambient dust ── */
function drawDust(g: G, sc: Scene, drift: number) {
  for (const d of sc.dust) {
    d.tw += d.sp * drift;
    g.globalAlpha = d.a * (0.55 + 0.45 * Math.sin(d.tw));
    g.fillStyle = "#cdbbeb";
    g.beginPath();
    g.arc(d.x, d.y, d.r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * Letter-spaced caps, laid out a glyph at a time. `ctx.letterSpacing` is too
 * new to count on in every OBS CEF build, so this does the tracking by hand
 * rather than betting the render loop on a young API.
 */
export function tracked(g: G, text: string, cx: number, y: number, px: number, em = 0.3) {
  const s = String(text).toUpperCase();
  const sp = px * em;
  g.font = `600 ${px}px Rajdhani, sans-serif`;

  let w = -sp;
  for (const ch of s) w += g.measureText(ch).width + sp;

  let x = cx - w / 2;
  const align = g.textAlign;
  g.textAlign = "left";
  for (const ch of s) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + sp;
  }
  g.textAlign = align;
}

/**
 * The camera source sits BEHIND this browser source in OBS, so the frame is a
 * hole punched through the backdrop rather than something drawn on top of it:
 * clear inside the circle so the webcam shows through, feather its edge so it
 * dissolves into the sky instead of ending on a hard cut, then lay the ring and
 * the energy orbit over the seam.
 */
function drawCamera(g: G, sc: Scene, t: number) {
  const c = sc.cam();
  const x = c.cx - c.r;
  const y = c.cy - c.r;
  const d = c.r * 2;
  const energy = sc.energy();

  g.save();
  g.beginPath();
  g.arc(c.cx, c.cy, c.r, 0, TAU);
  g.clip();
  g.clearRect(x, y, d, d);

  // In a browser preview there is no camera behind us, so the hole would just
  // show the page — stand one in so the frame reads as a frame.
  if (sc.demo) {
    g.fillStyle = "rgba(18,10,34,.92)";
    g.fillRect(x, y, d, d);
    g.font = "600 15px Rajdhani, sans-serif";
    g.fillStyle = "rgba(243,238,228,.3)";
    g.textAlign = "center";
    g.fillText("CAMERA", c.cx, c.cy);
    g.textAlign = "left";
  }

  // feathered edge: clear in the middle, dark by the time it reaches the ring,
  // so there is no visible rim where the webcam stops
  const vig = g.createRadialGradient(c.cx, c.cy, c.r * 0.62, c.cx, c.cy, c.r);
  vig.addColorStop(0, "rgba(6,4,13,0)");
  vig.addColorStop(1, "rgba(6,4,13,.85)");
  g.fillStyle = vig;
  g.fillRect(x, y, d, d);
  g.restore();

  // ring, breathing with chat energy
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  g.save();
  g.shadowColor = sc.vibe.rgb("glow", 0.5 + 0.35 * energy);
  g.shadowBlur = 24 + 26 * energy * pulse;
  g.strokeStyle = `rgba(169,123,255,${0.34 + 0.3 * energy})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c.cx, c.cy, c.r, 0, TAU);
  g.stroke();
  g.restore();

  // brush accents — the arc version of the swoosh under the wordmark
  g.strokeStyle = "rgba(243,238,228,.5)";
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.arc(c.cx, c.cy, c.r, -2.88, -2.09);
  g.stroke();
  g.beginPath();
  g.arc(c.cx, c.cy, c.r, 0.26, 1.05);
  g.stroke();
  g.lineCap = "butt";

  drawOrbit(g, sc, c, energy);
}

/**
 * Chat energy as an arc around the frame — the same reading the moon gives on
 * the right, close enough to your face to catch on camera.
 */
function drawOrbit(g: G, sc: Scene, c: { cx: number; cy: number; r: number }, energy: number) {
  const ro = c.r + 26;

  g.strokeStyle = "rgba(169,123,255,.13)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c.cx, c.cy, ro, 0, TAU);
  g.stroke();

  // starts at the top and fills clockwise
  const a0 = -Math.PI / 2;
  const a1 = a0 + TAU * energy;
  if (energy > 0.004) {
    g.save();
    g.shadowColor = sc.vibe.rgb("glow", 0.55);
    g.shadowBlur = 14;
    g.strokeStyle = sc.vibe.rgb("glow", 0.72);
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.arc(c.cx, c.cy, ro, a0, a1);
    g.stroke();
    g.restore();

    g.fillStyle = "rgba(243,238,228,.85)";
    g.beginPath();
    g.arc(c.cx + ro * Math.cos(a1), c.cy + ro * Math.sin(a1), 3.2, 0, TAU);
    g.fill();
  }

  // motes drifting round the outside, sped up by the mood
  const drift = sc.vibe.cur ? sc.vibe.cur.drift : 1;
  for (const m of sc.motes) {
    m.a += m.sp * drift;
    m.tw += 0.02;
    const rr = ro + m.off + 5 * Math.sin(m.tw);
    g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(m.tw));
    g.fillStyle = "#cdbbeb";
    g.beginPath();
    g.arc(c.cx + rr * Math.cos(m.a), c.cy + rr * Math.sin(m.a), m.r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * Two very soft clouds drifting behind everything. Low alpha on purpose: this
 * should read as depth in the sky, never as a shape. Violet→rune only — ember
 * is reserved for gains.
 */
function drawNebula(g: G, sc: Scene, t: number) {
  const energy = sc.energy();
  const blobs: Array<[number, number, number, "glow" | "top", number]> = [
    [1450, 300, 520, "glow", 0.05],
    [640, 760, 620, "top", 0.07],
  ];
  blobs.forEach(([bx, by, br, key, alpha], i) => {
    const x = bx + 40 * Math.sin(t * 0.045 + i * 2.1);
    const y = by + 26 * Math.cos(t * 0.037 + i);
    const grd = g.createRadialGradient(x, y, 0, x, y, br);
    grd.addColorStop(0, sc.vibe.rgb(key, alpha * (0.6 + 0.6 * energy)));
    grd.addColorStop(1, sc.vibe.rgb(key, 0));
    g.fillStyle = grd;
    g.fillRect(x - br, y - br, br * 2, br * 2);
  });
}

/**
 * The identity block above the frame: wordmark, swoosh, tagline, a slowly
 * rotating line and a live readout of the room. Every string comes from CONFIG
 * — chat text never reaches this; the vibe only ever counts words and throws
 * them away.
 */
function drawNameplate(g: G, sc: Scene, now: number, t: number) {
  const c = sc.cam();
  const cx = c.cx;
  const energy = sc.energy(now);

  g.textAlign = "center";
  g.textBaseline = "alphabetic";

  // wordmark
  g.save();
  g.shadowColor = sc.vibe.rgb("glow", 0.45);
  g.shadowBlur = 18 + 14 * energy;
  g.font = "700 72px 'Barlow Condensed', Rajdhani, sans-serif";
  g.fillStyle = "#F3EEE4";
  g.fillText(CONFIG.chillName, cx, 118);
  g.restore();

  // swoosh — a brush stroke under the name, breathing with the room
  g.save();
  g.strokeStyle = sc.vibe.rgb("glow", 0.5 + 0.3 * energy);
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx - 132, 134);
  g.quadraticCurveTo(cx, 146 + 2 * Math.sin(t * 0.8), cx + 132, 130);
  g.stroke();
  g.restore();

  g.fillStyle = "rgba(243,238,228,.4)";
  tracked(g, CONFIG.chillTagline, cx, 172, 12, 0.34);

  // rotating topic, crossfaded so nothing ever pops. Derived from the clock,
  // so it needs no state and two sources stay in step.
  const topics = CONFIG.chillTopics;
  if (topics.length) {
    const span = Math.max(3, CONFIG.topicSeconds) * 1000;
    const slot = Math.floor(now / span);
    const into = (now % span) / span;
    const fade = Math.min(1, into / 0.06, (1 - into) / 0.06);
    g.font = "500 22px Rajdhani, sans-serif";
    g.fillStyle = `rgba(243,238,228,${0.62 * Math.max(0, fade)})`;
    g.fillText(topics[slot % topics.length]!, cx, 214);
  }

  // live readout of the room, off the same 60s window the moon reads
  const live = sc.liveBeats(now);
  const souls = sc.stars.size;
  g.fillStyle = "rgba(169,123,255,.5)";
  tracked(
    g,
    souls === 1
      ? `1 soul in the sky · ${live} msg/min`
      : `${souls} souls in the sky · ${live} msg/min`,
    cx,
    252,
    11,
    0.3,
  );

  g.textAlign = "left";
}

/** !heart — a short bloom on the sender's own star. */
function drawBlooms(g: G, sc: Scene) {
  sc.blooms = sc.blooms.filter((p) => p.life < p.max);
  for (const p of sc.blooms) {
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.965;
    p.vy *= 0.965;
    const fade = 1 - p.life / p.max;
    g.fillStyle = `rgba(233,224,255,${0.85 * fade})`;
    g.beginPath();
    g.arc(p.x, p.y, 2.4 * fade + 0.6, 0, TAU);
    g.fill();
  }
}

function drawMoonBig(g: G, sc: Scene, now: number, _t: number) {
  const cx = sc.moonX;
  const cy = sc.moonY;
  const r = sc.moonR;
  const p = sc.energy(now);

  if (p >= 1 && !sc.moonFull) sc.moonFull = true;

  // glow
  const glow = g.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 2.05);
  glow.addColorStop(0, sc.moonFull ? "rgba(232,163,61,.34)" : "rgba(122,47,242,.30)");
  glow.addColorStop(1, "rgba(122,47,242,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, cy, r * 2.05, 0, TAU);
  g.fill();

  // disc, then the shadow slid off to the right as energy rises
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  const lit = g.createRadialGradient(cx - r * 0.2, cy - r * 0.28, r * 0.1, cx, cy, r * 1.1);
  lit.addColorStop(0, "#FFFBF2");
  lit.addColorStop(1, sc.moonFull ? "#F0D8A8" : "#CDBBEB");
  g.fillStyle = lit;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  // shadow tinted to the sky behind it — pure black reads as an object stuck
  // on the moon rather than the unlit side of it
  g.fillStyle = "#150d29";
  g.beginPath();
  g.arc(cx + p * 2.1 * r, cy, r, 0, TAU);
  g.fill();
  g.restore();

  g.strokeStyle = "rgba(169,123,255,.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();

  // chat-energy ring
  ring(g, cx, cy, r + 30, p, sc.moonFull ? "#E8A33D" : "#A97BFF", 4);

  // countdown ring — timed away states only (brb / starting soon)
  if ((sc.state === "brb" || sc.state === "soon") && sc.until) {
    const total = sc.until - sc.since;
    const left = Math.max(0, sc.until - now);
    ring(g, cx, cy, r + 52, total ? left / total : 0, "#E8A33D", 3);
  }

  g.font = "600 15px Rajdhani, sans-serif";
  g.fillStyle = "rgba(243,238,228,.5)";
  g.textAlign = "center";
  g.fillText(
    sc.moonFull ? "THE MOON IS FULL" : `CHAT ENERGY  ${Math.round(p * 100)}%`,
    cx,
    cy + r + 92,
  );
  g.textAlign = "left";
}

export function ring(
  g: G,
  cx: number,
  cy: number,
  rad: number,
  frac: number,
  color: string,
  w: number,
) {
  g.strokeStyle = "rgba(243,238,228,.09)";
  g.lineWidth = w;
  g.beginPath();
  g.arc(cx, cy, rad, 0, TAU);
  g.stroke();
  if (frac <= 0) return;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy, rad, -1.5708, -1.5708 + TAU * Math.min(1, frac));
  g.stroke();
  g.lineCap = "butt";
}

/** Constellation lines between the most recent voices. */
function drawLines(g: G, sc: Scene) {
  const pts = sc.recent.map((l) => sc.stars.get(l)).filter((s) => !!s);
  if (pts.length < 2) return;
  g.strokeStyle = "rgba(169,123,255,.20)";
  g.lineWidth = 1;
  g.beginPath();
  pts.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y)));
  g.stroke();
}

function drawStars(g: G, sc: Scene, now: number, t: number) {
  const labelled = new Set(
    [...sc.stars.entries()]
      .sort((a, b) => b[1].bright - a[1].bright)
      .slice(0, CONFIG.starLabels)
      .map(([l]) => l),
  );

  // a livelier room makes the sky twinkle harder
  const amp = sc.chill && sc.vibe.cur ? 0.18 * sc.vibe.cur.twinkle : 0.18;

  for (const [login, s] of sc.stars) {
    const age = (now - s.last) / 1000;
    s.bright = Math.max(0.28, 1 - age / 26);
    const tw = 1 - amp + amp * Math.sin(t * 2.1 + s.x * 0.01);
    const rad = 1.7 + s.bright * 3.1;

    const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad * 5);
    halo.addColorStop(0, `rgba(233,224,255,${0.5 * s.bright * tw})`);
    halo.addColorStop(1, "rgba(122,47,242,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(s.x, s.y, rad * 5, 0, TAU);
    g.fill();

    g.fillStyle = `rgba(255,251,242,${(0.55 + 0.45 * s.bright) * tw})`;
    g.beginPath();
    g.arc(s.x, s.y, rad, 0, TAU);
    g.fill();

    if (labelled.has(login)) {
      g.font = "600 15px Rajdhani, sans-serif";
      g.fillStyle = `rgba(243,238,228,${0.3 + 0.55 * s.bright})`;
      // a star may sit as far right as x1880, so flip the label inward rather
      // than letting a long name run off the stage
      const flip = s.x > 1560;
      g.textAlign = flip ? "right" : "left";
      g.fillText(s.name, s.x + (flip ? -rad - 9 : rad + 9), s.y + 5);
      g.textAlign = "left";
    }
  }
}

function drawShots(g: G, sc: Scene) {
  sc.shots = sc.shots.filter((s) => s.life < s.max);
  for (const s of sc.shots) {
    s.life++;
    s.x += s.vx * 2.4;
    s.y += s.vy * 2.4;
    const fade =
      s.life < 40 ? s.life / 40 : Math.max(0, 1 - (s.life - 40) / (s.max - 40));
    const col = s.ember ? "232,163,61" : "169,123,255";

    const tail = g.createLinearGradient(s.x - s.vx * 46, s.y - s.vy * 46, s.x, s.y);
    tail.addColorStop(0, `rgba(${col},0)`);
    tail.addColorStop(1, `rgba(${col},${0.85 * fade})`);
    g.strokeStyle = tail;
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(s.x - s.vx * 46, s.y - s.vy * 46);
    g.lineTo(s.x, s.y);
    g.stroke();
    g.lineCap = "butt";

    g.fillStyle = `rgba(255,251,242,${fade})`;
    g.beginPath();
    g.arc(s.x, s.y, 3.1, 0, TAU);
    g.fill();

    g.font = "700 19px Rajdhani, sans-serif";
    g.fillStyle = `rgba(${col},${fade})`;
    g.fillText(s.name, s.x + 14, s.y + 6);
  }
}
