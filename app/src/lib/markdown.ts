import { marked, type MarkedOptions } from "marked";

const opts: MarkedOptions = {
  gfm: true,
  breaks: false,
};

/**
 * Render trusted markdown (admin-authored) to HTML.
 * Returns a string suitable for `dangerouslySetInnerHTML`.
 */
export function renderMarkdown(md: string): string {
  return marked.parse(md ?? "", opts) as string;
}
