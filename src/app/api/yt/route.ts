// Reads a public YouTube video or playlist: titles, durations, order.
// Uses the public pages (no API key). Playlists longer than one page are followed via continuation.
import { parseYouTubeUrl, type YtSource, type YtVideo } from "@/lib/youtube";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const HEADERS = { "user-agent": UA, "accept-language": "en-US,en;q=0.9" };

/** Pull `varName = {...}` out of a page by matching braces (strings aware). */
function extractJson(html: string, varName: string): unknown {
  const at = html.search(new RegExp(`${varName}\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function toSeconds(t: string): number {
  return t.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** Collect videos from any playlist renderer shape YouTube currently uses. */
function collect(root: unknown, out: YtVideo[], seen: Set<string>): string | null {
  let token: string | null = null;
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    const lock = r.lockupViewModel as Record<string, unknown> | undefined;
    if (lock && lock.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && typeof lock.contentId === "string") {
      const s = JSON.stringify(lock);
      const title =
        ((lock.metadata as Record<string, unknown>)?.lockupMetadataViewModel as { title?: { content?: string } })?.title?.content ?? "Untitled";
      const dur = s.match(/"text":"(\d+:\d{2}(?::\d{2})?)"/);
      if (!seen.has(lock.contentId)) {
        seen.add(lock.contentId);
        out.push({ id: lock.contentId, title, seconds: dur ? toSeconds(dur[1]) : 0 });
      }
    }
    const pvr = r.playlistVideoRenderer as Record<string, unknown> | undefined;
    if (pvr && typeof pvr.videoId === "string" && !seen.has(pvr.videoId)) {
      seen.add(pvr.videoId);
      const title = (pvr.title as { runs?: { text: string }[] })?.runs?.[0]?.text ?? "Untitled";
      out.push({ id: pvr.videoId, title, seconds: Number(pvr.lengthSeconds ?? 0) });
    }
    const cc = r.continuationCommand as { token?: string } | undefined;
    if (cc?.token && !token) token = cc.token;
    for (const k in r) walk(r[k]);
  };
  walk(root);
  return token;
}

async function readPlaylist(listId: string): Promise<YtSource> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`, { headers: HEADERS });
  const html = await res.text();
  const data = extractJson(html, "ytInitialData") as Record<string, unknown> | null;
  if (!data) throw new Error("Playlist could not be read. Is it public?");
  const meta = (data.metadata as Record<string, unknown>)?.playlistMetadataRenderer as { title?: string } | undefined;
  const videos: YtVideo[] = [];
  const seen = new Set<string>();
  let token = collect(data, videos, seen);

  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? "2.20240101.00.00";
  for (let page = 0; token && key && page < 20 && videos.length < 2000; page++) {
    const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: version, hl: "en" } }, continuation: token }),
    });
    if (!r.ok) break;
    const before = videos.length;
    token = collect(await r.json(), videos, seen);
    if (videos.length === before) break;
  }
  if (!videos.length) throw new Error("No videos found in this playlist.");
  return { kind: "playlist", id: listId, title: meta?.title ?? "Playlist", videos };
}

async function readVideo(videoId: string): Promise<YtSource> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { headers: HEADERS });
  const html = await res.text();
  const pr = extractJson(html, "ytInitialPlayerResponse") as { videoDetails?: { title?: string; lengthSeconds?: string; author?: string }; playabilityStatus?: { status?: string; reason?: string } } | null;
  const d = pr?.videoDetails;
  if (!d) throw new Error(pr?.playabilityStatus?.reason ?? "Video could not be read. Is it public?");
  const title = d.title ?? "Video";
  return { kind: "video", id: videoId, title, author: d.author, videos: [{ id: videoId, title, seconds: Number(d.lengthSeconds ?? 0) }] };
}

/** Top YouTube results for a query (public search page, no API key). */
async function search(query: string): Promise<(YtVideo & { channel?: string })[]> {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: HEADERS });
  const data = extractJson(await res.text(), "ytInitialData");
  const out: (YtVideo & { channel?: string })[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object" || out.length >= 5) return;
    const r = o as Record<string, unknown>;
    const v = r.videoRenderer as Record<string, unknown> | undefined;
    if (v && typeof v.videoId === "string") {
      const title = (v.title as { runs?: { text: string }[] })?.runs?.[0]?.text ?? "Video";
      const len = (v.lengthText as { simpleText?: string })?.simpleText ?? "0:00";
      const channel = (v.ownerText as { runs?: { text: string }[] })?.runs?.[0]?.text;
      out.push({ id: v.videoId, title, seconds: toSeconds(len), channel });
      return;
    }
    for (const k in r) walk(r[k]);
  };
  walk(data);
  return out;
}

export async function POST(request: Request) {
  const { url, search: q } = (await request.json().catch(() => ({}))) as { url?: string; search?: string };
  if (q) {
    try {
      return Response.json({ results: await search(String(q).slice(0, 120)) });
    } catch {
      return Response.json({ results: [] });
    }
  }
  const parsed = parseYouTubeUrl(String(url ?? ""));
  if (!parsed) return Response.json({ error: "Ye YouTube link nahi lag raha. Video ya playlist ka link paste karo." }, { status: 400 });
  try {
    const source = parsed.listId ? await readPlaylist(parsed.listId) : await readVideo(parsed.videoId!);
    if (parsed.videoId && source.videos.some((v) => v.id === parsed.videoId)) source.startId = parsed.videoId;
    // Playlist durations sometimes missing; fill from the watch page for the first few.
    const missing = source.videos.filter((v) => !v.seconds).slice(0, 15);
    await Promise.all(
      missing.map(async (v) => {
        try {
          const one = await readVideo(v.id);
          v.seconds = one.videos[0].seconds;
        } catch {}
      }),
    );
    return Response.json({ source });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not read YouTube" }, { status: 502 });
  }
}
