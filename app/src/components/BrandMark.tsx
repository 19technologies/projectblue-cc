"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LogoVariant = "light" | "dark" | "favicon-light" | "favicon-dark";

interface Branding {
  line1: string;
  line2: string;
  logos: Partial<Record<LogoVariant, boolean>>;
  hasImage: boolean;
}

const DEFAULT_BRANDING: Branding = {
  line1: "PROJECT",
  line2: "BLUE",
  logos: {},
  hasImage: false,
};

function pickLogoVariant(logos: Partial<Record<LogoVariant, boolean>>, dark: boolean): "light" | "dark" | null {
  if (dark) {
    if (logos["dark"]) return "dark";
    if (logos["light"]) return "light";
  } else {
    if (logos["light"]) return "light";
    if (logos["dark"]) return "dark";
  }
  return null;
}

interface WordMarkProps {
  asLink?: boolean;
}

export const WordMark = ({ asLink = false }: WordMarkProps) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const update = () =>
      setDark(document.documentElement.getAttribute("data-theme") === "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setBranding(d as Branding); })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  const variant = pickLogoVariant(branding.logos, dark);

  const inner = variant ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/branding/logo/${variant}`}
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
      <Link href="/" className="pb-wordmark" style={{ textDecoration: "none" }} aria-label="Project Blue — home">
        {inner}
      </Link>
    );
  }
  return <div className="pb-wordmark">{inner}</div>;
};
