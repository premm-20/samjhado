"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, FileText, ListTree, Minus, Plus, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { BookContext } from "@/lib/types";
import { IconBtn } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type PdfDoc = Parameters<NonNullable<React.ComponentProps<typeof Document>["onLoadSuccess"]>>[0];

export type ExplainHow = "explain" | "type" | "speak" | "select";

/** Where the explained text sits on screen, so the app can draw an arrow from it to the board. */
export interface Anchor {
  x: number;
  y: number;
}

interface Mark {
  page: number;
  rects: { l: number; t: number; w: number; h: number }[];
}

interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

interface PopoverState {
  x: number;
  y: number;
  anchor: Anchor;
  mark: Mark;
  build: () => Promise<BookContext>;
}

const GAP = 18;
const PAD = 20;

/** What "Agla topic" should do after a lesson finishes. */
export interface NextTopic {
  label: string;
  run: () => void;
}

export default function PdfPane({
  file,
  onExplain,
  activeLabel,
  active,
  registerNext,
}: {
  file: File;
  onExplain: (ctx: BookContext, how: ExplainHow, anchor?: Anchor) => void;
  activeLabel?: string;
  /** The context of the lesson being taught, to work out what comes next. */
  active?: BookContext | null;
  registerNext?: (next: NextTopic | null) => void;
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [fitWidth, setFitWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [cur, setCur] = useState(1);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [showOutline, setShowOutline] = useState(false);
  const [pop, setPop] = useState<PopoverState | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [mark, setMark] = useState<Mark | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);


  const width = Math.round(fitWidth * zoom);
  const pageH = width * ratio;

  // Fit pages to the pane width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(Math.max(280, el.clientWidth - PAD * 2)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLoad = useCallback(async (pdf: PdfDoc) => {
    setDoc(pdf);
    setNumPages(pdf.numPages);
    const first = await pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    setRatio(vp.height / vp.width);
    // Table of contents, resolved to page numbers.
    try {
      const raw = await pdf.getOutline();
      const out: OutlineEntry[] = [];
      const walk = async (items: typeof raw, depth: number) => {
        for (const it of items ?? []) {
          if (out.length > 400) return;
          let page = 0;
          try {
            const dest = typeof it.dest === "string" ? await pdf.getDestination(it.dest) : it.dest;
            if (dest && dest[0]) page = (await pdf.getPageIndex(dest[0] as never)) + 1;
          } catch {}
          if (page) out.push({ title: it.title.replace(/\s+/g, " ").trim(), page, depth });
          if (depth < 2 && it.items?.length) await walk(it.items, depth + 1);
        }
      };
      await walk(raw, 0);
      setOutline(out);
      if (out.length) setShowOutline(true);
    } catch {
      setOutline([]);
    }
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const p = Math.min(numPages, Math.max(1, Math.floor((el.scrollTop + el.clientHeight * 0.35) / (pageH + GAP)) + 1));
    setCur(p);
    setPageInput(String(p));
    setPop(null);
  }, [numPages, pageH]);

  const goToPage = useCallback(
    (p: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const n = Math.min(numPages, Math.max(1, p));
      el.scrollTo({ top: (n - 1) * (pageH + GAP), behavior: "smooth" });
    },
    [numPages, pageH],
  );

  /* ---------------- text + image helpers ---------------- */
  const pageText = useCallback(
    async (n: number) => {
      if (!doc) return "";
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      return tc.items
        .map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();
    },
    [doc],
  );

  const pageImage = useCallback((n: number): string | undefined => {
    const canvas = scrollRef.current?.querySelector<HTMLCanvasElement>(`[data-page-num="${n}"] canvas`);
    if (!canvas || !canvas.width) return undefined;
    const maxW = 1100;
    const s = Math.min(1, maxW / canvas.width);
    const off = document.createElement("canvas");
    off.width = Math.round(canvas.width * s);
    off.height = Math.round(canvas.height * s);
    const g = off.getContext("2d");
    if (!g) return undefined;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, off.width, off.height);
    g.drawImage(canvas, 0, 0, off.width, off.height);
    return off.toDataURL("image/jpeg", 0.72).split(",")[1];
  }, []);

  /* ---------------- selection -> popover ---------------- */
  const onMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!sel || sel.rangeCount === 0 || text.length < 3) return;
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const pageEl = anchor?.closest<HTMLElement>("[data-page-num]");
      if (!pageEl || !scrollRef.current?.contains(pageEl)) return;
      const page = Number(pageEl.dataset.pageNum);
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pr = pageEl.getBoundingClientRect();
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({ l: (r.left - pr.left) / pr.width, t: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height }));
      const ctx: BookContext = { kind: "selection", label: `Selection · p.${page}`, text, page, image: pageImage(page) };
      // The selection becomes the composer context right away, so typing or speaking works too.
      onExplain(ctx, "select");
      setPop({
        x: rect.right,
        y: rect.top + rect.height / 2,
        anchor: { x: rect.right + 4, y: rect.top + rect.height / 2 },
        mark: { page, rects },
        build: async () => ctx,
      });
    }, 0);
  }, [pageImage, onExplain]);

  const explainPage = async (n: number, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMark({ page: n, rects: [{ l: 0, t: 0, w: 1, h: 1 }] });
    const ctx: BookContext = { kind: "page", label: `Page ${n}`, text: await pageText(n), page: n, image: pageImage(n) };
    onExplain(ctx, "explain", { x: r.right, y: r.top + r.height / 2 });
  };

  const explainChapter = async (idx: number, how: ExplainHow) => {
    const entry = outline[idx];
    const nextStart = outline.slice(idx + 1).find((o) => o.page > entry.page)?.page ?? numPages + 1;
    const end = Math.min(nextStart - 1, entry.page + 3, numPages);
    const texts: string[] = [];
    for (let p = entry.page; p <= Math.max(entry.page, end); p++) texts.push(await pageText(p));
    goToPage(entry.page);
    onExplain({ kind: "chapter", label: entry.title, text: texts.join("\n\n"), page: entry.page, image: pageImage(entry.page) }, how);
  };

  /** Explain a whole page without a click (used by "Agla topic"). */
  const explainPageN = async (n: number) => {
    goToPage(n);
    setMark({ page: n, rects: [{ l: 0, t: 0, w: 1, h: 1 }] });
    await new Promise((r) => setTimeout(r, 700)); // let the page render so its image can be sent
    onExplain({ kind: "page", label: `Page ${n}`, text: await pageText(n), page: n, image: pageImage(n) }, "explain");
  };

  // Next in sequence: the next Contents entry after a chapter, otherwise the next page.
  const actionsRef = useRef({ explainChapter, explainPageN });
  useEffect(() => {
    actionsRef.current = { explainChapter, explainPageN };
  });
  useEffect(() => {
    if (!registerNext) return;
    if (!active || active.kind === "video" || !numPages) return registerNext(null);
    if (active.kind === "chapter") {
      const i = outline.findIndex((o) => o.title === active.label && o.page === active.page);
      const j = i >= 0 ? outline.findIndex((o, k) => k > i && o.page >= active.page) : -1;
      if (j >= 0) {
        const title = outline[j].title;
        return registerNext({ label: title, run: () => actionsRef.current.explainChapter(j, "explain") });
      }
    }
    const nextPage = active.page + 1;
    registerNext(nextPage <= numPages ? { label: `Page ${nextPage}`, run: () => actionsRef.current.explainPageN(nextPage) } : null);
  }, [active, outline, numPages, registerNext]);

  const act = async () => {
    if (!pop) return;
    const ctx = await pop.build();
    setMark(pop.mark);
    setPop(null);
    window.getSelection()?.removeAllRanges();
    onExplain(ctx, "explain", pop.anchor);
  };

  // Close the pill on outside press / Escape (without blocking a new selection).
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setPop(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [pop]);

  const visible = (n: number) => Math.abs(n - cur) <= 2;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--pane)]">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
        <IconBtn label="Contents" active={showOutline} onClick={() => setShowOutline((v) => !v)}>
          <ListTree className="size-4" />
        </IconBtn>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <IconBtn label="Previous page" onClick={() => goToPage(cur - 1)}>
          <ChevronLeft className="size-4" />
        </IconBtn>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            goToPage(Number(pageInput) || 1);
          }}
          className="flex items-center gap-1 text-xs text-white/50"
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            className="h-7 w-11 rounded-md border border-white/10 bg-white/5 text-center text-white tabular-nums outline-none focus:border-[var(--accent)]"
            aria-label="Page number"
          />
          <span className="tabular-nums">/ {numPages || "–"}</span>
        </form>
        <IconBtn label="Next page" onClick={() => goToPage(cur + 1)}>
          <ChevronRight className="size-4" />
        </IconBtn>
        <div className="flex-1" />
        <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}>
          <Minus className="size-4" />
        </IconBtn>
        <span className="w-10 text-center text-xs tabular-nums text-white/50">{Math.round(zoom * 100)}%</span>
        <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}>
          <Plus className="size-4" />
        </IconBtn>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* outline drawer */}
        <AnimatePresence initial={false}>
          {showOutline ? (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="shrink-0 overflow-hidden border-r border-white/[0.06] bg-black/20"
            >
              <div className="h-full w-64 overflow-y-auto p-2">
                <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Contents
                  <button onClick={() => setShowOutline(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close contents">
                    <X className="size-3.5" />
                  </button>
                </div>
                {outline.length === 0 ? (
                  <p className="px-2 text-sm text-white/40">Is PDF mein table of contents nahi mila. Text select karo ya page pe “Samjhao” dabao.</p>
                ) : (
                  outline.map((o, i) => (
                    <div
                      key={i}
                      className={`group flex items-center gap-1 rounded-lg pr-1 hover:bg-white/[0.06] ${
                        activeLabel === o.title ? "bg-[var(--accent)]/10" : ""
                      }`}
                      style={{ paddingLeft: 8 + o.depth * 12 }}
                    >
                      <button
                        onClick={() => goToPage(o.page)}
                        className={`min-w-0 flex-1 truncate py-1.5 text-left text-[13px] ${
                          o.depth === 0 ? "font-medium text-white/85" : "text-white/55"
                        }`}
                        title={o.title}
                      >
                        {o.title}
                      </button>
                      <span className="text-[10px] tabular-nums text-white/30 group-hover:hidden">{o.page}</span>
                      <button
                        onClick={() => explainChapter(i, "type")}
                        className="hidden rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-ink group-hover:block"
                        title="Select this section to explain"
                      >
                        Select
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* pages */}
        <div ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUp} className="pdf-scroll relative min-h-0 flex-1 overflow-auto">
          <Document
            file={file}
            suspense={false}
            onLoadSuccess={onLoad}
            loading={<PaneMessage icon={<BookOpen className="size-5 animate-pulse" />} text="Book khul rahi hai…" />}
            error={<PaneMessage icon={<FileText className="size-5" />} text="Ye PDF open nahi ho payi. Koi aur file try karo." />}
          >
            <div style={{ padding: PAD, width: width + PAD * 2 }} className="mx-auto">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  data-page-num={n}
                  className="pdf-page group relative mx-auto overflow-hidden rounded-md bg-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.7)]"
                  style={{ width, height: pageH, marginBottom: GAP }}
                >
                  {visible(n) ? (
                    <Page pageNumber={n} width={width} suspense={false} renderAnnotationLayer={false} loading={null} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-black/20">{n}</div>
                  )}
                  {mark?.page === n
                    ? mark.rects.map((r, i) => (
                        <span
                          key={i}
                          className={`pointer-events-none absolute z-[5] ${mark.rects.length === 1 && r.w === 1 ? "page-mark" : "text-mark"}`}
                          style={{ left: `${r.l * 100}%`, top: `${r.t * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                        />
                      ))
                    : null}
                  <button
                    onClick={(e) => explainPage(n, e)}
                    className="press absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-ink/85 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Sparkles className="size-3.5 text-[var(--accent)]" />
                    Is page ko samjhao
                  </button>
                </div>
              ))}
            </div>
          </Document>
        </div>
      </div>

      {/* selection action: one pill growing out of the highlight */}
      <AnimatePresence>
        {pop ? (
          <motion.div
            key={`${pop.x}-${pop.y}`}
            ref={popRef}
            initial={{ opacity: 0, x: -6, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="fixed z-50 flex origin-left -translate-y-1/2 items-center"
            style={{ left: Math.min(pop.x + 4, window.innerWidth - 170), top: Math.max(70, Math.min(pop.y, window.innerHeight - 40)) }}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <span className="h-0.5 w-5 rounded-full bg-[var(--accent)]" />
            <button
              onClick={act}
              className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] py-1.5 pl-3 pr-2.5 text-sm font-semibold text-ink shadow-[0_8px_30px_-6px_var(--accent)]"
            >
              <Sparkles className="size-4" /> Samjhao <ArrowRight className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PaneMessage({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-sm text-white/50">
      {icon}
      {text}
    </div>
  );
}
