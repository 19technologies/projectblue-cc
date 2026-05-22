import { getKV } from "./kv";
import { LEGAL_SEED, type LegalDoc, type LegalSlug } from "./legalSeed";

const KEY = (slug: LegalSlug) => `legal:${slug}`;

export type { LegalDoc, LegalSlug };
export { LEGAL_SLUGS } from "./legalSeed";

export async function getLegal(slug: LegalSlug): Promise<LegalDoc> {
  const stored = await getKV().get<LegalDoc>(KEY(slug));
  return stored ?? LEGAL_SEED[slug];
}

export async function saveLegal(
  slug: LegalSlug,
  input: { title: string; body: string }
): Promise<LegalDoc> {
  const doc: LegalDoc = {
    slug,
    title: input.title.trim(),
    body: input.body,
    updatedAt: new Date().toISOString(),
  };
  await getKV().put<LegalDoc>(KEY(slug), doc);
  return doc;
}
