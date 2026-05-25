"use client";

import { WordMark } from "@/components/BrandMark";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AdminNavProps {
  /** Set to any string to show a back arrow. Null/undefined hides it (dashboard). */
  page?: string | null;
  /** Extra nav links rendered after the back arrow. */
  extra?: React.ReactNode;
}

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminNav({ page, extra }: AdminNavProps) {
  const router = useRouter();

  return (
    <header className="pb-welcome-header">
      <WordMark asLink />
      <nav className="pb-welcome-nav" aria-label="Admin">
        {page != null && (
          <button
            type="button"
            onClick={() => router.back()}
            className="pb-nav-link pb-back-btn"
            aria-label="Go back"
            title="Back"
          >
            <BackArrow />
            <span className="pb-back-label">Back</span>
          </button>
        )}
        <Link href="/admin" className="pb-nav-link">Dashboard</Link>
        {extra}
        <span className="pb-admin-pill">ADMIN</span>
      </nav>
    </header>
  );
}
