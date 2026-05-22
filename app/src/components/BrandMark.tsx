"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
