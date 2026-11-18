"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, ListVideo, Play, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookContext } from "@/lib/types";
import { fmtTime, phasesFor, type Phase, type YtSource, type YtVideo } from "@/lib/youtube";
import type { Anchor, ExplainHow, NextTopic } from "./PdfPane";

export const phaseKey = (videoId: string, phase: number) => `${videoId}:${phase}`;

interface Props {
  source: YtSource;
  onExplain: (ctx: BookContext, how: ExplainHow, anchor?: Anchor) => void;
  activeKey?: string;
  done: Set<string>;
  registerNext?: (next: NextTopic | null) => void;
}

export default function VideoPane({ source, onExplain, activeKey, done, registerNext }: Props) {
  const videos = source.videos;
  const [current, setCurrent] = useState(() => {
    const k = activeKey?.split(":")[0] ?? source.startId;
    return Math.max(0, videos.findIndex((v) => v.id === k));
  });
  const [open, setOpen] = useState<Set<number>>(() => new Set([current]));
  const [query, setQuery] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [startAt, setStartAt] = useState(0);
  const video = videos[current];
  const isPlaylist = source.kind === "playlist" && videos.length > 1;

  // Seek an already-loaded player without reloading it.
  const command = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }, []);
  const seek = useCallback((sec: number) => command("seekTo", [sec, true]), [command]);

  // Board "video moments": show the frame being explained, play that part (by the lesson or a
  // click on ▶), and follow the lesson's pause/resume while a clip is playing.
  const [clipLive, setClipLive] = useState<{ start: number; end: number } | null>(null);
  const [tab, setTab] = useState<"video" | "classes">("video");
  useEffect(() => {
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let remainingMs = 0;
    let startedAt = 0;
    const stopAfter = (ms: number) => {
      clearTimeout(stopTimer);
      remainingMs = ms;
      startedAt = Date.now();
      stopTimer = setTimeout(() => {
        command("pauseVideo");
        setClipLive(null);
      }, ms);
    };
    const onClip = (e: Event) => {
      const d = (e as CustomEvent<{ start?: number; end?: number; play?: boolean; action?: "pause" | "resume" | "stop" }>).detail;
      if (d.action === "pause") {
        clearTimeout(stopTimer);
        remainingMs -= Date.now() - startedAt;
        command("pauseVideo");
        return;
      }
      if (d.action === "resume") {
        if (remainingMs > 300) {
          command("playVideo");
          stopAfter(remainingMs);
        }
        return;
      }
      if (d.action === "stop") {
        clearTimeout(stopTimer);
        remainingMs = 0;
        command("pauseVideo");
        setClipLive(null);
        return;
      }
      const start = d.start ?? 0;
      const end = d.end ?? start + 20;
      setTab("video");
      command("seekTo", [start, true]);
      if (d.play) {
        command("playVideo");
        setClipLive({ start, end });
        stopAfter(Math.max(3, end - start) * 1000);
      } else {
        // Show that frame like a screenshot (seekTo starts playback, so pause right after).
        clearTimeout(stopTimer);
        setClipLive(null);
        setTimeout(() => command("pauseVideo"), 350);
      }
    };
    window.addEventListener("samjhado:clip", onClip);
    return () => {
      window.removeEventListener("samjhado:clip", onClip);
      clearTimeout(stopTimer);
    };
  }, [command]);

  const select = (i: number, at = 0) => {
    if (i !== current) {
      setCurrent(i);
      setStartAt(at);
    } else seek(at);
    setOpen((o) => new Set(o).add(i));
  };

  const ctxFor = (vi: number, ph: Phase, total: number): BookContext => {
    const v = videos[vi];
    const label = `${isPlaylist ? `Class ${vi + 1} · ` : ""}${total > 1 ? `Phase ${ph.index + 1}/${total}` : "Full video"}`;
    return {
      kind: "video",
      label,
      text: "",
      page: 0,
      video: {
        id: v.id,
        title: v.title,
        start: ph.start,
        end: ph.end,
        phase: ph.index + 1,
        phases: total,
        course: isPlaylist ? source.title : undefined,
        position: vi + 1,
        total: videos.length,
      },
    };
  };

  const explain = (vi: number, ph: Phase, total: number, el?: HTMLElement | null) => {
    select(vi, ph.start);
    const r = el?.getBoundingClientRect();
    onExplain(ctxFor(vi, ph, total), "explain", r ? { x: r.right, y: r.top + r.height / 2 } : undefined);
  };

  // "Next" = first phase (in course order) that hasn't been explained yet, after the active one.
  const next = useMemo(() => findNext(videos, done, activeKey), [activeKey, videos, done]);

  // Tell the workspace what "Agla topic" means right now.
  const explainRef = useRef(explain);
  useEffect(() => {
    explainRef.current = explain;
  });
  useEffect(() => {
    if (!registerNext) return;
    if (!next) return registerNext(null);
    const label = `${isPlaylist ? `Class ${next.vi + 1}` : "Video"}${next.total > 1 ? `, phase ${next.ph.index + 1}` : ""}: ${videos[next.vi].title}`;
    registerNext({ label, run: () => explainRef.current(next.vi, next.ph, next.total) });
  }, [next, isPlaylist, videos, registerNext]);

  const nextBtn = useRef<HTMLButtonElement>(null);
  const totalHours = videos.reduce((a, v) => a + v.seconds, 0) / 3600;
  const doneCount = videos.reduce((a, v) => a + phasesFor(v.seconds).filter((p) => done.has(phaseKey(v.id, p.index))).length, 0);
  const allPhases = videos.reduce((a, v) => a + phasesFor(v.seconds).length, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.map((v, i) => ({ v, i })).filter(({ v }) => !q || v.title.toLowerCase().includes(q));
  }, [videos, query]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== "classes") return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-class-index="${current}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [tab, current]);

  // The class being taught is always shown open.
  const activeIndex = videos.findIndex((v) => v.id === activeKey?.split(":")[0]);

  const classRow = (v: YtVideo, i: number, opts: { showIndex: boolean; forceOpen?: boolean }) => (
    <ClassRow
      key={v.id + i}
      v={v}
      index={i}
      showIndex={opts.showIndex}
      isCurrent={i === current}
      isOpen={opts.forceOpen || open.has(i) || i === activeIndex}
      onToggle={() =>
        setOpen((o) => {
          const n = new Set(o);
          if (n.has(i)) n.delete(i);
          else n.add(i);
          return n;
        })
      }
      onPlay={(at) => {
        select(i, at);
        setTab("video");
      }}
      onExplain={(ph, total, el) => {
        explain(i, ph, total, el);
        setTab("video");
      }}
      activeKey={activeKey}
      done={done}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--pane)]">
      {/* tabs */}
      {isPlaylist ? (
        <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-1.5">
          <TabBtn on={tab === "video"} onClick={() => setTab("video")}>
            <Play className="size-3.5 fill-current" /> Video
          </TabBtn>
          <TabBtn on={tab === "classes"} onClick={() => setTab("classes")}>
            <ListVideo className="size-4" /> Classes
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{videos.length}</span>
          </TabBtn>
        </div>
      ) : null}

      {/* VIDEO tab (the player stays mounted so it keeps playing while browsing classes) */}
      <div className={tab === "video" ? "flex min-h-0 flex-1 flex-col overflow-y-auto" : "hidden"}>
        <div className="shrink-0 p-3">
          <div
            className={`relative aspect-video overflow-hidden rounded-xl bg-black shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] transition-[box-shadow] duration-300 ${
              clipLive ? "ring-2 ring-[#ff3d3d] shadow-[0_0_40px_-6px_#ff3d3d]" : ""
            }`}
          >
            <iframe
              key={video.id}
              ref={frameRef}
              src={`https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&rel=0&modestbranding=1&start=${Math.floor(startAt)}`}
              title={video.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
            {clipLive ? (
              <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-[#ff3d3d] px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> Teacher video dikha raha hai · {fmtTime(clipLive.start)}–{fmtTime(clipLive.end)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium text-white/85">
            {isPlaylist ? <span className="mr-1.5 text-white/40">Class {current + 1}.</span> : null}
            {video.title}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out" style={{ width: `${(doneCount / Math.max(1, allPhases)) * 100}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-white/40">
              {doneCount}/{allPhases} phases
            </span>
          </div>
          {next ? (
            <button
              ref={nextBtn}
              onClick={() => explain(next.vi, next.ph, next.total, nextBtn.current)}
              className="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-12px_var(--accent)]"
            >
              <Sparkles className="size-4" />
              {doneCount === 0 ? "Shuru karo" : "Agla phase samjhao"}
              <span className="truncate font-normal opacity-70">
                · {isPlaylist ? `Class ${next.vi + 1}, ` : ""}
                {next.total > 1 ? `phase ${next.ph.index + 1}` : "full"}
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </button>
          ) : (
            <p className="mt-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center text-sm text-[var(--accent)]">
              Poora course samajh liya! 🎉
            </p>
          )}
        </div>
        <div className="px-2 pb-4">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Is class ke phases · {fmtTime(video.seconds)}
          </p>
          {classRow(video, current, { showIndex: false, forceOpen: true })}
          {isPlaylist ? (
            <button onClick={() => setTab("classes")} className="press mx-2 mt-2 flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
              <ListVideo className="size-3.5" /> Saari classes dekho ({videos.length}) →
            </button>
          ) : null}
        </div>
      </div>

      {/* CLASSES tab: the whole course, full height */}
      {isPlaylist ? (
        <div className={tab === "classes" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <div className="shrink-0 px-3 pb-2 pt-3">
            <p className="pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {source.title} · {videos.length} classes · {totalHours.toFixed(1)} hrs
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Topic dhundho…"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--accent)]/50"
              />
            </div>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6 [scrollbar-width:thin]">
            {filtered.map(({ v, i }) => (
              <div key={v.id + i} data-class-index={i}>
                {classRow(v, i, { showIndex: true })}
              </div>
            ))}
            {filtered.length === 0 ? <p className="px-3 py-6 text-center text-sm text-white/40">Koi class nahi mili</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors duration-150 ${
        on ? "bg-white/[0.1] text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

/** First unexplained phase after the active one, wrapping to the start of the course. */
function findNext(videos: YtVideo[], done: Set<string>, activeKey?: string) {
  const [aId, aPh] = (activeKey ?? "").split(":");
  const startV = Math.max(0, videos.findIndex((v) => v.id === aId));
  const startP = aId ? Number(aPh) + 1 : 0;
  const order: { vi: number; p: number }[] = [];
  videos.forEach((v, vi) => phasesFor(v.seconds).forEach((_, p) => order.push({ vi, p })));
  const from = order.findIndex((o) => o.vi > startV || (o.vi === startV && o.p >= startP));
  const rotated = from < 0 ? order : [...order.slice(from), ...order.slice(0, from)];
  const hit = rotated.find((o) => !done.has(phaseKey(videos[o.vi].id, o.p)));
  if (!hit) return null;
  const phs = phasesFor(videos[hit.vi].seconds);
  return { vi: hit.vi, ph: phs[hit.p], total: phs.length };
}

function ClassRow({
  v,
  index,
  showIndex,
  isCurrent,
  isOpen,
  onToggle,
  onPlay,
  onExplain,
  activeKey,
  done,
}: {
  v: YtVideo;
  index: number;
  showIndex: boolean;
  isCurrent: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onPlay: (at: number) => void;
  onExplain: (ph: Phase, total: number, el: HTMLElement | null) => void;
  activeKey?: string;
  done: Set<string>;
}) {
  const phases = phasesFor(v.seconds);
  const doneN = phases.filter((p) => done.has(phaseKey(v.id, p.index))).length;
  const complete = doneN === phases.length;
  return (
    <div className={`mb-1 rounded-xl ${isCurrent ? "bg-white/[0.045]" : ""}`}>
      {showIndex ? (
        <button onClick={onToggle} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04]">
          <span
            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
              complete ? "bg-[var(--accent)] text-ink" : isCurrent ? "bg-white text-ink" : "bg-white/[0.08] text-white/60"
            }`}
          >
            {complete ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`line-clamp-2 text-[13px] leading-snug ${isCurrent ? "text-white" : "text-white/75"}`}>{v.title}</span>
            <span className="mt-0.5 block text-[11px] tabular-nums text-white/35">
              {fmtTime(v.seconds)}
              {phases.length > 1 ? ` · ${phases.length} phases` : ""}
              {doneN && !complete ? ` · ${doneN} done` : ""}
            </span>
          </span>
          <ChevronDown className={`mt-1 size-4 shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      ) : null}
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className={`space-y-1 pb-2 ${showIndex ? "pl-10 pr-2" : "px-1"}`}>
              {phases.map((ph) => {
                const key = phaseKey(v.id, ph.index);
                const active = key === activeKey;
                const isDone = done.has(key);
                return (
                  <div
                    key={ph.index}
                    className={`group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                      active ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.08]" : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <button onClick={() => onPlay(ph.start)} className="press grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.06] text-white/60 hover:text-white" title="Video mein yahan jao">
                      <Play className="size-3 fill-current" />
                    </button>
                    <span className="min-w-0 flex-1 text-xs">
                      <span className="text-white/80">{phases.length > 1 ? `Phase ${ph.index + 1}` : "Full video"}</span>
                      <span className="ml-1.5 tabular-nums text-white/35">
                        {fmtTime(ph.start)}–{fmtTime(ph.end)}
                      </span>
                    </span>
                    {isDone ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
                    <button
                      onClick={(e) => onExplain(ph, phases.length, e.currentTarget)}
                      className={`press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isDone ? "bg-white/[0.08] text-white/70 hover:bg-white/[0.14]" : "bg-[var(--accent)] text-ink"
                      }`}
                    >
                      <Sparkles className="size-3" /> {isDone ? "Dobara" : "Samjhao"}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
