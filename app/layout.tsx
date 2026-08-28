import type { Metadata, Viewport } from "next";
import { Rajdhani, Barlow_Condensed } from "next/font/google";
import "@/design/tokens.css";

/* Self-hosted by next/font, so the overlay has no external request to make
   before it can paint — an OBS source with a cold cache used to flash in the
   fallback face while Google Fonts loaded. */
const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["300", "500", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAWAD663 overlay",
  description: "Twitch overlay and OBS control dock for rawad663.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${barlow.variable}`}>
      <body>{children}</body>
    </html>
  );
}
