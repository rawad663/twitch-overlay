import { CONFIG } from "@/config/config";
import { STAGE_H, STAGE_W } from "@/design/stage";
import { twemojiName, type BalloonGlyph } from "../chat/emotes";

export type Balloon = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  swaySp: number;
  swayAmp: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  spin: number;
  glyph: BalloonGlyph;
};

type ImageSlot = HTMLImageElement | "loading" | "fail";

/**
 * Glyph balloons. Own canvas + rAF, separate from the starfield — HUD has no
 * scene canvas, and the sky canvas must stay the first `<canvas>` so verify
 * and the chill camera-hole check keep sampling the starfield, not this layer.
 */
export class BalloonField {
  balloons: Balloon[] = [];

  private ctx: CanvasRenderingContext2D | null = null;
  private raf: number | null = null;
  private paused = false;
  private images = new Map<string, ImageSlot>();

  spawn(glyphs: readonly BalloonGlyph[]) {
    if (!glyphs.length) return;
    for (const glyph of glyphs.slice(0, CONFIG.balloonPerMessage)) {
      this.balloons.push(this.make(glyph));
      this.prefetch(glyph);
      if (this.balloons.length > CONFIG.balloonMax) this.balloons.shift();
    }
    this.start();
  }

  /**
   * Bind a canvas. StrictMode remounts the layer (mount → unmount → mount);
   * particles stay on this object so the second mount resumes them.
   */
  mount(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.start();
  }

  unmount() {
    this.stop();
    this.ctx = null;
  }

  /** OBS hide/show — a hidden source would otherwise keep the loop alive. */
  setVisible(v: boolean) {
    this.paused = !v;
    if (v) this.start();
    else this.stop();
  }

  destroy() {
    this.unmount();
    this.balloons = [];
    this.images.clear();
  }

  private make(glyph: BalloonGlyph): Balloon {
    const lifeSpan = CONFIG.balloonMaxLife - CONFIG.balloonMinLife;
    return {
      x: 90 + Math.random() * (STAGE_W - 180),
      y: STAGE_H - 70 - Math.random() * 90,
      vx: (Math.random() - 0.5) * 0.7,
      vy: -(2.15 + Math.random() * 1.35),
      sway: Math.random() * Math.PI * 2,
      swaySp: 0.035 + Math.random() * 0.05,
      swayAmp: 0.3 + Math.random() * 0.55,
      life: 0,
      max: CONFIG.balloonMinLife + Math.floor(Math.random() * (lifeSpan + 1)),
      size: 46 + Math.random() * 28,
      rot: (Math.random() - 0.5) * 0.5,
      spin: (Math.random() - 0.5) * 0.02,
      glyph,
    };
  }

  private urlFor(glyph: BalloonGlyph): string {
    if (glyph.kind === "emote") {
      return `https://static-cdn.jtvnw.net/emoticons/v2/${glyph.id}/default/dark/2.0`;
    }
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${twemojiName(glyph.text)}.png`;
  }

  private prefetch(glyph: BalloonGlyph) {
    const url = this.urlFor(glyph);
    if (this.images.has(url) || typeof Image === "undefined") return;
    this.images.set(url, "loading");
    const img = new Image();
    // no crossOrigin — we never call getImageData; CORS would taint the canvas
    img.onload = () => {
      if (this.images.get(url) === "loading") this.images.set(url, img);
    };
    img.onerror = () => {
      if (this.images.get(url) === "loading") this.images.set(url, "fail");
    };
    img.src = url;
  }

  private start() {
    if (this.raf !== null || this.paused || !this.ctx || !this.balloons.length) return;
    if (typeof requestAnimationFrame !== "function") return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private stop() {
    if (this.raf !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.raf);
    }
    this.raf = null;
  }

  private frame() {
    this.raf = null;
    if (this.paused || !this.ctx) return;
    this.draw();
    if (this.balloons.length && !this.paused && this.ctx) {
      this.raf = requestAnimationFrame(() => this.frame());
    }
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    this.balloons = this.balloons.filter((b) => b.life < b.max);
    for (const b of this.balloons) {
      b.x += b.vx + Math.sin(b.life * b.swaySp + b.sway) * b.swayAmp;
      b.y += b.vy;
      b.rot += b.spin;
      this.paint(ctx, b);
      b.life++;
    }
  }

  private paint(ctx: CanvasRenderingContext2D, b: Balloon) {
    const t = b.max > 0 ? b.life / b.max : 1;
    let alpha: number;
    if (t < 0.1) alpha = t / 0.1;
    else if (t < 0.5) alpha = 1;
    else alpha = Math.max(0, 1 - (t - 0.5) / 0.5);

    const scale = t < 0.08 ? t / 0.08 : 1 - 0.1 * ((t - 0.08) / 0.92);
    const url = this.urlFor(b.glyph);
    const slot = this.images.get(url);
    const img = slot && typeof slot !== "string" ? slot : null;
    const ready = img && img.complete && img.naturalWidth > 0;
    const emoji = b.glyph.kind === "emoji" ? b.glyph.text : null;
    if (!ready && !emoji) return;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(169,123,255,0.4)";
    ctx.shadowBlur = 18;
    if (ready && img) {
      ctx.drawImage(img, -b.size / 2, -b.size / 2, b.size, b.size);
    } else if (emoji) {
      ctx.fillStyle = "#F3EEE4";
      ctx.font = `${b.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 0, 0);
    }
    ctx.restore();
  }
}
