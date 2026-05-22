import { PublicShell } from "@/components/PublicShell";
import { listPages } from "@/lib/pages";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Docs" };

export default async function DocsIndexPage() {
  const docs = await listPages("doc");
  return (
    <PublicShell
      kicker="Project Blue"
      title={<><span className="pb-emph">Documentation</span>.</>}
    >
      {docs.length === 0 ? (
        <p>Docs coming soon.</p>
      ) : (
        <ul className="pb-page-index">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/docs/${d.slug}`}>
                <span className="pb-page-index-title">{d.title}</span>
              </Link>
              {d.excerpt && <p className="pb-page-index-excerpt">{d.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
