"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const MarkGlyph = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ display: "block" }}
  >
    <path
      d="M12 1 L13.4 8.8 L21 6.6 L15.6 12 L21 17.4 L13.4 15.2 L12 23 L10.6 15.2 L3 17.4 L8.4 12 L3 6.6 L10.6 8.8 Z"
      fill="currentColor"
    />
  </svg>
);

interface Branding {
  line1: string;
  line2: string;
  hasImage: boolean;
}

// Default text — also the first-paint value, so the common (unedited) case
// shows no flash. Admin edits arrive after /api/branding resolves.
const DEFAULT_BRANDING: Branding = {
  line1: "PROJECT",
  line2: "BLUE",
  hasImage: false,
};

interface WordMarkProps {
  asLink?: boolean;
}

/**
 * Mont Blanc-style stacked word-mark in Archivo 800. Branding is
 * admin-editable — text by default, with an optional uploaded image
 * override. Both come from /api/branding.
 */
export const WordMark = ({ asLink = false }: WordMarkProps) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setBranding(d as Branding);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inner = branding.hasImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/api/branding/logo"
      alt="Project Blue"
      className="pb-wordmark-img"
    />
  ) : (
    <>
      <MarkGlyph />
      <div className="pb-wordmark-line">{branding.line1}</div>
      <div className="pb-wordmark-line">{branding.line2}</div>
    </>
  );

  if (asLink) {
    return (
      <Link
        href="/"
        className="pb-wordmark"
        style={{ textDecoration: "none" }}
        aria-label="Project Blue — home"
      >
        {inner}
      </Link>
    );
  }

  return <div className="pb-wordmark">{inner}</div>;
};
