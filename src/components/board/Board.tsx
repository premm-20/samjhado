"use client";
import { motion, useSpring } from "motion/react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { Lesson } from "@/lib/types";
import { VoicePlayer } from "@/lib/voice";
import { BoardContext, type BoardCtx } from "./context";
import { StepView } from "./elements";
import { videoAction, videoMoment } from "./elements3";
import { describeStep, stepDuration } from "./timing";

export interface BoardApi {
  next: () => void;
  prev: () => void;
  replay: () => void;
  snapshot: () => { index: number; boardSoFar: string[]; currentSay: string };
}

interface Props {
  lesson: Lesson;
  paused: boolean;
  rate: number;
  accent?: "lime" | "violet";
  onFinish?: () => void;
  onStep?: (index: number) => void;
  apiRef?: Ref<BoardApi>;
  voiceOn?: boolean;
  /** Changing the teacher voice re-fetches the narration in that voice. */
  voiceName?: string;
  /** More steps are still arriving from Gemini: wait at the end instead of finishing. */
  streaming?: boolean;
}

export function Board({ lesson, paused, rate, accent = "lime", onFinish, onStep, apiRef, voiceOn = true, streaming = false, voiceName }: Props) {
  const steps = lesson.steps;
  const durations = useMemo(() => steps.map(stepDuration), [steps]);

  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const indexRef = useRef(0);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(paused);
  const rateRef = useRef(rate);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const onStepRef = useRef(onStep);
  const voiceOnRef = useRef(voiceOn);
  const stepsRef = useRef(steps);
  const durationsRef = useRef(durations);
  const streamingRef = useRef(streaming);
  useLayoutEffect(() => {
    stepsRef.current = steps;
    durationsRef.current = durations;
    streamingRef.current = streaming;
    pausedRef.current = paused;
    rateRef.current = rate;
    onFinishRef.current = onFinish;
    onStepRef.current = onStep;
    voiceOnRef.current = voiceOn;
  });

  /* ---------------- teacher voice ---------------- */
  const voiceRef = useRef<VoicePlayer | null>(null);
  const startedRef = useRef(-1);
  const waitRef = useRef(0);
  const [waitingVoice, setWaitingVoice] = useState(false);
  const [voiceSource, setVoiceSource] = useState<"gemini" | "browser" | null>(null);
  const [sayProgress, setSayProgress] = useState<number | null>(null);
  useEffect(() => {
    if (!voiceOn) return;
    const v = new VoicePlayer();
    voiceRef.current = v;
    v.update(
      stepsRef.current.map((s) => s.say),
      !streamingRef.current,
    );
    return () => {
      v.dispose();
      voiceRef.current = null;
    };
  }, [lesson.id, voiceOn, voiceName]);
  // New steps (or the end of the stream) may complete another narration chunk.
  useEffect(() => {
    voiceRef.current?.update(
      steps.map((s) => s.say),
      !streaming,
    );
  }, [steps, streaming]);
  useEffect(() => {
    const v = voiceRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.resume();
  }, [paused]);
  // A video moment playing in the player follows the lesson's pause/resume.
  const clipRef = useRef<{ step: number; remaining: number } | null>(null);
  useEffect(() => {
    if (!clipRef.current) return;
    videoAction(paused ? "pause" : "resume");
  }, [paused]);
  useEffect(() => {
    voiceRef.current?.setRate(rate);
  }, [rate]);

  const goTo = useCallback(
    (i: number) => {
      const len = stepsRef.current.length;
      const clamped = Math.max(0, Math.min(len, i));
      indexRef.current = clamped;
      elapsedRef.current = 0;
      startedRef.current = -1;
      waitRef.current = 0;
      voiceRef.current?.stop();
      if (clipRef.current) {
        clipRef.current = null;
        videoAction("stop");
      }
      setIndex(clamped);
      setElapsed(0);
      if (clamped < len) {
        finishedRef.current = false;
        onStepRef.current?.(clamped);
      } else if (!finishedRef.current && !streamingRef.current) {
        // Skipped to the end: finish right away (don't depend on the animation loop running).
        finishedRef.current = true;
        onFinishRef.current?.();
      }
    },
    [],
  );

  // One paused-aware clock drives every element on the board.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    onStepRef.current?.(0);
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const i = indexRef.current;
      const steps = stepsRef.current;
      const durations = durationsRef.current;
      if (!pausedRef.current && i < steps.length) {
        const v = voiceOnRef.current ? voiceRef.current : null;
        const say = steps[i].say;
        if (startedRef.current !== i) {
          // Hold the step briefly until its narration audio arrives.
          if (v && say && v.statusOf(i) === "loading" && waitRef.current < 45000) {
            waitRef.current += dt;
            if (waitRef.current > 250) setWaitingVoice(true);
          } else {
            startedRef.current = i;
            waitRef.current = 0;
            setWaitingVoice(false);
            if (v && say) {
              v.setRate(rateRef.current);
              v.play(i);
              setVoiceSource(v.lastSource());
            }
          }
        }
        if (startedRef.current === i) {
          elapsedRef.current += dt * rateRef.current;
          const d = durations[i];
          const e = elapsedRef.current;
          const voiced = !!v && v.hasPlayed();
          let done = voiced ? e >= d.draw + 400 && !v.isSpeaking() : e >= d.total;
          const st = steps[i];
          if (done && st.type === "clip" && st.start !== undefined) {
            if (!clipRef.current || clipRef.current.step !== i) {
              // Narration finished: now let the learner watch that part of the class.
              const len = Math.max(3, (st.end ?? st.start + 20) - st.start) * 1000;
              clipRef.current = { step: i, remaining: len };
              videoMoment(st.start, st.end ?? st.start + 20, true, true);
            }
            clipRef.current.remaining -= dt; // real time: the video plays at normal speed
            done = clipRef.current.remaining <= 0;
            if (done) clipRef.current = null;
          }
          if (done || e > Math.max(d.total * 3, 40000 + (st.type === "clip" ? 90000 : 0))) {
            indexRef.current = i + 1;
            elapsedRef.current = 0;
            setIndex(i + 1);
            if (i + 1 < steps.length) onStepRef.current?.(i + 1);
          }
          setSayProgress(voiced ? v.progress() : null);
          setElapsed(elapsedRef.current);
        }
      }
      if (indexRef.current >= steps.length && !finishedRef.current && !streamingRef.current) {
        finishedRef.current = true;
        voiceRef.current?.stop();
        onFinishRef.current?.();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lesson.id]);

  useImperativeHandle(
    apiRef,
    () => ({
      next: () => goTo(indexRef.current + 1),
      prev: () => goTo(elapsedRef.current > 1200 ? indexRef.current : indexRef.current - 1),
      replay: () => goTo(0),
      snapshot: () => {
        const i = Math.min(indexRef.current, steps.length - 1);
        return {
          index: i,
          boardSoFar: steps.slice(0, i + 1).map(describeStep).filter(Boolean),
          currentSay: steps[i]?.say ?? "",
        };
      },
    }),
    [goTo, steps],
  );

  /* ---------------- pointer + auto-scroll ---------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const px = useSpring(60, { stiffness: 320, damping: 32, mass: 0.6 });
  const py = useSpring(40, { stiffness: 320, damping: 32, mass: 0.6 });
  const stepEls = useRef(new Map<number, HTMLElement>());
  const lastScroll = useRef(0);

  const ctx = useMemo<BoardCtx>(
    () => ({
      moveTo: (cx, cy) => {
        const c = contentRef.current;
        const s = scrollRef.current;
        if (!c || !s) return;
        const r = c.getBoundingClientRect();
        px.set(cx - r.left);
        py.set(cy - r.top);
        // Keep the pen in view, like a teacher walking down the board.
        const sr = s.getBoundingClientRect();
        const now = performance.now();
        if ((cy > sr.bottom - 120 || cy < sr.top + 40) && now - lastScroll.current > 350) {
          lastScroll.current = now;
          s.scrollTo({ top: s.scrollTop + (cy - sr.top) - sr.height * 0.45, behavior: "smooth" });
        }
      },
      registerEl: (i, el) => {
        if (el) stepEls.current.set(i, el);
        else stepEls.current.delete(i);
      },
      getStepEl: (i) => stepEls.current.get(i) ?? null,
      contentEl: () => contentRef.current,
    }),
    [px, py],
  );

  const caughtUp = index >= steps.length;
  const done = caughtUp && !streaming;
  const cur = Math.min(index, steps.length - 1);
  const d = durations[cur];
  const drawP = done ? 1 : Math.min(1, elapsed / d.draw);
  const sayP = done ? 1 : sayProgress !== null ? sayProgress : Math.min(1, elapsed / (d.total * 0.92));
  const say = steps[cur]?.say ?? "";
  const words = say.split(/\s+/).filter(Boolean);
  const spoken = Math.ceil(words.length * sayP);
  // Narration is long now: caption only the sentence being spoken.
  const sentences = say.split(/(?<=[.!?])\s+/).filter(Boolean);
  let wordStart = 0;
  let sentenceWords = words;
  let sentenceStart = 0;
  for (const s of sentences) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (spoken <= wordStart + n || s === sentences[sentences.length - 1]) {
      sentenceWords = s.split(/\s+/).filter(Boolean);
      sentenceStart = wordStart;
      break;
    }
    wordStart += n;
  }
  const drawing = !done && drawP < 1;

  return (
    <BoardContext.Provider value={ctx}>
      <div className={`board-surface relative flex h-full min-h-0 flex-col ${accent === "violet" ? "board-violet" : ""}`}>
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
          <div ref={contentRef} className="relative mx-auto w-full max-w-[820px] px-8 pb-[45vh] pt-10 sm:px-12">
            {steps.slice(0, Math.min(index + 1, steps.length)).map((s, i) => (
              <StepView key={i} step={s} index={i} p={i < index ? 1 : drawP} active={i === index && !done} />
            ))}
            {done ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-chalk-dim"
              >
                <span className="size-2 rounded-full bg-[var(--accent)]" />
                {lesson.kind === "doubt" ? "Doubt clear!" : "Lesson complete. Select anything else in the book to continue."}
              </motion.div>
            ) : null}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-20"
              style={{ x: px, y: py }}
              animate={{ opacity: done ? 0 : 1, scale: drawing ? 1 : 0.92 }}
              transition={{ duration: 0.2 }}
            >
              <TeacherPointer drawing={drawing} />
            </motion.div>
          </div>
        </div>

        {/* Narration caption */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-5 transition-opacity duration-300 ease-out"
          style={{ opacity: done ? 0 : 1 }}
        >
          <div className="caption-glass pointer-events-auto max-w-[760px] rounded-2xl px-5 py-3.5">
            {waitingVoice && !done ? (
              <p className="mb-1 text-[11px] text-white/40">🔊 Teacher ki awaaz load ho rahi hai…</p>
            ) : voiceOn && voiceSource && !done ? (
              <p className={`mb-1 text-[11px] ${voiceSource === "gemini" ? "text-white/35" : "text-[var(--chalk-pink)]/80"}`}>
                {voiceSource === "gemini"
                  ? `🔊 ${voiceName ?? "Sulafat"} ki awaaz`
                  : "🔊 Browser ki awaaz · Gemini voice ka aaj ka free quota khatam (kal reset hoga)"}
              </p>
            ) : null}
            <p className="text-[15px] leading-relaxed sm:text-base">
              {sentenceWords.map((w, i) => (
                <span key={i} className={sentenceStart + i < spoken ? "text-white" : "text-white/35"} style={{ transition: "color 180ms ease" }}>
                  {w}{" "}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </BoardContext.Provider>
  );
}

function TeacherPointer({ drawing }: { drawing: boolean }) {
  return (
    <div className="relative -translate-x-[3px] -translate-y-[3px]">
      {drawing ? <span className="pointer-ping absolute left-0 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" /> : null}
      <svg width="30" height="30" viewBox="0 0 24 24" className="drop-shadow-[0_4px_14px_rgba(0,0,0,0.6)]">
        <path
          d="M3 2.5 L20 11 L12.5 13 L9.5 20.5 Z"
          fill="var(--accent)"
          stroke="#0b0d0c"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute left-6 top-6 whitespace-nowrap rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-ink shadow-lg">
        SamjhaDo
      </span>
    </div>
  );
}
