import { NextResponse } from "next/server";

/**
 * Expand a YouTube playlist ID into a list of video IDs via the YouTube
 * Data API v3. Requires a `YOUTUBE_API_KEY` secret; if missing, returns
 * 503 with a clear message instead of crashing.
 *
 *   bunx wrangler secret put YOUTUBE_API_KEY
 *
 * Free tier is 10,000 quota units / day; playlistItems.list costs 1 unit
 * per call. We pull up to 200 items (4 pages), which is plenty for a
 * sane room queue.
 */

const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const MAX_ITEMS = 200;
const MAX_PAGES = 4;
const PER_PAGE = 50;

interface PlaylistItemsResponse {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!PLAYLIST_ID.test(id)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "YouTube playlist import isn't configured on this deployment. Set YOUTUBE_API_KEY.",
      },
      { status: 503 }
    );
  }

  const videoIds: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", id);
    url.searchParams.set("maxResults", String(PER_PAGE));
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const status = res.status === 404 || res.status === 403 ? 404 : 502;
      return NextResponse.json(
        { error: "Playlist not found or not accessible." },
        { status }
      );
    }
    const body = (await res.json()) as PlaylistItemsResponse;
    for (const item of body.items ?? []) {
      const vid = item.contentDetails?.videoId;
      if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) videoIds.push(vid);
      if (videoIds.length >= MAX_ITEMS) break;
    }
    if (videoIds.length >= MAX_ITEMS) break;
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  if (videoIds.length === 0) {
    return NextResponse.json({ error: "Playlist is empty." }, { status: 404 });
  }

  return NextResponse.json(
    { videoIds, truncated: videoIds.length >= MAX_ITEMS },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
