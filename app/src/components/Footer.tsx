"use client";

import { SOCIAL_LINKS } from "@/constants";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/* Tiny inline social glyphs — no icon-pack dependency */
const InstagramGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
  </svg>
);

const XGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M17.53 3H20.5l-6.49 7.42L21.75 21h-6.21l-4.86-6.36L5.07 21H2.1l6.94-7.94L1.6 3h6.36l4.4 5.82L17.53 3Zm-1.09 16.2h1.71L7.66 4.7H5.83l10.61 14.5Z"
    />
  </svg>
);

const DiscordGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M20.32 4.37A19.79 19.79 0 0 0 16.56 3l-.18.36a14.5 14.5 0 0 0-4.38 0L11.82 3a19.79 19.79 0 0 0-3.76 1.37C3.7 10.05 2.62 15.6 3.15 21.06A19.93 19.93 0 0 0 8.65 23l.42-.6a13.5 13.5 0 0 1-2.13-1.05c.18-.13.36-.27.53-.41a14.2 14.2 0 0 0 12.66 0c.17.14.35.28.53.41a13.5 13.5 0 0 1-2.13 1.05l.42.6a19.93 19.93 0 0 0 5.5-1.94c.61-6.36-1.04-11.85-3.13-16.69ZM9.5 16.32a2.06 2.06 0 0 1-1.93-2.16 2.06 2.06 0 0 1 1.93-2.16 2.06 2.06 0 0 1 1.93 2.16 2.06 2.06 0 0 1-1.93 2.16Zm5 0a2.06 2.06 0 0 1-1.93-2.16 2.06 2.06 0 0 1 1.93-2.16 2.06 2.06 0 0 1 1.93 2.16 2.06 2.06 0 0 1-1.93 2.16Z"
    />
  </svg>
);

interface SocialIconMeta {
  key: string;
  label: string;
  glyph: React.ReactNode;
}

const KNOWN_SOCIALS: SocialIconMeta[] = [
  { key: "instagram", label: "Instagram", glyph: <InstagramGlyph /> },
  { key: "x", label: "X", glyph: <XGlyph /> },
  { key: "discord", label: "Discord", glyph: <DiscordGlyph /> },
];

type LinkMap = Record<string, string>;

export const Footer = () => {
  // Hydrate with the build-time defaults so the first paint isn't empty;
  // /api/links overrides with admin-edited values when it arrives.
  const [links, setLinks] = useState<LinkMap>(() => ({ ...SOCIAL_LINKS }));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/links")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === "object") {
          setLinks(data as LinkMap);
        }
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSocials = KNOWN_SOCIALS.filter((s) => Boolean(links[s.key]));

  return (
    <footer className="pb-welcome-footer">
      <Link href="/terms" className="pb-footer-link">
        Terms
      </Link>
      <Link href="/privacy" className="pb-footer-link">
        Privacy
      </Link>

      {visibleSocials.length > 0 && (
        <span className="pb-footer-divider" aria-hidden />
      )}

      {visibleSocials.map((s) => (
        <a
          key={s.key}
          href={links[s.key]}
          target="_blank"
          rel="noopener noreferrer"
          className="pb-social"
          aria-label={`Project Blue on ${s.label}`}
        >
          {s.glyph}
          <span className="pb-social-label">{s.label}</span>
        </a>
      ))}

      <span className="pb-footer-spacer" aria-hidden />
      <ThemeToggle />
    </footer>
  );
};
