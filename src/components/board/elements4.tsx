"use client";
// Board renderers: folder trees (GitHub repos) and video references (any lesson).
import { ChevronRight, ExternalLink, FileCode2, Folder, MonitorPlay, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/youtube";
import { folderChildren, getLiveUrl } from "@/lib/repoStore";
import { useBoard } from "./context";
import type { ElProps } from "./elements";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface TreeRow {
  depth: number;
  name: string;
  dir: boolean;
  note?: string;
  count?: number;
}

/** Notes the model wrote, keyed by bare name ("views", "streamlit_app.py"). */
function notesFrom(items: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const raw of items) {
    const [name, ...rest] = raw.trim().split(/\s+[—–-]\s+/);
    const note = rest.join(" — ").trim();
    const key = name.replace(/\/+$/, "").split("/").pop()!.toLowerCase();
    if (key && note) m.set(key, note);
  }
  return m;
}

/**
 * Rows to draw. For repo lessons the listing comes from the REAL file tree (every child shown,
 * nothing skipped); the model only contributes the note next to each name.
 */
function treeRows(step: ElProps["step"]): { rows: TreeRow[]; total?: number } {
  const items = step.items ?? [];
  const real = step.folder !== undefined ? folderChildren(step.folder) : null;
  if (real) {
    const notes = notesFrom(items);
    const base = (step.folder ?? "").replace(/^\/+|\/+$/g, "");
    const rows: TreeRow[] = [];
    if (base) rows.push({ depth: 0, name: base.split("/").pop() + "/", dir: true });
    const MAX = 60;
    for (const c of real.slice(0, MAX))
      rows.push({ depth: base ? 1 : 0, name: c.name + (c.dir ? "/" : ""), dir: c.dir, note: notes.get(c.name.toLowerCase()), count: c.dir ? c.files : undefined });
    if (real.length > MAX) rows.push({ depth: base ? 1 : 0, name: `… aur ${real.length - MAX} items`, dir: false });
    return { rows, total: real.length };
  }
  return {
    rows: items.map((raw) => {
      const depth = Math.floor((raw.match(/^ */)?.[0].length ?? 0) / 2);
      const [name, ...rest] = raw.trim().split(/\s+[—–-]\s+/);
      return { depth, name, dir: name.endsWith("/"), note: rest.join(" — ") || undefined };
    }),
  };
}

/* Tree: folder/file structure, drawn line by line like the teacher sketching a map. */
export function Tree({ step, p, active }: ElProps) {
  const { rows: lines, total } = treeRows(step);
  const shown = Math.ceil(clamp01(p / 0.95) * lines.length);
  const ref = useRef<HTMLDivElement>(null);
  const { moveTo } = useBoard();
  useLayoutEffect(() => {
    if (!active || p >= 1 || !ref.current) return;
    const row = ref.current.children[Math.max(0, shown - 1)] as HTMLElement | undefined;
    if (!row) return;
    const r = row.getBoundingClientRect();
    moveTo(r.left + Math.min(r.width, 260), r.bottom - 6);
  }, [active, shown, p, moveTo]);
  return (
    <div data-ink className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      {total !== undefined ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">
          {step.folder ? `${step.folder.replace(/^\/+|\/+$/g, "")}/` : "Repo root"} · {total} items (poori list)
        </p>
      ) : null}
      <div ref={ref} className="space-y-0.5">
        {lines.map(({ depth, name, dir: isDir, note, count }, i) => {
          return (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ paddingLeft: depth * 22, opacity: i < shown ? 1 : 0, transition: "opacity 220ms ease-out" }}
            >
              {depth > 0 ? <span className="h-px w-3 bg-white/15" /> : null}
              {isDir ? <Folder className="size-4 shrink-0 fill-chalk-yellow/20 text-chalk-yellow" /> : <FileCode2 className="size-4 shrink-0 text-chalk-cyan" />}
              <span className={`font-mono text-[13.5px] ${isDir ? "font-semibold text-chalk-yellow" : "text-white/90"}`}>{name}</span>
              {count ? <span className="text-[11px] tabular-nums text-white/30">{count} files</span> : null}
              {note ? <span className="truncate font-hand text-[1.25rem] text-chalk-dim">— {note}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Video reference: finds a real YouTube video for the query and lets the learner watch it inline. */
type Result = { id: string; title: string; seconds: number; channel?: string };
const searchCache = new Map<string, Promise<Result[]>>();
function searchVideos(q: string): Promise<Result[]> {
  let p = searchCache.get(q);
  if (!p) {
    p = fetch("/api/yt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: q }) })
      .then((r) => r.json())
      .then((j) => (j.results ?? []) as Result[])
      .catch(() => []);
    searchCache.set(q, p);
  }
  return p;
}

export function VideoRef({ step, p }: ElProps) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [pick, setPick] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let alive = true;
    if (step.query) searchVideos(step.query).then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [step.query]);
  const v = results?.[pick];
  const watch = () => {
    setPlaying(true);
    // Pause the lesson while the learner watches.
    window.dispatchEvent(new CustomEvent("samjhado:watch"));
  };
  return (
    <div
      data-ink
      className="overflow-hidden rounded-2xl border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.05]"
      style={{ opacity: p > 0 ? 1 : 0, transform: `translateY(${p > 0 ? 0 : 6}px)`, transition: "opacity 300ms ease-out, transform 300ms cubic-bezier(0.23,1,0.32,1)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <MonitorPlay className="size-4 text-[#ff5c5c]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[#ff9a9a]">Ye video bhi dekho</span>
        {step.text ? <span className="truncate text-xs text-white/50">· {step.text}</span> : null}
      </div>
      {playing && v ? (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1`}
            title={v.title}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="flex items-center gap-4 p-3">
          {v ? (
            <button onClick={watch} className="press group relative shrink-0 overflow-hidden rounded-xl" title="Yahin dekho">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail */}
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="h-[90px] w-[160px] object-cover" />
              <span className="absolute inset-0 grid place-items-center bg-black/30 transition-colors duration-150 group-hover:bg-black/15">
                <span className="grid size-10 place-items-center rounded-full bg-[#ff3d3d] text-white shadow-lg">
                  <Play className="size-5 translate-x-px fill-current" />
                </span>
              </span>
              <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] tabular-nums text-white">{fmtTime(v.seconds)}</span>
            </button>
          ) : (
            <div className="h-[90px] w-[160px] shrink-0 animate-pulse rounded-xl bg-white/[0.06]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-white/90">{v ? v.title : results ? "Koi video nahi mila" : "Video dhundh raha hoon…"}</p>
            {v?.channel ? <p className="mt-0.5 text-xs text-white/45">{v.channel}</p> : null}
            {v ? (
              <div className="mt-2 flex items-center gap-2">
                <button onClick={watch} className="press flex items-center gap-1 rounded-full bg-[#ff3d3d] px-3 py-1 text-xs font-semibold text-white">
                  <Play className="size-3 fill-current" /> Yahin dekho
                </button>
                {results && results.length > 1 ? (
                  <button onClick={() => setPick((k) => (k + 1) % results.length)} className="press flex items-center gap-0.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.14]">
                    Dusra video <ChevronRight className="size-3" />
                  </button>
                ) : null}
                <a
                  href={`https://www.youtube.com/watch?v=${v.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-white/45 hover:text-white"
                >
                  YouTube <ExternalLink className="size-3" />
                </a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* Live: the learner's own running app, opened at the page this code powers. */
export function Live({ step, p }: ElProps) {
  const base = getLiveUrl();
  const path = step.path ?? "";
  const url = base ? base + (path && !path.startsWith("/") && !path.startsWith("?") ? "/" + path : path) : null;
  return (
    <div
      data-ink
      className="overflow-hidden rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.04]"
      style={{ opacity: p > 0 ? 1 : 0, transform: `translateY(${p > 0 ? 0 : 6}px)`, transition: "opacity 300ms ease-out, transform 300ms cubic-bezier(0.23,1,0.32,1)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Live app mein dekho</span>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 truncate text-xs text-white/45 hover:text-white">
            {url} <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : null}
      </div>
      {step.text ? <p className="px-4 pt-2.5 font-hand text-[1.45rem] leading-snug text-chalk">{step.text}</p> : null}
      {url ? (
        <div className="p-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-white/10 bg-white">
            <iframe src={url} title="Live app" className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      ) : (
        <p className="px-4 pb-3 pt-1 text-xs text-white/45">Repo panel mein &quot;Live app&quot; URL daalo (apna project chalake) toh ye feature yahin live dikhega.</p>
      )}
    </div>
  );
}
