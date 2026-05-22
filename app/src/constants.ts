/**
 * Public-facing social links. The admin dashboard overrides these at
 * runtime via Cloudflare KV; the values here are the fallback / seed.
 *
 * Commented out for now — real handles to be set later, either here or
 * from /admin/links. With the map empty, the footer renders no socials.
 */
export const SOCIAL_LINKS = {
  // instagram: "https://instagram.com/projectbluecc",
  // x: "https://x.com/projectbluecc",
  // discord: "https://discord.gg/projectblue",
} as const;
