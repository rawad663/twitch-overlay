import type { NextConfig } from "next";

/* GitHub Pages serves this repo at /twitch-overlay/, so every asset URL needs
   the prefix. The old hand-written HTML used relative paths and didn't care;
   Next's /_next/ chunks are absolute, so basePath is mandatory here.
   Set PAGES_BASE_PATH="" locally if you ever serve the export from a root. */
const basePath = process.env.PAGES_BASE_PATH ?? "/twitch-overlay";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
