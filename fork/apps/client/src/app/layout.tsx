import { PostHogProvider } from "@/components/PostHogProvider";
import TQProvider from "@/components/TQProvider";
import { Toaster } from "@/components/ui/sonner";
import { IS_DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Archivo, EB_Garamond, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Project Blue font stack. Inter is the body sans (matches the rest of
// projectblue.cc); EB Garamond is reserved for italic display text;
// Archivo (heavy weight) is the brand word-mark.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

// Wide bold grotesk for the Project Blue word-mark — a free, reliable
// stand-in for Neue Haas Grotesk Display.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Project Blue",
  description:
    "Turn every device into a synchronized speaker. Project Blue is an open-source music player for multi-device audio playback. Host a listening party today!",
  keywords: ["music", "sync", "audio", "collaboration", "real-time"],
  authors: [{ name: "Freeman Jiang" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Project Blue",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          inter.variable,
          garamond.variable,
          archivo.variable,
          geistMono.variable,
          "antialiased font-sans selection:bg-primary-800 selection:text-white"
        )}
      >
        {/* Project Blue gov.uk-style top band — the visual hallmark
            shared with the rest of projectblue.cc. */}
        <div className="pb-topbar" aria-hidden />
        <PostHogProvider>
          <TQProvider>
            {children}
            <Toaster />
            {!IS_DEMO_MODE && <Analytics />}
          </TQProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
