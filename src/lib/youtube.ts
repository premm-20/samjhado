// Shared YouTube helpers (client + server).

export interface YtVideo {
  id: string;
  title: string;
  seconds: number;
}

export interface YtSource {
  kind: "video" | "playlist";
  id: string;
  title: string;
  author?: string;
  videos: YtVideo[];
  /** The video the pasted link pointed at (watch?v=…&list=…), to open on it. */
  startId?: string;
}

export interface Phase {
  index: number;
  start: number;
  end: number;
}

/** Long videos are taught in phases of about this many minutes. */
export const PHASE_MINUTES = 15;

export function parseYouTubeUrl(raw: string): { videoId?: string; listId?: string } | null {
  const s = raw.trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s };
  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (!/^(youtube\.com|youtu\.be|music\.youtube\.com|youtube-nocookie\.com)$/.test(host)) return null;
  const listId = u.searchParams.get("list") ?? undefined;
  let videoId = u.searchParams.get("v") ?? undefined;
  if (host === "youtu.be") videoId = u.pathname.slice(1).split("/")[0] || undefined;
  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  if (m) videoId = m[1];
  if (!videoId && !listId) return null;
  return { videoId, listId };
}

/** Split a video into teaching phases; short videos are one phase. */
export function phasesFor(seconds: number): Phase[] {
  const len = Math.max(1, Math.round(seconds));
  const size = PHASE_MINUTES * 60;
  if (len <= size * 1.4) return [{ index: 0, start: 0, end: len }];
  const n = Math.ceil(len / size);
  const step = Math.ceil(len / n);
  return Array.from({ length: n }, (_, i) => ({ index: i, start: i * step, end: Math.min(len, (i + 1) * step) }));
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
