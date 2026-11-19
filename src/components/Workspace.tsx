"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Expand,
  Maximize2,
  Minimize2,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_LESSON } from "@/lib/demoLesson";
import type { BookContext, Lesson, LessonRequest, Step } from "@/lib/types";
import type { YtSource } from "@/lib/youtube";
import { getProfileId, learnerFor, scoped, setProfileId } from "@/lib/profiles";
import { repoTopicKey, type RepoSource } from "@/lib/github";
import { setRepoTree } from "@/lib/repoStore";
import { friendlyError } from "@/lib/errors";
import { Board, type BoardApi } from "./board/Board";
import { videoMoment } from "./board/elements3";
import { getVoice, setVoice, VOICES } from "@/lib/voice";
import { Composer, type ComposerMode } from "./Composer";
import { Landing, Logo } from "./Landing";
import { NotesPanel } from "./NotesPanel";
import { ProfilePicker } from "./ProfilePicker";
import type { Anchor, ExplainHow, NextTopic } from "./PdfPane";
import { IconBtn } from "./ui";

const PdfPane = dynamic(() => import("./PdfPane"), { ssr: false });
const VideoPane = dynamic(() => import("./VideoPane"), { ssr: false });
const RepoPane = dynamic(() => import("./RepoPane"), { ssr: false });

/** Saved progress per YouTube course/video so later classes can recall earlier ones. */
// Progress is saved per learner; Prem also picks up anything saved before profiles existed.
const ytStoreKey = (id: string) => scoped(getProfileId(), `yt:${id}`);
function loadYtProgress(id: string): { memory: string[]; done: string[] } {
  try {
    const raw = localStorage.getItem(ytStoreKey(id)) ?? (getProfileId() === "prem" ? localStorage.getItem(`samjhado:yt:${id}`) : null);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { memory: [], done: [] };
}
function saveYtProgress(id: string, memory: string[], done: string[]) {
  try {
    localStorage.setItem(ytStoreKey(id), JSON.stringify({ memory, done }));
  } catch {}
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * Streams a lesson from /api/lesson: onUpdate fires with the lesson so far every time a new
 * step arrives (so the board can start on step 1), and once more with final=true at the end.
 */
async function streamLessonRequest(body: LessonRequest, onUpdate: (lesson: Lesson, final: boolean) => void): Promise<Lesson> {
  const res = await fetch("/api/lesson", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  let lesson: Lesson = { id: `${body.mode}-${Date.now().toString(36)}`, kind: body.mode, title: "Explanation", summary: "", steps: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let failure: string | null = null;
  let headingAdded = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line);
    if (e.type === "meta") lesson = { ...lesson, id: e.id, kind: e.kind, title: e.title };
    else if (e.type === "step") {
      let step: Step = e.step;
      if (!lesson.steps.length && step.type !== "heading") {
        // Always open with the topic name on the board.
        lesson = { ...lesson, steps: [{ type: "heading", text: lesson.title, say: "" }] };
        headingAdded = true;
      }
      // Keep "circle back" targets pointing at the right step after the added heading.
      if (headingAdded && step.type === "highlight" && step.target !== undefined) step = { ...step, target: step.target + 1 };
      lesson = { ...lesson, steps: [...lesson.steps, step] };
      onUpdate(lesson, false);
    } else if (e.type === "done") lesson = { ...lesson, title: e.title || lesson.title, summary: e.summary ?? "", notes: e.notes };
    else if (e.type === "error") failure = e.error;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  handle(buf);
  // A lesson that stopped halfway is reported (the steps already shown stay on the board).
  if (failure || !lesson.steps.length) throw new Error(failure ?? "Gemini returned an empty lesson. Try again.");
  onUpdate(lesson, true);
  return lesson;
}

export default function Workspace() {
  const [view, setView] = useState<"landing" | "workspace">("landing");
  // Who is learning. The workspace only renders on the client, so localStorage is safe here.
  const [profileId, setProfileIdState] = useState(() => (typeof window === "undefined" ? "prem" : getProfileId()));
  const [file, setFile] = useState<File | null>(null);
  const [yt, setYt] = useState<YtSource | null>(null);
  const [gh, setGh] = useState<RepoSource | null>(null);
  // Folder trees on the board are drawn from the real file list of the open repo.
  useEffect(() => {
    setRepoTree(gh?.tree ?? null);
  }, [gh]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const bookTitle = file?.name.replace(/\.pdf$/i, "") ?? yt?.title ?? (gh ? `${gh.owner}/${gh.repo}` : "");

  const [context, setContext] = useState<BookContext | null>(null);
  const [mode, setMode] = useState<ComposerMode>("lesson");
  const [main, setMain] = useState<Lesson | null>(null);
  const [doubt, setDoubt] = useState<{ lesson: Lesson; question: string } | null>(null);
  const [doubtFinished, setDoubtFinished] = useState(false);
  const [loading, setLoading] = useState<null | "lesson" | "doubt">(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [doubtPaused, setDoubtPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [memory, setMemory] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [mainDone, setMainDone] = useState(false);
  // Steps still arriving from Gemini (the board waits at the end instead of finishing).
  const [mainStreaming, setMainStreaming] = useState(false);
  const [doubtStreaming, setDoubtStreaming] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [micSignal, setMicSignal] = useState(0);
  const [showPdf, setShowPdf] = useState(true);
  const [split, setSplit] = useState(46);
  const [fullscreen, setFullscreen] = useState(false);
  const [boardFull, setBoardFull] = useState(false);
  const [boardMax, setBoardMax] = useState(false); // fallback: board fills the window
  const boardSectionRef = useRef<HTMLElement>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  // Chosen teacher voice (saved in the browser). The workspace only renders on the client.
  const [voiceName, setVoiceName] = useState(() => (typeof window === "undefined" ? "Sulafat" : getVoice()));
  const [notebook, setNotebook] = useState<Lesson[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [link, setLink] = useState<Anchor | null>(null);
  // What the current lesson was about, and what comes next in the book/course sequence.
  const [lessonCtx, setLessonCtx] = useState<BookContext | null>(null);
  const [nextTopic, setNextTopic] = useState<NextTopic | null>(null);
  const registerNext = useCallback((n: NextTopic | null) => setNextTopic(n), []);
  const boardAreaRef = useRef<HTMLDivElement>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const mainApi = useRef<BoardApi>(null);
  const doubtApi = useRef<BoardApi>(null);
  const interruptedRef = useRef(false);

  // When the board reaches a "video moment", show that frame in the player.
  const mainRef = useRef<Lesson | null>(null);
  useEffect(() => {
    mainRef.current = main;
  }, [main]);
  const onMainStep = useCallback((i: number) => {
    setStepIndex(i);
    const st = mainRef.current?.steps[i];
    if (st?.type === "clip" && st.start !== undefined) videoMoment(st.start, st.end ?? st.start + 20, false);
  }, []);
  // Playing a clip from the board pauses the teacher so they don't talk over the video.
  useEffect(() => {
    const onClip = (e: Event) => {
      const d = (e as CustomEvent<{ play?: boolean; auto?: boolean }>).detail;
      if (d.play && !d.auto) setPaused(true); // learner pressed ▶ on a clip: let them watch
    };
    // Watching a referenced video inline pauses the lesson too.
    const onWatch = () => setPaused(true);
    window.addEventListener("samjhado:clip", onClip);
    window.addEventListener("samjhado:watch", onWatch);
    return () => {
      window.removeEventListener("samjhado:clip", onClip);
      window.removeEventListener("samjhado:watch", onWatch);
    };
  }, []);

  /* ---------------- lessons ---------------- */
  const startLesson = useCallback(
    async (ctx: BookContext, instruction: string) => {
      setLoading("lesson");
      setError(null);
      setDoubt(null);
      setPaused(true);
      try {
        // Courses remember more history so a later class can recall earlier ones.
        let started = false;
        const lesson = await streamLessonRequest(
          { mode: "lesson", bookTitle, context: ctx, instruction, memory: memory.slice(ctx.video || ctx.repo ? -12 : -8), learner: learnerFor(profileId) },
          (l, final) => {
            setMain(l);
            setMainStreaming(!final);
            if (!started) {
              // First step is here: start teaching while the rest streams in.
              started = true;
              setLessonCtx(ctx);
              setMainDone(false);
              setStepIndex(0);
              setPaused(false);
              setMode("doubt");
              setLoading(null);
            }
          },
        );
        if (lesson.summary) {
          const entry = ctx.video ? `${ctx.label} (${ctx.video.title}): ${lesson.summary}` : ctx.repo ? `${ctx.label}: ${lesson.summary}` : lesson.summary;
          setMemory((m) => [...m.filter((x) => x !== entry), entry].slice(ctx.video || ctx.repo ? -60 : -8));
        }
        if (ctx.video) {
          const key = `${ctx.video.id}:${ctx.video.phase - 1}`;
          setDone((d) => new Set(d).add(key));
        }
        if (ctx.repo) {
          const key = repoTopicKey(ctx.repo);
          setDone((d) => new Set(d).add(key));
        }
        if (lesson.notes) setNotebook((n) => [...n, lesson]);
      } catch (e) {
        setError(friendlyError(e));
        setPaused(false);
      } finally {
        setLoading(null);
        setMainStreaming(false);
        interruptedRef.current = false;
      }
    },
    [bookTitle, memory, profileId],
  );

  const askDoubt = useCallback(
    async (question: string) => {
      if (!main || !context) return;
      const snap = mainApi.current?.snapshot();
      setPaused(true);
      setLoading("doubt");
      setError(null);
      try {
        let started = false;
        const lesson = await streamLessonRequest(
          {
            mode: "doubt",
            bookTitle,
            context,
            instruction: question,
            memory,
            mainLesson: { title: main.title, boardSoFar: snap?.boardSoFar ?? [], currentSay: snap?.currentSay ?? "" },
            learner: learnerFor(profileId),
          },
          (l, final) => {
            setDoubt({ lesson: l, question });
            setDoubtStreaming(!final);
            if (!started) {
              started = true;
              setDoubtFinished(false);
              setDoubtPaused(false);
              setLoading(null);
            }
          },
        );
        if (lesson.notes) setNotebook((n) => [...n, lesson]);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setLoading(null);
        setDoubtStreaming(false);
      }
    },
    [main, context, bookTitle, memory, profileId],
  );

  const closeDoubt = useCallback(() => {
    setDoubt(null);
    setDoubtFinished(false);
    setPaused(false);
    interruptedRef.current = false;
  }, []);

  // The book-to-board arrow fades shortly after the lesson lands.
  useEffect(() => {
    if (!link || loading) return;
    const t = setTimeout(() => setLink(null), 1400);
    return () => clearTimeout(t);
  }, [link, loading]);

  // After a doubt is cleared, glide back to the main topic.
  useEffect(() => {
    if (!doubtFinished) return;
    const t = setTimeout(closeDoubt, 2600);
    return () => clearTimeout(t);
  }, [doubtFinished, closeDoubt]);

  /* ---------------- book events ---------------- */
  const onExplain = useCallback(
    (ctx: BookContext, how: ExplainHow, anchor?: Anchor) => {
      setContext(ctx);
      setMode("lesson");
      setError(null);
      if (how === "select") return;
      if (how === "explain") {
        setLink(anchor ?? null);
        startLesson(ctx, "");
      }
      else if (how === "type") setFocusSignal((n) => n + 1);
      else setMicSignal((n) => n + 1);
    },
    [startLesson],
  );

  const onSubmit = (text: string) => {
    if (mode === "doubt" && main) {
      if (doubt) setDoubt(null);
      askDoubt(text);
    } else if (context) startLesson(context, text);
  };

  const onInterrupt = () => {
    if (doubt) {
      setDoubtPaused(true);
      return;
    }
    if (main && !mainDone && !paused) {
      interruptedRef.current = true;
      setPaused(true);
    }
  };
  const onCancel = () => {
    if (interruptedRef.current && !loading) {
      interruptedRef.current = false;
      setPaused(false);
    }
  };

  /* ---------------- fullscreen + keys ---------------- */
  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
      setBoardFull(!!document.fullscreenElement && document.fullscreenElement === boardSectionRef.current);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };
  // Only the teaching board (toolbar + board + doubt box) fills the screen.
  const toggleBoardFullscreen = useCallback(() => {
    if (boardMax) return setBoardMax(false);
    if (document.fullscreenElement) return void document.exitFullscreen();
    // Real full screen; if the browser refuses, fill the whole window instead.
    const el = boardSectionRef.current;
    if (!el?.requestFullscreen) return setBoardMax(true);
    el.requestFullscreen().catch(() => setBoardMax(true));
  }, [boardMax]);

  const togglePlay = useCallback(() => {
    if (doubt) setDoubtPaused((v) => !v);
    else if (main) {
      if (mainDone) {
        mainApi.current?.replay();
        setMainDone(false);
        setPaused(false);
      } else setPaused((v) => !v);
    }
  }, [doubt, main, mainDone]);

  useEffect(() => {
    if (view !== "workspace") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable]")) return;
      const api = doubt ? doubtApi.current : mainApi.current;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") api?.next();
      else if (e.key === "ArrowLeft") api?.prev();
      else if (e.key === "/") {
        e.preventDefault();
        setFocusSignal((n) => n + 1);
      } else if (e.key === "Escape" && boardMax) setBoardMax(false);
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
      else if (e.key.toLowerCase() === "b") toggleBoardFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, doubt, togglePlay, boardMax, toggleBoardFullscreen]);

  /* ---------------- split drag ---------------- */
  const onDragStart = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const root = rootRef.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => setSplit(Math.min(70, Math.max(25, ((ev.clientX - root.left) / root.width) * 100)));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  // Persist course progress whenever it changes.
  useEffect(() => {
    if (yt) saveYtProgress(yt.id, memory, [...done]);
    else if (gh) saveYtProgress(`gh:${gh.owner}/${gh.repo}`, memory, [...done]);
  }, [yt, gh, memory, done]);

  // Switch learner: everything personal (progress, memory, notes, voice) follows the person.
  const switchProfile = (id: string) => {
    if (id === profileId) return;
    setProfileId(id);
    setProfileIdState(id);
    setVoiceName(getVoice());
    setNotebook([]);
    setMain(null);
    setDoubt(null);
    setLessonCtx(null);
    if (yt) {
      const saved = loadYtProgress(yt.id);
      setMemory(saved.memory);
      setDone(new Set(saved.done));
    } else if (gh) {
      const saved = loadYtProgress(`gh:${gh.owner}/${gh.repo}`);
      setMemory(saved.memory);
      setDone(new Set(saved.done));
    } else {
      setMemory([]);
      setDone(new Set());
    }
  };

  const pickRepo = (src: RepoSource) => {
    const saved = loadYtProgress(`gh:${src.owner}/${src.repo}`);
    setLessonCtx(null);
    setGh(src);
    setYt(null);
    setFile(null);
    setMemory(saved.memory);
    setDone(new Set(saved.done));
    setView("workspace");
    setContext(null);
    setMain(null);
    setDoubt(null);
    setNotebook([]);
    setMode("lesson");
    setShowPdf(true);
  };

  const pickYoutube = (src: YtSource) => {
    const saved = loadYtProgress(src.id);
    setLessonCtx(null);
    setYt(src);
    setGh(null);
    setFile(null);
    setMemory(saved.memory);
    setDone(new Set(saved.done));
    setView("workspace");
    setContext(null);
    setMain(null);
    setDoubt(null);
    setNotebook([]);
    setMode("lesson");
    setShowPdf(true);
  };

  const pickFile = (f: File) => {
    setYt(null);
    setGh(null);
    setLessonCtx(null);
    setFile(f);
    setView("workspace");
    setContext(null);
    setMain(null);
    setDoubt(null);
    setMode("lesson");
    setShowPdf(true);
  };

  if (view === "landing") {
    return (
      <Landing
        onFile={pickFile}
        onYoutube={pickYoutube}
        onRepo={pickRepo}
        profileId={profileId}
        onProfile={switchProfile}
        onDemo={() => {
          setView("workspace");
          setMain(DEMO_LESSON);
          setNotebook([DEMO_LESSON]);
          setMainDone(false);
          setPaused(false);
          setContext({ kind: "selection", label: "Demo", text: "A single artificial neuron: weighted sum, bias and sigmoid activation.", page: 1 });
          setMode("doubt");
        }}
      />
    );
  }

  const activeLesson = doubt?.lesson ?? main;
  const isPaused = doubt ? doubtPaused : paused;

  return (
    <div ref={rootRef} className="app-bg flex h-dvh flex-col overflow-hidden text-white">
      {link ? <BookLink from={link} target={boardAreaRef} /> : null}
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-3">
        <button onClick={() => setView("landing")} className="press flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.05]">
          <ArrowLeft className="size-4 text-white/40" />
          <Logo small />
        </button>
        <div className="h-5 w-px bg-white/10" />
        <p className="min-w-0 truncate text-sm text-white/60">{bookTitle || "Demo lesson"}</p>
        <div className="flex-1" />
        <ProfilePicker value={profileId} onChange={switchProfile} compact />
        {memory.length ? (
          <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/45 md:inline" title={memory.join("\n")}>
            Memory · {memory.length} topic{memory.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <IconBtn label={showPdf ? "Hide book (focus mode)" : "Show book"} onClick={() => setShowPdf((v) => !v)}>
          {showPdf ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </IconBtn>
        <IconBtn label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconBtn>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* book */}
        {showPdf ? (
          <>
            <section style={{ width: `${split}%` }} className="min-w-0 shrink-0">
              {file ? (
                <PdfPane file={file} onExplain={onExplain} activeLabel={context?.label} active={lessonCtx} registerNext={registerNext} />
              ) : gh ? (
                <RepoPane
                  source={gh}
                  onExplain={onExplain}
                  done={done}
                  registerNext={registerNext}
                  activeKey={context?.repo ? repoTopicKey(context.repo) : undefined}
                />
              ) : yt ? (
                <VideoPane
                  source={yt}
                  onExplain={onExplain}
                  done={done}
                  registerNext={registerNext}
                  activeKey={context?.video ? `${context.video.id}:${context.video.phase - 1}` : undefined}
                />
              ) : (
                <UploadPane onFile={pickFile} />
              )}
            </section>
            <div
              onPointerDown={onDragStart}
              className="group relative w-1.5 shrink-0 cursor-col-resize bg-white/[0.03] hover:bg-[var(--accent)]/40"
              aria-label="Resize panels"
              role="separator"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
            </div>
          </>
        ) : null}

        {/* board */}
        <section
          ref={boardSectionRef}
          className={`flex min-w-0 flex-1 flex-col bg-[var(--ink)] ${boardMax ? "fixed inset-0 z-[100]" : "relative"}`}
        >
          {/* board toolbar */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeLesson?.id ?? "none"}
                initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="flex min-w-0 items-center gap-2"
              >
                {doubt ? (
                  <span className="rounded-full bg-[var(--violet)] px-2 py-0.5 text-[11px] font-semibold text-ink">DOUBT</span>
                ) : main ? (
                  <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-ink">LESSON</span>
                ) : null}
                <span className="truncate text-sm font-medium text-white/85">{activeLesson?.title ?? "Whiteboard"}</span>
              </motion.div>
            </AnimatePresence>
            {main && !doubt ? (
              <span className="shrink-0 text-xs tabular-nums text-white/35">
                {Math.min(stepIndex + 1, main.steps.length)}/{main.steps.length}
              </span>
            ) : null}
            <div className="flex-1" />
            <IconBtn label={voiceOn ? "Mute teacher voice" : "Turn on teacher voice"} active={voiceOn} onClick={() => setVoiceOn((v) => !v)}>
              {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </IconBtn>
            {voiceOn ? (
              <select
                value={voiceName}
                onChange={(e) => {
                  setVoice(e.target.value);
                  setVoiceName(e.target.value);
                }}
                title="Teacher ki awaaz"
                aria-label="Teacher voice"
                className="h-8 max-w-[150px] cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 outline-none hover:bg-white/[0.08] focus:border-[var(--accent)]/50"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#14171a]">
                    {v.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              onClick={() => setShowNotes((v) => !v)}
              className={`press relative flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ${
                showNotes ? "bg-[#efe8d6] text-[#2b2a26]" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
              }`}
              title="Notebook notes"
            >
              <NotebookPen className="size-4" /> Notes
              {notebook.length ? (
                <span className="grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-ink">{notebook.length}</span>
              ) : null}
            </button>
            <IconBtn label={boardFull || boardMax ? "Board full screen band karo (B / Esc)" : "Sirf board full screen (B)"} active={boardFull || boardMax} onClick={toggleBoardFullscreen}>
              {boardFull || boardMax ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
            </IconBtn>
            <div className="mx-1 h-5 w-px bg-white/10" />
            {activeLesson ? (
              <div className="flex items-center gap-0.5">
                <IconBtn label="Previous step (←)" onClick={() => (doubt ? doubtApi : mainApi).current?.prev()}>
                  <SkipBack className="size-4" />
                </IconBtn>
                <button
                  onClick={togglePlay}
                  aria-label={isPaused ? "Play (Space)" : "Pause (Space)"}
                  title={isPaused ? "Play (Space)" : "Pause (Space)"}
                  className="press grid size-9 place-items-center rounded-full bg-white text-ink"
                >
                  {!doubt && mainDone ? (
                    <RotateCcw className="size-4" />
                  ) : isPaused ? (
                    <Play className="size-4 translate-x-px fill-current" />
                  ) : (
                    <Pause className="size-4 fill-current" />
                  )}
                </button>
                <IconBtn label="Next step (→)" onClick={() => (doubt ? doubtApi : mainApi).current?.next()}>
                  <SkipForward className="size-4" />
                </IconBtn>
                <button
                  onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}
                  className="press ml-1 h-8 w-12 rounded-lg text-xs font-semibold tabular-nums text-white/60 hover:bg-white/[0.07] hover:text-white"
                  title="Speed"
                >
                  {rate}×
                </button>
              </div>
            ) : null}
          </div>

          <div ref={boardAreaRef} className="relative min-h-0 flex-1">
            {main ? (
              <Board
                key={main.id}
                lesson={main}
                paused={paused || !!doubt || loading !== null}
                rate={rate}
                voiceOn={voiceOn}
                voiceName={voiceName}
                streaming={mainStreaming}
                apiRef={mainApi}
                onStep={onMainStep}
                onFinish={() => setMainDone(true)}
              />
            ) : (
              <EmptyBoard hasBook={!!file} video={!!yt} />
            )}

            {/* next topic in sequence, offered when the lesson finishes */}
            <AnimatePresence>
              {main && mainDone && !doubt && !loading && nextTopic ? (
                <motion.div
                  key="next-topic"
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute inset-x-0 bottom-28 z-[35] flex justify-center px-6"
                >
                  <button
                    onClick={() => nextTopic.run()}
                    className="press group flex max-w-full items-center gap-3 rounded-2xl bg-[var(--accent)] py-3 pl-5 pr-4 text-ink shadow-[0_18px_50px_-14px_var(--accent)]"
                  >
                    <span className="flex min-w-0 flex-col items-start text-left">
                      <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">Agla topic</span>
                      <span className="max-w-[min(520px,70vw)] truncate text-sm font-semibold">{nextTopic.label}</span>
                    </span>
                    <ArrowRight className="size-5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* doubt layer: slides over the paused lesson */}
            <AnimatePresence>
              {doubt ? (
                <motion.div
                  key={doubt.lesson.id}
                  initial={{ opacity: 0, y: 24, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.99, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
                  transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-3 z-40 overflow-hidden rounded-3xl border border-[var(--violet)]/35 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
                >
                  <div className="flex h-11 items-center gap-2 border-b border-white/[0.06] bg-[#120f1d] px-4">
                    <span className="size-2 rounded-full bg-[var(--violet)]" />
                    <p className="min-w-0 flex-1 truncate text-sm text-white/75">
                      <span className="text-white/40">Tumhara doubt:</span> {doubt.question}
                    </p>
                    <button
                      onClick={closeDoubt}
                      className="press flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white hover:bg-white/[0.14]"
                    >
                      <ArrowLeft className="size-3.5" /> Back to lesson
                    </button>
                  </div>
                  <div className="h-[calc(100%-2.75rem)]">
                    <Board
                      lesson={doubt.lesson}
                      paused={doubtPaused}
                      rate={rate}
                      voiceOn={voiceOn}
                      voiceName={voiceName}
                      streaming={doubtStreaming}
                      accent="violet"
                      apiRef={doubtApi}
                      onFinish={() => setDoubtFinished(true)}
                    />
                  </div>
                  <AnimatePresence>
                    {doubtFinished ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-sm"
                      >
                        <div className="flex flex-col items-center gap-3 text-center">
                          <p className="font-hand text-4xl text-chalk">Doubt clear! ✓</p>
                          <p className="text-sm text-white/60">Wapas main topic pe chalte hain…</p>
                          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                            <div className="return-bar h-full bg-[var(--accent)]" />
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {showNotes ? <NotesPanel book={bookTitle || "Demo"} entries={notebook} onClose={() => setShowNotes(false)} /> : null}
            </AnimatePresence>

            {/* loading */}
            <AnimatePresence>
              {loading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 z-50 grid place-items-center bg-[#0a0c0b]/75 backdrop-blur-[3px]"
                >
                  <Thinking
                    label={
                      loading === "doubt"
                        ? "Doubt samajh raha hoon…"
                        : context?.video
                          ? "Video dhyan se dekh raha hoon… (1-2 min, poori class cover hogi)"
                          : "Board pe lesson taiyaar ho raha hai…"
                    }
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* error */}
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mx-3 mb-2 flex items-start gap-3 rounded-xl border border-[var(--chalk-pink)]/30 bg-[var(--chalk-pink)]/10 px-3 py-2 text-sm text-[var(--chalk-pink)]"
              >
                <p className="min-w-0 flex-1">{error}</p>
                <button onClick={() => setError(null)} className="text-xs underline underline-offset-2">
                  Dismiss
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="shrink-0 px-3 pb-3">
            <Composer
              context={context}
              onClearContext={() => {
                setContext(null);
                if (main) setMode("doubt");
              }}
              mode={mode}
              canDoubt={!!main}
              canLesson={!!context}
              onModeChange={setMode}
              doubtTopic={main?.title}
              busy={loading !== null}
              onSubmit={onSubmit}
              onInterrupt={onInterrupt}
              onCancel={onCancel}
              focusSignal={focusSignal}
              micSignal={micSignal}
            />
            <p className="mt-1.5 hidden px-2 text-[11px] text-white/30 lg:block">
              Space pause · ←/→ steps · / type · B board full screen · F full screen · lesson ke beech kabhi bhi type ya bolkar doubt pucho
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="120" height="60" viewBox="0 0 120 60" className="overflow-visible">
        <path className="scribble" d="M6 40 C 20 8, 34 52, 48 26 S 76 6, 84 34 S 108 50, 114 18" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <p className="font-hand text-2xl text-chalk">{label}</p>
      <p className="text-xs tabular-nums text-white/40">
        {secs}s{secs >= 15 ? " · Gemini thoda time le raha hai, bas aa raha hai…" : ""}
      </p>
    </div>
  );
}

function EmptyBoard({ hasBook, video }: { hasBook: boolean; video?: boolean }) {
  const steps = video
    ? ["Left side \"Shuru karo\" dabao ya kisi class ka phase chuno", "Teacher us part ko board pe Hinglish mein samjhayega", "Beech mein doubt pucho, phir \"Agla phase\""]
    : hasBook
    ? ["Book mein koi bhi text select karo", "Ya page pe “Is page ko samjhao” dabao", "Explain dabao, ya type/bolkar batao kya chahiye"]
    : ["Left side PDF upload karo", "Text select karo ya poora page chuno", "Board pe Hinglish mein samjho"];
  return (
    <div className="board-surface grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        <p className="font-hand text-5xl text-chalk chalk-glow">Board ready hai!</p>
        <p className="mt-2 text-sm text-white/45">Teacher tab tak wait karega jab tak tum kuch choose nahi karte.</p>
        <ol className="mt-8 space-y-3 text-left">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-ink">{i + 1}</span>
              <span className="font-hand text-[1.35rem] text-chalk">{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function UploadPane({ onFile }: { onFile: (f: File) => void }) {
  return (
    <label className="board-surface flex h-full cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center">
      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.06]">
        <Upload className="size-6 text-[var(--accent)]" />
      </span>
      <p className="font-hand text-3xl text-chalk">Apni book yahan daalo</p>
      <p className="text-sm text-white/45">PDF upload karo aur kisi bhi part ko samjho</p>
    </label>
  );
}

/** Arrow that stretches from the highlighted text in the book to the whiteboard. */
function BookLink({ from, target }: { from: Anchor; target: React.RefObject<HTMLDivElement | null> }) {
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const r = target.current?.getBoundingClientRect();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring layout once after mount
    if (r) setTo({ x: r.left + 56, y: r.top + 70 });
  }, [target]);
  if (!to) return null;
  const dx = Math.max(60, (to.x - from.x) * 0.5);
  const d = `M${from.x},${from.y} C${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
  return (
    <motion.svg
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    >
      <defs>
        <marker id="link-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      <path d={d} className="link-path" pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#link-head)" />
      <circle cx={from.x} cy={from.y} r="5" fill="var(--accent)" />
      <foreignObject x="0" y="0" width="100%" height="100%">
        <div className="link-dot absolute size-2.5 rounded-full bg-white shadow-[0_0_12px_var(--accent)]" style={{ offsetPath: `path("${d}")`, left: -5, top: -5 }} />
      </foreignObject>
    </motion.svg>
  );
}
