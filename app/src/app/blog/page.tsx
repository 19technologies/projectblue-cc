import { PublicShell } from "@/components/PublicShell";
import { listPages } from "@/lib/pages";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog" };

export default async function BlogIndexPage() {
  const posts = await listPages("blog");
  return (
    <PublicShell
      kicker="Project Blue"
      title={<>The <span className="pb-emph">blog</span>.</>}
    >
      {posts.length === 0 ? (
        <p>Nothing yet. Come back soon.</p>
      ) : (
        <ul className="pb-page-index">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${p.slug}`}>
                <span className="pb-page-index-title">{p.title}</span>
                <span className="pb-page-index-date">
                  {new Date(p.updatedAt).toISOString().slice(0, 10)}
                </span>
              </Link>
              {p.excerpt && <p className="pb-page-index-excerpt">{p.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
