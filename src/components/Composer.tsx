"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, BookMarked, HelpCircle, Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSpeech } from "@/lib/useSpeech";
import type { BookContext } from "@/lib/types";

export type ComposerMode = "lesson" | "doubt";

interface Props {
  context: BookContext | null;
  onClearContext: () => void;
  mode: ComposerMode;
  canDoubt: boolean;
  canLesson: boolean;
  onModeChange: (m: ComposerMode) => void;
  doubtTopic?: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  /** Learner started typing or talking: pause the board so they can interrupt. */
  onInterrupt: () => void;
  onCancel: () => void;
  focusSignal: number;
  micSignal: number;
}

export function Composer(p: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef(p.onSubmit);
  useLayoutEffect(() => {
    submitRef.current = p.onSubmit;
  });

  const speech = useSpeech((t) => {
    // Voice goes straight in, like talking to a teacher.
    setText("");
    submitRef.current(t);
  });

  useEffect(() => {
    if (p.focusSignal) inputRef.current?.focus();
  }, [p.focusSignal]);

  useEffect(() => {
    if (p.micSignal && speech.supported) {
      p.onInterrupt();
      speech.start();
    } else if (p.micSignal) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.micSignal]);

  const send = () => {
    if (p.busy) return;
    if (!p.context && p.mode === "lesson") return;
    p.onSubmit(text.trim());
    setText("");
  };

  const placeholder =
    p.mode === "doubt"
      ? "Doubt pucho… e.g. “bias kyun add karte hain?”"
      : p.context
        ? "Kuch specific? e.g. “example ke saath samjhao” — ya seedha Explain dabao"
        : "Book mein kuch select karo, ya page pe “Samjhao” dabao";

  const ready = p.mode === "doubt" ? !!text.trim() : !!p.context;

  return (
    <div className="composer-glass relative rounded-[22px] p-2">
      {/* context row */}
      <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-2 pt-1">
        {p.canDoubt || p.canLesson ? (
          <div className="flex rounded-full bg-white/[0.06] p-0.5 text-xs">
            <ModeTab on={p.mode === "lesson"} disabled={!p.canLesson} onClick={() => p.onModeChange("lesson")}>
              <BookMarked className="size-3.5" /> New lesson
            </ModeTab>
            <ModeTab on={p.mode === "doubt"} disabled={!p.canDoubt} onClick={() => p.onModeChange("doubt")}>
              <HelpCircle className="size-3.5" /> Doubt
            </ModeTab>
          </div>
        ) : null}
        <AnimatePresence mode="popLayout">
          {p.mode === "doubt" && p.doubtTopic ? (
            <motion.span
              key="doubt"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="truncate rounded-full border border-[var(--violet)]/40 bg-[var(--violet)]/10 px-2.5 py-1 text-xs text-[var(--violet)]"
            >
              Doubt about · {p.doubtTopic}
            </motion.span>
          ) : p.context ? (
            <motion.span
              key={p.context.label + p.context.text.length}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 py-1 pl-2.5 pr-1 text-xs text-[var(--accent)]"
            >
              <span className="truncate">
                {p.context.label}
                {p.context.kind === "selection" ? ` · “${p.context.text.slice(0, 40)}${p.context.text.length > 40 ? "…" : ""}”` : ""}
              </span>
              <button onClick={p.onClearContext} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Clear selection">
                <X className="size-3" />
              </button>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={inputRef}
            rows={1}
            value={speech.listening ? speech.interim : text}
            onChange={(e) => setText(e.target.value)}
            onFocus={p.onInterrupt}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              } else if (e.key === "Escape") {
                setText("");
                inputRef.current?.blur();
                p.onCancel();
              }
            }}
            placeholder={speech.listening ? "Sun raha hoon… bolo" : placeholder}
            className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
        </div>

        {speech.supported ? (
          <button
            onClick={() => {
              if (speech.listening) speech.stop();
              else {
                p.onInterrupt();
                speech.start();
              }
            }}
            className={`press relative grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
              speech.listening ? "bg-[var(--chalk-pink)] text-ink" : "bg-white/[0.08] text-white hover:bg-white/[0.14]"
            }`}
            aria-label={speech.listening ? "Stop listening" : "Speak"}
            title={speech.listening ? "Stop" : "Bolo (voice)"}
          >
            {speech.listening ? <span className="mic-ring absolute inset-0 rounded-full" /> : null}
            {speech.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-[18px]" />}
          </button>
        ) : null}

        <button
          onClick={send}
          disabled={!ready || p.busy}
          className="press flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] pl-4 pr-3 text-sm font-semibold text-ink transition-opacity duration-150 disabled:opacity-35"
        >
          {p.busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {p.mode === "doubt" ? "Pucho" : "Explain"}
          {!p.busy ? <ArrowUp className="size-4" /> : null}
        </button>
      </div>
      {speech.error ? <p className="px-3 pt-1 text-xs text-[var(--chalk-pink)]">{speech.error}</p> : null}
    </div>
  );
}

function ModeTab({ on, disabled, onClick, children }: { on: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
        on ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}
