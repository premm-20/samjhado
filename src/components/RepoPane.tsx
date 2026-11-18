"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileCode2, Folder, FolderOpen, GitBranch, Layers, Loader2, Search, Sparkles, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { completeListing, entryFiles, isReadable, mainFolders, repoPhases, treeText, type RepoEntry, type RepoPhase, type RepoSource } from "@/lib/github";
import type { BookContext } from "@/lib/types";
import type { Anchor, ExplainHow, NextTopic } from "./PdfPane";
import { setLiveUrl } from "@/lib/repoStore";

interface Props {
  source: RepoSource;
  onExplain: (ctx: BookContext, how: ExplainHow, anchor?: Anchor) => void;
  activeKey?: string;
  done: Set<string>;
  registerNext?: (next: NextTopic | null) => void;
}

const fileCache = new Map<string, Promise<string>>();

export default function RepoPane({ source, onExplain, activeKey, done, registerNext }: Props) {
  const [tab, setTab] = useState<"phases" | "files">("phases");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const phases = useMemo(() => repoPhases(source), [source]);

  const readFile = useCallback(
    (path: string): Promise<string> => {
      const key = `${source.owner}/${source.repo}@${source.branch}:${path}`;
      let p = fileCache.get(key);
      if (!p) {
        p = fetch("/api/gh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file: { owner: source.owner, repo: source.repo, branch: source.branch, path } }),
        })
          .then((r) => r.json())
          .then((j) => (typeof j.content === "string" ? j.content : ""))
          .catch(() => "");
        fileCache.set(key, p);
      }
      return p;
    },
    [source],
  );

  /** Collect the material Gemini needs for a phase (README, tree, key files). */
  const materialFor = useCallback(
    async (ph: RepoPhase): Promise<string> => {
      const head = `Repo: ${source.owner}/${source.repo}\nDescription: ${source.description || "(none)"}\nMain language: ${source.language || "?"}\n`;
      const files = async (paths: string[], each: number, total: number) => {
        let used = 0;
        const out: string[] = [];
        for (const p of paths) {
          if (used >= total) break;
          const c = (await readFile(p)).slice(0, each);
          if (!c) continue;
          used += c.length;
          out.push(`--- FILE ${p} ---\n${c}`);
        }
        return out.join("\n\n");
      };
      if (ph.kind === "overview")
        return `${head}\nREADME:\n${source.readme.slice(0, 12000) || "(no README)"}\n\nTop-level tree:\n${treeText(source.tree, "", 50)}`;
      if (ph.kind === "structure") {
        // Exact listings: the root, plus each main folder, so nothing gets skipped.
        const listings = ["", ...mainFolders(source.tree)].map((f) => completeListing(source.tree, f, 120)).join("\n\n");
        return `${head}\n${listings}\n\nREADME (start):\n${source.readme.slice(0, 3000)}`;
      }
      if (ph.kind === "entry") {
        const entries = entryFiles(source.tree);
        return `${head}\nTree:\n${treeText(source.tree, "", 80)}\n\nEntry / config files:\n${await files(entries, 5000, 18000)}`;
      }
      // area: the folder's tree plus a few of its most central files
      const folder = ph.folder!;
      const inside = source.tree
        .filter((e) => e.type === "blob" && e.path.startsWith(folder + "/") && isReadable(e.path) && (e.size ?? 0) < 40000)
        .sort((a, b) => a.path.split("/").length - b.path.split("/").length || (a.size ?? 0) - (b.size ?? 0))
        .map((e) => e.path);
      return `${head}\n${completeListing(source.tree, folder, 300)}\n\nCode of some of its files (others: infer from name, say you are inferring):\n${await files(inside.slice(0, 8), 3500, 20000)}`;
    },
    [source, readFile],
  );

  const ctxBase = { owner: source.owner, repo: source.repo, branch: source.branch };

  // Optional: where the learner is running this project, so lessons can point at the live feature.
  const liveKey = `samjhado:live:${source.owner}/${source.repo}`;
  const [live, setLive] = useState(() => {
    try {
      return localStorage.getItem(liveKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    setLiveUrl(live.trim() || null);
    try {
      localStorage.setItem(liveKey, live.trim());
    } catch {}
  }, [live, liveKey]);
  const liveNote = () =>
    live.trim()
      ? `\n\nLIVE APP: the learner is running this project right now at ${live.trim()}. Whenever code powers something visible (a page, tab, chart, button, API response), add a "live" step with path = the page/route to open ("" for the home page; use the route/page name you see in the code) and text = exactly which feature on that screen comes from this code, so the learner can look at it while you explain.`
      : "";

  const explainPhase = async (ph: RepoPhase, el?: HTMLElement | null) => {
    if (ph.kind === "file" && ph.file) return explainFile(ph.file, el);
    setBusy(ph.key);
    try {
      const text = (await materialFor(ph)) + liveNote();
      const i = phases.indexOf(ph);
      const r = el?.getBoundingClientRect();
      onExplain(
        {
          kind: "repo",
          label: `Phase ${i + 1}/${phases.length} · ${ph.title}`,
          text,
          page: 0,
          repo: { ...ctxBase, kind: ph.kind, title: ph.title, folder: ph.folder, phase: i + 1, phases: phases.length },
        },
        "explain",
        r ? { x: r.right, y: r.top + r.height / 2 } : undefined,
      );
    } finally {
      setBusy(null);
    }
  };

  /** The file's real outline (top-level functions/classes), so the lesson covers every one of them. */
  const outlineNote = (code: string) => {
    const names: string[] = [];
    const re =
      /^(?:async\s+def|def|class)\s+([A-Za-z_]\w*)|^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/;
    for (const line of code.split("\n")) {
      const m = line.match(re);
      const n = m && (m[1] || m[2] || m[3] || m[4]);
      if (n) names.push(n);
    }
    return names.length
      ? `\n\nFILE OUTLINE: this file defines ${names.length} top-level functions/classes, in this order: ${names.join(", ")}. Cover EVERY one of them with its own "code" step in this order (only tiny 2-4 line helpers may be grouped together). Do not stop before the last one.`
      : "";
  };

  const similarNote = (path: string) => {
    const sim = phases.find((p) => p.file === path)?.similar;
    return sim?.length
      ? `

SAME-TYPE FILES: ${sim.length} more files have exactly this structure (${sim.join(", ")}). Explain this one fully, then say clearly that the others are the same kind of file for their own dataset/folder and what differs between them.`
      : "";
  };

  const explainFile = async (path: string, el?: HTMLElement | null) => {
    setBusy(`file:${path}`);
    try {
      const code = await readFile(path);
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const text =
        `Repo: ${source.owner}/${source.repo} — ${source.description}\n\nWhere the file sits:\n${treeText(source.tree, dir, 40) || treeText(source.tree, "", 40)}\n\n` +
        `--- FILE ${path} (${code.split("\n").length} lines, numbered) ---\n${numberLines(code.slice(0, 45000))}${code.length > 45000 ? "\n[...truncated]" : ""}` +
        outlineNote(code) +
        liveNote() +
        similarNote(path);
      const r = el?.getBoundingClientRect();
      const i = phases.findIndex((p) => p.file === path);
      onExplain(
        {
          kind: "repo",
          label: i >= 0 ? `Phase ${i + 1}/${phases.length} · ${path}` : path,
          text,
          page: 0,
          repo: { ...ctxBase, kind: "file", title: path.split("/").pop() ?? path, file: path, ...(i >= 0 ? { phase: i + 1, phases: phases.length } : {}) },
        },
        "explain",
        r ? { x: r.right, y: r.top + r.height / 2 } : undefined,
      );
    } finally {
      setBusy(null);
    }
  };

  // Next in sequence: first phase not yet explained, after the active one.
  const next = useMemo(() => {
    const startIdx = Math.max(-1, phases.findIndex((p) => p.key === activeKey));
    const order = [...phases.slice(startIdx + 1), ...phases.slice(0, startIdx + 1)];
    return order.find((p) => !done.has(p.key)) ?? null;
  }, [phases, activeKey, done]);
  const explainRef = useRef(explainPhase);
  useEffect(() => {
    explainRef.current = explainPhase;
  });
  useEffect(() => {
    if (!registerNext) return;
    registerNext(next ? { label: `Phase ${phases.indexOf(next) + 1}: ${next.title}`, run: () => explainRef.current(next) } : null);
  }, [next, phases, registerNext]);

  const doneCount = phases.filter((p) => done.has(p.key)).length;
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Phases grouped by top-level folder (overview + every file inside).
  const groups = useMemo(() => {
    const out: { name: string | null; items: { ph: RepoPhase; i: number }[]; files: number; doneFiles: number }[] = [];
    phases.forEach((ph, i) => {
      const name = ph.group ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name && name !== null) last.items.push({ ph, i });
      else out.push({ name, items: [{ ph, i }], files: 0, doneFiles: 0 });
    });
    for (const g of out) {
      const files = g.items.filter((x) => x.ph.kind === "file");
      g.files = files.length;
      g.doneFiles = files.filter((x) => done.has(x.ph.key)).length;
    }
    return out;
  }, [phases, done]);
  const activeGroup = phases.find((p) => p.key === activeKey)?.group;
  const [openGroupsState, setOpenGroups] = useState<Set<string>>(() => new Set());
  const openGroups = useMemo(() => {
    const s = new Set(openGroupsState);
    if (activeGroup) s.add(activeGroup);
    return s;
  }, [openGroupsState, activeGroup]);
  const toggleGroup = (g: string) =>
    setOpenGroups((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const PhaseRow = ({ ph, n, compact, flat }: { ph: RepoPhase; n: number; compact?: boolean; flat?: boolean }) => {
    const isDone = done.has(ph.key);
    const active = ph.key === activeKey;
    return (
      <div
        className={`flex items-center gap-3 rounded-xl ${flat ? "" : "border"} ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"} ${
          active ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.08]" : flat ? "" : "border-white/[0.06] bg-white/[0.02]"
        }`}
      >
        <span
          className={`grid shrink-0 place-items-center rounded-full font-bold ${compact ? "size-5 text-[9px]" : "size-7 text-[11px]"} ${
            isDone ? "bg-[var(--accent)] text-ink" : "bg-white/[0.08] text-white/60"
          }`}
        >
          {isDone ? <Check className={compact ? "size-3" : "size-3.5"} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${compact ? "font-mono text-[12px] text-white/75" : "text-[13px] text-white/85"}`}>{ph.title}</span>
          {compact ? null : <span className="text-[11px] text-white/35">{PHASE_HINT[ph.kind]}</span>}
        </span>
        <button
          onClick={(e) => explainPhase(ph, e.currentTarget)}
          disabled={!!busy}
          className={`press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60 ${
            isDone ? "bg-white/[0.08] text-white/70" : "bg-[var(--accent)] text-ink"
          }`}
        >
          {busy === ph.key ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          {isDone ? "Dobara" : "Samjhao"}
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--pane)]">
      {/* repo header */}
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-white/80" aria-hidden>
            <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
          </svg>
          <p className="min-w-0 truncate text-sm font-semibold text-white">
            {source.owner}/<span className="text-[var(--accent)]">{source.repo}</span>
          </p>
        </div>
        {source.description ? <p className="mt-1 line-clamp-2 text-xs text-white/55">{source.description}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/45">
          {source.language ? <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-chalk-cyan" />{source.language}</span> : null}
          <span className="flex items-center gap-1"><Star className="size-3" />{source.stars}</span>
          <span className="flex items-center gap-1"><GitBranch className="size-3" />{source.branch}</span>
          <span>{source.tree.filter((e) => e.type === "blob").length} files</span>
        </div>
        <label className="mt-2.5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 focus-within:border-[var(--accent)]/50">
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-white/50">
            <span className={`size-1.5 rounded-full ${live.trim() ? "bg-[var(--accent)]" : "bg-white/25"}`} /> Live app
          </span>
          <input
            value={live}
            onChange={(e) => setLive(e.target.value)}
            placeholder="optional: http://localhost:8501 (apna project chalao)"
            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
          />
        </label>
      </div>

      {/* tabs */}
      <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-1.5">
        <Tab on={tab === "phases"} onClick={() => setTab("phases")}>
          <Layers className="size-4" /> Phases
        </Tab>
        <Tab on={tab === "files"} onClick={() => setTab("files")}>
          <FolderOpen className="size-4" /> Files
        </Tab>
      </div>

      {tab === "phases" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out" style={{ width: `${(doneCount / phases.length) * 100}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-white/40">
              {doneCount}/{phases.length} phases
            </span>
          </div>
          {next ? (
            <button
              ref={nextBtn}
              onClick={() => explainPhase(next, nextBtn.current)}
              disabled={!!busy}
              className="press mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-12px_var(--accent)] disabled:opacity-60"
            >
              {busy === next.key ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {doneCount === 0 ? "Shuru karo" : "Agla phase samjhao"}
              <span className="truncate font-normal opacity-70">· {next.title}</span>
              <ArrowRight className="size-4 shrink-0" />
            </button>
          ) : (
            <p className="mb-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center text-sm text-[var(--accent)]">
              Poora repo samajh liya! Ab Files tab se kisi bhi file ko kholke samjho.
            </p>
          )}
          <div className="space-y-1.5">
            {groups.map((g) =>
              g.name === null ? (
                g.items.map(({ ph, i }) => <PhaseRow key={ph.key} ph={ph} n={i + 1} />)
              ) : (
                <div key={g.name} className="rounded-xl border border-white/[0.06] bg-white/[0.015]">
                  {g.items[0]?.ph.kind === "area" ? <PhaseRow ph={g.items[0].ph} n={g.items[0].i + 1} flat /> : null}
                  {g.items.length > 1 ? (
                    <button
                      onClick={() => toggleGroup(g.name!)}
                      className="flex w-full items-center gap-2 px-3 pb-2 pt-1 text-left text-[11px] text-white/45 hover:text-white/80"
                    >
                      <ChevronRight className={`size-3.5 transition-transform duration-150 ${openGroups.has(g.name!) ? "rotate-90" : ""}`} />
                      {g.files} files · {g.doneFiles} samjhi · andar har file ka lesson
                    </button>
                  ) : null}
                  {openGroups.has(g.name!) ? (
                    <div className="space-y-1 px-2 pb-2">
                      {g.items
                        .filter(({ ph }) => ph.kind === "file")
                        .map(({ ph, i }) => (
                          <PhaseRow key={ph.key} ph={ph} n={i + 1} compact />
                        ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
          <button onClick={() => setTab("files")} className="press mt-3 flex items-center gap-1.5 px-1 text-xs text-white/45 hover:text-white">
            <FolderOpen className="size-3.5" /> Kisi file ko kholke samjho →
          </button>
        </div>
      ) : openFile ? (
        <FileViewer
          path={openFile}
          read={readFile}
          isDone={done.has(`file:${openFile}`)}
          busy={busy === `file:${openFile}`}
          onBack={() => setOpenFile(null)}
          onExplain={(el) => explainFile(openFile, el)}
        />
      ) : (
        <FileTree tree={source.tree} done={done} onOpen={setOpenFile} />
      )}
    </div>
  );
}

const PHASE_HINT: Record<RepoPhase["kind"], string> = {
  overview: "Project kya hai, kisliye hai, kya use karta hai",
  structure: "Kaunsa folder kya karta hai",
  entry: "App kahan se start hota hai, flow kaise chalta hai",
  area: "Is hisse ki files aur unka kaam",
  file: "Is file ka har block of code",
};

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

/* ---------------- file tree ---------------- */
interface Node {
  name: string;
  path: string;
  dir: boolean;
  children: Node[];
}

function buildTree(entries: RepoEntry[]): Node {
  const root: Node = { name: "", path: "", dir: true, children: [] };
  const dirs = new Map<string, Node>([["", root]]);
  const ensure = (path: string): Node => {
    const hit = dirs.get(path);
    if (hit) return hit;
    const parent = ensure(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
    const node: Node = { name: path.split("/").pop()!, path, dir: true, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const e of entries) {
    if (e.type === "tree") ensure(e.path);
    else {
      const parent = ensure(e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "");
      parent.children.push({ name: e.path.split("/").pop()!, path: e.path, dir: false, children: [] });
    }
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function FileTree({ tree, done, onOpen }: { tree: RepoEntry[]; done: Set<string>; onOpen: (p: string) => void }) {
  const root = useMemo(() => buildTree(tree.filter((e) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(e.path))), [tree]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return tree.filter((e) => e.type === "blob" && e.path.toLowerCase().includes(s)).slice(0, 200);
  }, [q, tree]);

  const toggle = (p: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const row = (n: Node, depth: number): React.ReactNode => (
    <div key={n.path}>
      <button
        onClick={() => (n.dir ? toggle(n.path) : isReadable(n.path) && onOpen(n.path))}
        disabled={!n.dir && !isReadable(n.path)}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-40"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {n.dir ? (
          <>
            <ChevronRight className={`size-3.5 shrink-0 text-white/35 transition-transform duration-150 ${open.has(n.path) ? "rotate-90" : ""}`} />
            <Folder className="size-4 shrink-0 fill-chalk-yellow/20 text-chalk-yellow" />
            <span className="truncate text-white/85">{n.name}</span>
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileCode2 className="size-4 shrink-0 text-chalk-cyan/80" />
            <span className="truncate text-white/75">{n.name}</span>
            {done.has(`file:${n.path}`) ? <Check className="ml-auto size-3.5 shrink-0 text-[var(--accent)]" /> : null}
          </>
        )}
      </button>
      <AnimatePresence initial={false}>
        {n.dir && open.has(n.path) ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            {n.children.map((c) => row(c, depth + 1))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 p-3 pb-2">
        <Search className="pointer-events-none absolute left-5.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="File dhundho…"
          className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--accent)]/50"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-6">
        {matches
          ? matches.map((e) => (
              <button
                key={e.path}
                onClick={() => isReadable(e.path) && onOpen(e.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-white/75 hover:bg-white/[0.05]"
              >
                <FileCode2 className="size-4 shrink-0 text-chalk-cyan/80" />
                <span className="truncate">{e.path}</span>
              </button>
            ))
          : root.children.map((c) => row(c, 0))}
      </div>
    </div>
  );
}

/* ---------------- file viewer ---------------- */
function FileViewer({
  path,
  read,
  isDone,
  busy,
  onBack,
  onExplain,
}: {
  path: string;
  read: (p: string) => Promise<string>;
  isDone: boolean;
  busy: boolean;
  onBack: () => void;
  onExplain: (el: HTMLElement | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    read(path).then((c) => alive && setCode(c));
    return () => {
      alive = false;
    };
  }, [path, read]);
  const lines = (code ?? "").split("\n");
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-2 py-2">
        <button onClick={onBack} className="press grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/[0.07] hover:text-white" aria-label="Back to files">
          <ArrowLeft className="size-4" />
        </button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-white/75" title={path}>
          {path}
        </p>
        <button
          ref={btn}
          onClick={() => onExplain(btn.current)}
          disabled={busy || code === null}
          className="press flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {isDone ? "Dobara samjhao" : "Is file ko samjhao"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#0d1117]">
        {code === null ? (
          <p className="flex items-center gap-2 p-4 text-sm text-white/45">
            <Loader2 className="size-4 animate-spin" /> File khul rahi hai…
          </p>
        ) : (
          <pre className="py-2 font-mono text-[12.5px] leading-[1.6] text-[#e6edf3]">
            {lines.slice(0, 3000).map((l, i) => (
              <div key={i} className="flex hover:bg-white/[0.03]">
                <span className="w-12 shrink-0 select-none pr-3 text-right text-white/25">{i + 1}</span>
                <span className="whitespace-pre pr-4">{l || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

/** "1| first line" style numbering, so lessons can point at exact line ranges. */
function numberLines(code: string): string {
  return code
    .split("\n")
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n");
}
