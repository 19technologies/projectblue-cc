import Link from "next/link";

export const MarkGlyph = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ display: "block" }}
  >
    <path
      d="M12 1 L13.4 8.8 L21 6.6 L15.6 12 L21 17.4 L13.4 15.2 L12 23 L10.6 15.2 L3 17.4 L8.4 12 L3 6.6 L10.6 8.8 Z"
      fill="currentColor"
    />
  </svg>
);

interface WordMarkProps {
  asLink?: boolean;
}

/**
 * Mont Blanc-style stacked word-mark. Small geometric glyph above two
 * tightly-stacked lines of bold tracked sans. Monolithic, considered.
 */
export const WordMark = ({ asLink = false }: WordMarkProps) => {
  const inner = (
    <>
      <MarkGlyph />
      <div className="pb-wordmark-line">PROJECT</div>
      <div className="pb-wordmark-line">BLUE</div>
    </>
  );

  if (asLink) {
    return (
      <Link
        href="/"
        className="pb-wordmark"
        style={{ textDecoration: "none" }}
        aria-label="Project Blue — home"
      >
        {inner}
      </Link>
    );
  }

  return <div className="pb-wordmark">{inner}</div>;
};
