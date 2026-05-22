import { getKV } from "./kv";

const TEXT_KEY = "branding";
const LOGO_KEY = "branding:logo";

/** Max logo upload — a word-mark image should be tiny. */
export const MAX_LOGO_BYTES = 512 * 1024;
export const ALLOWED_LOGO_TYPES = ["image/png", "image/svg+xml", "image/webp", "image/jpeg"];

export interface Branding {
  line1: string;
  line2: string;
  /** When true, the public site renders the uploaded image instead of text. */
  hasImage: boolean;
}

export interface LogoImage {
  contentType: string;
  base64: string;
}

const DEFAULT: Branding = { line1: "PROJECT", line2: "BLUE", hasImage: false };

export async function getBranding(): Promise<Branding> {
  const stored = await getKV().get<Branding>(TEXT_KEY);
  return stored ?? DEFAULT;
}

export async function saveBrandingText(
  line1: string,
  line2: string
): Promise<Branding> {
  const current = await getBranding();
  const next: Branding = {
    line1: line1.trim().slice(0, 24) || DEFAULT.line1,
    line2: line2.trim().slice(0, 24) || DEFAULT.line2,
    hasImage: current.hasImage,
  };
  await getKV().put<Branding>(TEXT_KEY, next);
  return next;
}

export async function getLogo(): Promise<LogoImage | null> {
  return getKV().get<LogoImage>(LOGO_KEY);
}

export async function saveLogo(img: LogoImage): Promise<void> {
  await getKV().put<LogoImage>(LOGO_KEY, img);
  const b = await getBranding();
  await getKV().put<Branding>(TEXT_KEY, { ...b, hasImage: true });
}

export async function deleteLogo(): Promise<void> {
  await getKV().delete(LOGO_KEY);
  const b = await getBranding();
  await getKV().put<Branding>(TEXT_KEY, { ...b, hasImage: false });
}
