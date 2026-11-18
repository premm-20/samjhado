"use client";
import katex from "katex";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Step } from "@/lib/types";
import { useBoard } from "./context";
import { Matrix, Network, Plot, Solve } from "./elements2";
import { Clip, Code, Table } from "./elements3";
import { Live, Tree, VideoRef } from "./elements4";

export interface ElProps {
  step: Step;
  index: number;
  /** 0..1 drawing progress of this step. */
  p: number;
  active: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ------------------------------------------------------------------ */
/* Handwritten text that reveals character by character.               */
/* The unrevealed rest stays in the layout (invisible) so nothing jumps */
/* ------------------------------------------------------------------ */
function Typed({ text, p, active, className }: { text: string; p: number; active: boolean; className?: string }) {
  const caret = useRef<HTMLSpanElement>(null);
  const { moveTo } = useBoard();
  const n = Math.round(text.length * clamp01(p));
  useLayoutEffect(() => {
    if (!active || p <= 0 || p >= 1 || !caret.current) return;
    const r = caret.current.getBoundingClientRect();
    moveTo(r.left, r.bottom - 6);
  }, [active, n, p, moveTo]);
  return (
    <span data-ink className={className}>
      {text.slice(0, n)}
      <span ref={caret} />
      <span className="invisible">{text.slice(n)}</span>
    </span>
  );
}

function Heading({ step, p, active }: ElProps) {
  const text = step.text ?? "";
  const lineP = clamp01((p - 0.72) / 0.28);
  const pathRef = useRef<SVGPathElement>(null);
  const { moveTo } = useBoard();
  useLayoutEffect(() => {
    if (!active || lineP <= 0 || lineP >= 1 || !pathRef.current) return;
    const el = pathRef.current;
    const pt = el.getPointAtLength(el.getTotalLength() * lineP);
    const svg = el.ownerSVGElement!.getBoundingClientRect();
    moveTo(svg.left + (pt.x / 400) * svg.width, svg.top + (pt.y / 16) * svg.height);
  }, [active, lineP, moveTo]);
  return (
    <div className="pt-2">
      <h2 className="font-hand text-[2.6rem] leading-tight text-chalk-yellow chalk-glow">
        <Typed text={text} p={clamp01(p / 0.72)} active={active} />
      </h2>
      <svg viewBox="0 0 400 16" preserveAspectRatio="none" className="mt-1 h-3 w-[min(420px,80%)] overflow-visible">
        <path
          ref={pathRef}
          d="M2 9 C 80 3, 160 13, 240 7 S 360 5, 398 9"
          fill="none"
          stroke="var(--chalk-yellow)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - lineP}
          opacity={0.8}
        />
      </svg>
    </div>
  );
}

function Write({ step, p, active }: ElProps) {
  return (
    <p className="font-hand text-[1.85rem] leading-snug text-chalk chalk-glow">
      <Typed text={step.text ?? ""} p={p} active={active} />
    </p>
  );
}

function Bullets({ step, p, active }: ElProps) {
  const items = step.items ?? [];
  const weights = items.map((i) => 300 + i.length * 30);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const ends = weights.map((_, i) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);
  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const start = i === 0 ? 0 : ends[i - 1];
        const end = ends[i];
        const lp = clamp01((p - start) / (end - start));
        return (
          <li key={i} className="flex items-start gap-3 font-hand text-[1.7rem] leading-snug text-chalk chalk-glow">
            <span
              className="mt-[0.7rem] size-2.5 shrink-0 rounded-full bg-chalk-cyan transition-[opacity,transform] duration-200 ease-out"
              style={{ opacity: lp > 0 ? 1 : 0, transform: `scale(${lp > 0 ? 1 : 0.6})` }}
            />
            <Typed text={item} p={lp} active={active && lp > 0 && lp < 1} />
          </li>
        );
      })}
    </ul>
  );
}

function Formula({ step, p, active }: ElProps) {
  const html = useMemo(
    () => katex.renderToString(step.latex ?? "", { throwOnError: false, displayMode: true, output: "html" }),
    [step.latex],
  );
  const ref = useRef<HTMLDivElement>(null);
  const { moveTo } = useBoard();
  const fp = clamp01(p / 0.85);
  useLayoutEffect(() => {
    if (!active || fp <= 0 || fp >= 1 || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    moveTo(r.left + r.width * fp, r.top + r.height * (0.5 + 0.18 * Math.sin(fp * 22)));
  }, [active, fp, moveTo]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        data-ink
        className="formula inline-block max-w-full overflow-x-auto px-4 text-chalk"
        style={{ clipPath: `inset(-12px ${(1 - fp) * 100}% -12px -12px)` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {step.text ? (
        <p className="font-hand text-xl text-chalk-dim">
          <Typed text={step.text} p={clamp01((p - 0.85) / 0.15)} active={false} />
        </p>
      ) : null}
    </div>
  );
}

const TONE: Record<NonNullable<Step["tone"]>, { label: string; color: string }> = {
  tip: { label: "Tip", color: "var(--chalk-cyan)" },
  warning: { label: "Dhyan do", color: "var(--chalk-pink)" },
  example: { label: "Example", color: "var(--chalk-yellow)" },
  analogy: { label: "Socho aise", color: "var(--accent)" },
};

function Callout({ step, p, active }: ElProps) {
  const tone = TONE[step.tone ?? "tip"];
  const boxP = clamp01(p / 0.18);
  return (
    <div
      data-ink
      className="relative rounded-2xl border-2 border-dashed px-5 pb-4 pt-5"
      style={{
        borderColor: tone.color,
        background: `color-mix(in oklab, ${tone.color} 7%, transparent)`,
        clipPath: `inset(-16px ${(1 - boxP) * 100}% 0 0)`,
      }}
    >
      <span
        className="absolute -top-3 left-4 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink"
        style={{ background: tone.color }}
      >
        {tone.label}
      </span>
      <p className="font-hand text-[1.6rem] leading-snug text-chalk">
        <Typed text={step.text ?? ""} p={clamp01((p - 0.18) / 0.82)} active={active} />
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diagram: boxes + arrows, auto-laid out, drawn stroke by stroke.     */
/* ------------------------------------------------------------------ */
const NODE_H = 54;
const GAP_X = 66;
const GAP_Y = 48;
const PAD = 22;

function roundedRect(x: number, y: number, w: number, h: number, r = 14) {
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}

interface Seg {
  kind: "node" | "edge";
  d: string;
  weight: number;
  i: number;
  label?: { x: number; y: number; text: string; anchor: "middle" | "start" };
}

function layoutDiagram(step: Step, avail: number) {
  const nodes = step.nodes ?? [];
  const edges = step.edges ?? [];
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const ws = nodes.map((n) => Math.max(100, Math.min(220, n.label.length * 10 + 44)));
  const rowTotal = ws.reduce((a, b) => a + b, 0) + GAP_X * (nodes.length - 1) + PAD * 2;
  const dir = step.direction === "column" || rowTotal > avail ? "column" : "row";
  const isStraight = (a: number, b: number) => b === a + 1;
  const hasArc = edges.some((e) => !isStraight(idx.get(e.from)!, idx.get(e.to)!));

  const boxes: { x: number; y: number; w: number }[] = [];
  let W: number, H: number;
  if (dir === "row") {
    const top = PAD + (hasArc ? 64 : 10);
    let x = PAD;
    ws.forEach((w) => {
      boxes.push({ x, y: top, w });
      x += w + GAP_X;
    });
    W = rowTotal;
    H = top + NODE_H + PAD + 10;
  } else {
    const maxW = Math.max(...ws);
    const cx = PAD + maxW / 2;
    let y = PAD;
    ws.forEach((w) => {
      boxes.push({ x: cx - w / 2, y, w });
      y += NODE_H + GAP_Y;
    });
    W = PAD * 2 + maxW + (hasArc ? 110 : 60);
    H = y - GAP_Y + PAD;
  }

  const edgeSeg = (e: { from: string; to: string; label?: string }, k: number): Seg => {
    const a = idx.get(e.from)!;
    const b = idx.get(e.to)!;
    const A = boxes[a];
    const B = boxes[b];
    let d: string;
    let lx: number, ly: number;
    let anchor: "middle" | "start" = "middle";
    if (dir === "row") {
      const cy = A.y + NODE_H / 2;
      if (isStraight(a, b)) {
        d = `M${A.x + A.w + 4},${cy} L${B.x - 6},${cy}`;
        lx = (A.x + A.w + B.x) / 2;
        ly = cy - 10;
      } else {
        const ax = A.x + A.w / 2;
        const bx = B.x + B.w / 2;
        const cyc = A.y - 46 - 8 * (k % 3);
        d = `M${ax},${A.y - 4} Q${(ax + bx) / 2},${cyc} ${bx},${B.y - 6}`;
        lx = (ax + bx) / 2;
        ly = (A.y - 4 + 2 * cyc + B.y - 6) / 4 - 6;
      }
    } else {
      const cx = A.x + A.w / 2;
      if (isStraight(a, b)) {
        d = `M${cx},${A.y + NODE_H + 4} L${cx},${B.y - 6}`;
        lx = cx + 10;
        ly = (A.y + NODE_H + B.y) / 2 + 5;
        anchor = "start";
      } else {
        const ay = A.y + NODE_H / 2;
        const by = B.y + NODE_H / 2;
        const ctrlX = Math.max(A.x + A.w, B.x + B.w) + 60 + 10 * (k % 3);
        d = `M${A.x + A.w + 4},${ay} Q${ctrlX},${(ay + by) / 2} ${B.x + B.w + 6},${by}`;
        lx = (A.x + A.w + 2 * ctrlX + B.x + B.w) / 4 + 6;
        ly = (ay + by) / 2 + 5;
        anchor = "start";
      }
    }
    return { kind: "edge", d, weight: 0.7, i: k, label: e.label ? { x: lx, y: ly, text: e.label, anchor } : undefined };
  };

  // Draw order: each node, then every edge whose endpoints are both drawn.
  const segs: Seg[] = [];
  const done = new Set<number>();
  nodes.forEach((_, i) => {
    const bx = boxes[i];
    segs.push({ kind: "node", d: roundedRect(bx.x, bx.y, bx.w, NODE_H), weight: 1, i });
    edges.forEach((e, k) => {
      if (done.has(k)) return;
      if (Math.max(idx.get(e.from)!, idx.get(e.to)!) <= i) {
        segs.push(edgeSeg(e, k));
        done.add(k);
      }
    });
  });
  return { W, H, boxes, segs, dir };
}

function Diagram({ step, p, active, index }: ElProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(720);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const L = useMemo(() => layoutDiagram(step, avail), [step, avail]);
  const totalW = L.segs.reduce((a, s) => a + s.weight, 0) || 1;
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const { moveTo } = useBoard();

  const segEnds = L.segs.map((_, j) => L.segs.slice(0, j + 1).reduce((a, s) => a + s.weight, 0) / totalW);
  const local = L.segs.map((_, j) => {
    const start = j === 0 ? 0 : segEnds[j - 1];
    return clamp01((p - start) / (segEnds[j] - start));
  });
  const activeSeg = local.findIndex((v) => v > 0 && v < 1);
  const activeP = activeSeg >= 0 ? local[activeSeg] : 0;

  useLayoutEffect(() => {
    if (!active || activeSeg < 0) return;
    const el = pathRefs.current[activeSeg];
    if (!el) return;
    const pt = el.getPointAtLength(el.getTotalLength() * activeP);
    const r = el.ownerSVGElement!.getBoundingClientRect();
    const s = r.width / L.W;
    moveTo(r.left + pt.x * s, r.top + pt.y * s);
  }, [active, activeSeg, activeP, L.W, moveTo]);

  const nodeP = new Map<number, number>();
  L.segs.forEach((s, j) => s.kind === "node" && nodeP.set(s.i, local[j]));
  const marker = `ah-${index}`;

  return (
    <div ref={wrap} className="flex w-full justify-center">
      <svg data-ink viewBox={`0 0 ${L.W} ${L.H}`} width={L.W} height={L.H} className="max-w-full overflow-visible">
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--chalk-cyan)" />
          </marker>
        </defs>
        {L.segs.map((s, j) => (
          <path
            key={j}
            ref={(el) => {
              pathRefs.current[j] = el;
            }}
            d={s.d}
            fill={s.kind === "node" ? `color-mix(in oklab, var(--chalk-cyan) ${local[j] >= 1 ? 9 : 0}%, transparent)` : "none"}
            stroke={s.kind === "node" ? "var(--chalk)" : "var(--chalk-cyan)"}
            strokeWidth={s.kind === "node" ? 2.4 : 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - local[j]}
            markerEnd={s.kind === "edge" && local[j] >= 0.98 ? `url(#${marker})` : undefined}
            style={{ transition: "fill 300ms ease" }}
          />
        ))}
        {L.segs.map((s, j) =>
          s.label ? (
            <text
              key={`l${j}`}
              x={s.label.x}
              y={s.label.y}
              textAnchor={s.label.anchor}
              className="font-hand"
              fontSize={19}
              fill="var(--chalk-yellow)"
              opacity={local[j] >= 1 ? 1 : 0}
              style={{ transition: "opacity 250ms ease-out" }}
            >
              {s.label.text}
            </text>
          ) : null,
        )}
        {(step.nodes ?? []).map((n, i) => {
          const b = L.boxes[i];
          const np = nodeP.get(i) ?? 0;
          return (
            <text
              key={n.id}
              x={b.x + b.w / 2}
              y={b.y + NODE_H / 2 + 7}
              textAnchor="middle"
              className="font-hand"
              fontSize={23}
              fill="var(--chalk)"
              opacity={np > 0.55 ? 1 : 0}
              style={{ transition: "opacity 250ms ease-out" }}
            >
              {n.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Highlight: the teacher circles an earlier step again.               */
/* ------------------------------------------------------------------ */
function Highlight({ step, p, active }: ElProps) {
  const { getStepEl, contentEl, moveTo } = useBoard();
  const pathRef = useRef<SVGPathElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const target = getStepEl(step.target ?? -1);
    const content = contentEl();
    if (!target || !content) return;
    const measure = () => {
      const c = content.getBoundingClientRect();
      // Circle the drawn ink, not the full-width row.
      const inks = Array.from(target.querySelectorAll("[data-ink]")).map((e) => e.getBoundingClientRect());
      const rs = inks.length ? inks : [target.getBoundingClientRect()];
      const l = Math.min(...rs.map((r) => r.left));
      const t = Math.min(...rs.map((r) => r.top));
      const rr = Math.max(...rs.map((r) => r.right));
      const b = Math.max(...rs.map((r) => r.bottom));
      setBox({ x: l - c.left, y: t - c.top, w: Math.max(rr - l, 80), h: b - t });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [step.target, getStepEl, contentEl]);

  const d = useMemo(() => {
    if (!box) return "";
    const pad = 16;
    const cx = box.w / 2 + pad;
    const cy = box.h / 2 + pad;
    const rx = box.w / 2 + pad - 2;
    const ry = box.h / 2 + pad - 4;
    const pts: string[] = [];
    const N = 64;
    for (let k = 0; k <= N; k++) {
      const t = -Math.PI * 0.6 + (k / N) * Math.PI * 2.15;
      const wobble = 1 + 0.035 * Math.sin(k * 0.9) + (k / N) * 0.05;
      pts.push(`${(cx + Math.cos(t) * rx * wobble).toFixed(1)},${(cy + Math.sin(t) * ry * wobble).toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  }, [box]);

  useLayoutEffect(() => {
    if (!active || p <= 0 || p >= 1 || !pathRef.current || !box) return;
    const el = pathRef.current;
    const pt = el.getPointAtLength(el.getTotalLength() * p);
    const r = el.ownerSVGElement!.getBoundingClientRect();
    moveTo(r.left + pt.x, r.top + pt.y);
  }, [active, p, box, moveTo]);

  if (!box) return null;
  const pad = 16;
  return (
    <div className="h-0">
      <svg
        className="pointer-events-none absolute overflow-visible"
        style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }}
      >
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="var(--chalk-pink)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - p}
          opacity={active ? 1 : 0.55}
          style={{ transition: "opacity 400ms ease" }}
        />
      </svg>
    </div>
  );
}

const RENDERERS = {
  heading: Heading,
  write: Write,
  bullets: Bullets,
  formula: Formula,
  diagram: Diagram,
  callout: Callout,
  highlight: Highlight,
  solve: Solve,
  plot: Plot,
  network: Network,
  matrix: Matrix,
  code: Code,
  table: Table,
  clip: Clip,
  tree: Tree,
  video: VideoRef,
  live: Live,
} as const;

export const StepView = memo(function StepView(props: ElProps) {
  const { registerEl } = useBoard();
  const C = RENDERERS[props.step.type];
  const isHighlight = props.step.type === "highlight";
  return (
    <div ref={(el) => registerEl(props.index, el)} className={isHighlight ? "" : "mb-7"}>
      <C {...props} />
    </div>
  );
});
