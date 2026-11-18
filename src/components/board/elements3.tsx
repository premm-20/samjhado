"use client";
// Board renderers for YouTube-class content: code, dataset tables, and video moments.
import { Play, Table2, TerminalSquare } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { fmtTime } from "@/lib/youtube";
import { useBoard } from "./context";
import type { ElProps } from "./elements";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Ask the video pane to show (seek) or play a moment of the current video.
 * auto = played by the lesson itself (the lesson keeps running); otherwise the learner pressed ▶.
 */
export function videoMoment(start: number, end: number, play: boolean, auto = false) {
  window.dispatchEvent(new CustomEvent("samjhado:clip", { detail: { start, end, play, auto } }));
}

/** Pause / resume / stop a clip that the lesson is playing. */
export function videoAction(action: "pause" | "resume" | "stop") {
  window.dispatchEvent(new CustomEvent("samjhado:clip", { detail: { action } }));
}

/* Code: a dark editor card, typed character by character. */
export function Code({ step, p, active }: ElProps) {
  const code = step.code ?? "";
  const n = Math.round(code.length * clamp01(p));
  const caret = useRef<HTMLSpanElement>(null);
  const { moveTo } = useBoard();
  useLayoutEffect(() => {
    if (!active || p <= 0 || p >= 1 || !caret.current) return;
    const r = caret.current.getBoundingClientRect();
    moveTo(r.left + 2, r.bottom - 4);
  }, [active, n, p, moveTo]);
  const shown = code.slice(0, n);
  return (
    <div data-ink className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-[0_10px_40px_-18px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.03] px-4 py-2">
        <TerminalSquare className="size-4 text-chalk-cyan" />
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">{step.language || "code"}</span>
        {step.text ? <span className="truncate text-xs text-white/40">· {step.text}</span> : null}
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13.5px] leading-6 text-[#e6edf3]">
        <code>
          {highlight(shown)}
          <span ref={caret} className={active && p < 1 ? "code-caret" : ""} />
          <span className="invisible">{code.slice(n)}</span>
        </code>
      </pre>
    </div>
  );
}

/** Tiny highlighter: comments, strings, numbers, keywords. Enough to read code at a glance. */
function highlight(src: string) {
  const out: React.ReactNode[] = [];
  const re = /(#[^\n]*|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\b\d+(?:\.\d+)?\b|\b(?:import|from|as|def|return|for|in|if|else|elif|while|class|with|try|except|True|False|None|and|or|not|lambda|print|SELECT|FROM|WHERE|INSERT|INTO|VALUES|CREATE|TABLE)\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const t = m[0];
    const color = /^(#|\/\/)/.test(t) ? "#8b949e" : /^["']/.test(t) ? "#a5d6ff" : /^\d/.test(t) ? "#79c0ff" : "#ff7b72";
    out.push(
      <span key={k++} style={{ color }}>
        {t}
      </span>,
    );
    last = m.index + t.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

/* Table: a dataset sample, revealed row by row. */
export function Table({ step, p, active }: ElProps) {
  const cols = step.columns ?? [];
  const rows = step.rows ?? [];
  const total = rows.length + 1;
  const shown = Math.floor(clamp01(p / 0.95) * total);
  const ref = useRef<HTMLTableElement>(null);
  const { moveTo } = useBoard();
  useLayoutEffect(() => {
    if (!active || p >= 1 || !ref.current) return;
    const tr = ref.current.querySelectorAll("tr")[Math.max(0, shown - 1)];
    if (!tr) return;
    const r = tr.getBoundingClientRect();
    moveTo(r.right - 8, r.bottom - 6);
  }, [active, shown, p, moveTo]);
  return (
    <div data-ink className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2">
        <Table2 className="size-4 text-chalk-yellow" />
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Dataset</span>
        {step.text ? <span className="truncate text-xs text-white/45">· {step.text}</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table ref={ref} className="w-full border-collapse text-left text-[13px]">
          {cols.length ? (
            <thead>
              <tr style={{ opacity: shown >= 1 ? 1 : 0, transition: "opacity 200ms ease-out" }}>
                {cols.map((c, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-white/10 bg-chalk-yellow/[0.07] px-3 py-2 font-semibold text-chalk-yellow">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="even:bg-white/[0.02]" style={{ opacity: shown >= ri + 2 ? 1 : 0, transition: "opacity 200ms ease-out" }}>
                {r.map((c, ci) => (
                  <td key={ci} className="whitespace-nowrap border-b border-white/[0.05] px-3 py-1.5 font-mono text-[12.5px] text-white/85">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Clip: a moment in the YouTube video; the player jumps there, and it can be played. */
export function Clip({ step, p }: ElProps) {
  const start = step.start ?? 0;
  const end = step.end ?? start + 20;
  return (
    <div
      data-ink
      className="flex items-center gap-4 rounded-2xl border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.06] px-4 py-3"
      style={{ opacity: p > 0 ? 1 : 0, transform: `translateY(${p > 0 ? 0 : 6}px)`, transition: "opacity 300ms ease-out, transform 300ms cubic-bezier(0.23,1,0.32,1)" }}
    >
      <button
        onClick={() => videoMoment(start, end, true)}
        className="press grid size-11 shrink-0 place-items-center rounded-full bg-[#ff3d3d] text-white shadow-[0_8px_24px_-8px_#ff3d3d]"
        title="Video mein ye part chalao"
      >
        <Play className="size-5 translate-x-px fill-current" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#ff8a8a]">
          Video mein dekho · {fmtTime(start)}–{fmtTime(end)}
        </p>
        <p className="mt-0.5 font-hand text-[1.45rem] leading-snug text-chalk">{step.text || "Is part ko video mein dekho"}</p>
      </div>
    </div>
  );
}
