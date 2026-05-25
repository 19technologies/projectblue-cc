import { getBranding } from "@/lib/branding";

/**
 * Server component — renders <link rel="icon"> tags into <head> for the
 * favicon-light and favicon-dark KV slots. Next.js App Router automatically
 * hoists these into <head> when returned from a server component.
 *
 * Falls back to /favicon.ico if neither slot is uploaded.
 */
export async function FaviconLinks() {
  const branding = await getBranding();
  const hasLight = branding.logos["favicon-light"];
  const hasDark = branding.logos["favicon-dark"];

  if (!hasLight && !hasDark) {
    // No dynamic favicons — browser uses the static /favicon.ico fallback.
    return null;
  }

  return (
    <>
      {hasLight && (
        <link
          rel="icon"
          href="/api/branding/logo/favicon-light"
          media="(prefers-color-scheme: light)"
        />
      )}
      {hasDark && (
        <link
          rel="icon"
          href="/api/branding/logo/favicon-dark"
          media="(prefers-color-scheme: dark)"
        />
      )}
      {/* Fallback for browsers that don't support media on <link rel="icon"> */}
      {hasDark && (
        <link rel="icon" href="/api/branding/logo/favicon-dark" />
      )}
    </>
  );
}
