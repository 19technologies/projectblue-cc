import { getKV } from "./kv";

const TEXT_KEY = "branding";

/** Max logo upload — a word-mark image should be tiny. */
export const MAX_LOGO_BYTES = 512 * 1024;
export const ALLOWED_LOGO_TYPES = ["image/png", "image/svg+xml", "image/webp", "image/jpeg"];

export type LogoVariant = "light" | "dark" | "favicon-light" | "favicon-dark";
export const LOGO_VARIANTS: LogoVariant[] = ["light", "dark", "favicon-light", "favicon-dark"];

function logoKey(variant: LogoVariant) {
  return `branding:logo:${variant}`;
}

export interface Branding {
  line1: string;
  line2: string;
  /** Which logo variants have been uploaded. */
  logos: Partial<Record<LogoVariant, boolean>>;
  /** Legacy — true if any logo is set. Kept for old BrandMark code. */
  hasImage: boolean;
}

export interface LogoImage {
  contentType: string;
  base64: string;
}

const DEFAULT: Branding = { line1: "PROJECT", line2: "BLUE", logos: {}, hasImage: false };

export async function getBranding(): Promise<Branding> {
  const stored = await getKV().get<Branding>(TEXT_KEY);
  if (!stored) return DEFAULT;
  // migrate old records that only have hasImage
  if (!stored.logos) stored.logos = stored.hasImage ? { light: true } : {};
  return stored;
}

export async function saveBrandingText(line1: string, line2: string): Promise<Branding> {
  const current = await getBranding();
  const next: Branding = {
    line1: line1.trim().slice(0, 24) || DEFAULT.line1,
    line2: line2.trim().slice(0, 24) || DEFAULT.line2,
    logos: current.logos,
    hasImage: Object.values(current.logos).some(Boolean),
  };
  await getKV().put<Branding>(TEXT_KEY, next);
  return next;
}

export async function getLogo(variant: LogoVariant): Promise<LogoImage | null> {
  return getKV().get<LogoImage>(logoKey(variant));
}

export async function saveLogo(variant: LogoVariant, img: LogoImage): Promise<void> {
  await getKV().put<LogoImage>(logoKey(variant), img);
  const b = await getBranding();
  const logos = { ...b.logos, [variant]: true };
  await getKV().put<Branding>(TEXT_KEY, { ...b, logos, hasImage: true });
}

export async function deleteLogo(variant: LogoVariant): Promise<void> {
  await getKV().delete(logoKey(variant));
  const b = await getBranding();
  const logos = { ...b.logos, [variant]: false };
  const hasImage = Object.values(logos).some(Boolean);
  await getKV().put<Branding>(TEXT_KEY, { ...b, logos, hasImage });
}
