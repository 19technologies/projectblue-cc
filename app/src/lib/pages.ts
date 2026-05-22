import { getKV } from "./kv";

export type PageKind = "blog" | "doc";

export interface CMSPage {
  id: string;
  slug: string;
  kind: PageKind;
  title: string;
  body: string; // markdown
  excerpt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageSummary {
  id: string;
  slug: string;
  kind: PageKind;
  title: string;
  excerpt?: string;
  updatedAt: string;
}

const KEY = (id: string) => `page:${id}`;
const INDEX = "page:_index";

const toSummary = (p: CMSPage): PageSummary => ({
  id: p.id,
  slug: p.slug,
  kind: p.kind,
  title: p.title,
  excerpt: p.excerpt,
  updatedAt: p.updatedAt,
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function readIndex(): Promise<string[]> {
  return (await getKV().get<string[]>(INDEX)) ?? [];
}
async function writeIndex(ids: string[]): Promise<void> {
  await getKV().put<string[]>(INDEX, ids);
}

export async function getPageById(id: string): Promise<CMSPage | null> {
  return getKV().get<CMSPage>(KEY(id));
}

export async function listPages(kind?: PageKind): Promise<PageSummary[]> {
  const ids = await readIndex();
  const all: CMSPage[] = [];
  for (const id of ids) {
    const p = await getPageById(id);
    if (p && (!kind || p.kind === kind)) all.push(p);
  }
  return all
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export async function getPageBySlug(
  kind: PageKind,
  slug: string
): Promise<CMSPage | null> {
  const ids = await readIndex();
  for (const id of ids) {
    const p = await getPageById(id);
    if (p && p.kind === kind && p.slug === slug) return p;
  }
  return null;
}

export async function createPage(input: {
  kind: PageKind;
  title: string;
  body: string;
  slug?: string;
  excerpt?: string;
}): Promise<CMSPage> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const explicit = input.slug?.trim();
  const slug = slugify(explicit && explicit.length > 0 ? explicit : title);
  if (!slug) throw new Error("Couldn't derive a slug");

  const existing = await getPageBySlug(input.kind, slug);
  if (existing) throw new Error(`A ${input.kind} with slug "${slug}" already exists`);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const page: CMSPage = {
    id,
    slug,
    kind: input.kind,
    title,
    body: input.body,
    excerpt: input.excerpt?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await getKV().put<CMSPage>(KEY(id), page);
  await writeIndex([...(await readIndex()), id]);
  return page;
}

export async function updatePage(
  id: string,
  input: { title?: string; body?: string; slug?: string; excerpt?: string }
): Promise<CMSPage> {
  const current = await getPageById(id);
  if (!current) throw new Error("Not found");

  const title = input.title?.trim() ?? current.title;
  let slug = current.slug;
  if (input.slug !== undefined) {
    const next = slugify(input.slug);
    if (!next) throw new Error("Invalid slug");
    if (next !== current.slug) {
      const conflict = await getPageBySlug(current.kind, next);
      if (conflict && conflict.id !== id) {
        throw new Error(`A ${current.kind} with slug "${next}" already exists`);
      }
      slug = next;
    }
  }

  const next: CMSPage = {
    ...current,
    title,
    slug,
    body: input.body ?? current.body,
    excerpt:
      input.excerpt === undefined
        ? current.excerpt
        : input.excerpt.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  await getKV().put<CMSPage>(KEY(id), next);
  return next;
}

export async function deletePage(id: string): Promise<void> {
  await getKV().delete(KEY(id));
  await writeIndex((await readIndex()).filter((x) => x !== id));
}
