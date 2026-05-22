import { SOCIAL_LINKS as DEFAULT_LINKS } from "@/constants";
import { getKV } from "./kv";

const KEY = "social_links";

export type SocialLinks = Record<string, string>;

export async function getSocialLinks(): Promise<SocialLinks> {
  const stored = await getKV().get<SocialLinks>(KEY);
  return stored ?? { ...DEFAULT_LINKS };
}

export async function saveSocialLinks(links: SocialLinks): Promise<void> {
  // Drop empty values so the public footer skips hidden socials.
  const cleaned: SocialLinks = {};
  for (const [k, v] of Object.entries(links)) {
    const trimmed = v.trim();
    if (trimmed) cleaned[k] = trimmed;
  }
  await getKV().put<SocialLinks>(KEY, cleaned);
}
