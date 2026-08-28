/**
 * Numeric diff of the compare pairs, so a drifted lane shows up as a number
 * instead of relying on someone spotting it. Decodes the PNGs in a headless
 * browser rather than pulling in an image library.
 *
 *   node scripts/compare.mjs && node scripts/diff-shots.mjs
 *
 * This is informational only: it always exits 0 on a real diff (main().catch
 * is the only nonzero exit, i.e. the script itself broke). A visual change is
 * often the point of a PR — a human reads report.md and the screenshots and
 * decides whether the diff is intentional, this just makes it visible.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DIR = join(ROOT, ".verify", "compare");

// a pixel has to differ by more than this on a channel to count as changed
const TOLERANCE = 12;

async function dataUrl(file) {
  const buf = await readFile(join(DIR, file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function main() {
  const files = await readdir(DIR);
  const names = [...new Set(files.map((f) => f.replace(/-(pr|main)\.png$/, "")))].filter((n) =>
    files.includes(`${n}-pr.png`) && files.includes(`${n}-main.png`),
  );

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  let worst = 0;

  for (const name of names) {
    const pct = await page.evaluate(
      async ([a, b, tol]) => {
        const load = (src) =>
          new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.min(ia.width, ib.width);
        const h = Math.min(ia.height, ib.height);
        const draw = (img) => {
          const c = new OffscreenCanvas(w, h);
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, w, h).data;
        };
        const da = draw(ia);
        const db = draw(ib);
        let diff = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (
            Math.abs(da[i] - db[i]) > tol ||
            Math.abs(da[i + 1] - db[i + 1]) > tol ||
            Math.abs(da[i + 2] - db[i + 2]) > tol ||
            Math.abs(da[i + 3] - db[i + 3]) > tol
          ) {
            diff++;
          }
        }
        return (diff / (w * h)) * 100;
      },
      // handed over as data URLs — a blank about:blank page cannot fetch file://
      [await dataUrl(`${name}-pr.png`), await dataUrl(`${name}-main.png`), TOLERANCE],
    );

    worst = Math.max(worst, pct);
    rows.push({ name, pct });
    console.log(`  ${name.padEnd(6)} ${pct.toFixed(2)}% of pixels differ`);
  }

  await browser.close();

  const note =
    `worst ${worst.toFixed(2)}%. The starfield is randomly placed and the clock ticks,` +
    ` so a few percent is expected; a jump means a lane actually moved.`;
  console.log(`\n${note}`);

  const report =
    `# Visual compare — PR vs. production\n\n` +
    `Informational only — this never blocks a merge on its own.\n\n` +
    `| Mode | Diff | Screenshots |\n|---|---|---|\n` +
    rows
      .map((r) => `| ${r.name} | ${r.pct.toFixed(2)}% | \`${r.name}-pr.png\` / \`${r.name}-main.png\` |`)
      .join("\n") +
    `\n\n${note}\n`;
  await writeFile(join(DIR, "report.md"), report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
