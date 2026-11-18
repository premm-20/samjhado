"use client";
// Phase 2 board renderers: worked numericals and live animations.
import katex from "katex";
import { useLayoutEffect, useMemo, useRef } from "react";
import { compileExpr } from "@/lib/mathExpr";
import { useBoard } from "./context";
import type { ElProps } from "./elements";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const tex = (s: string, display = false) => katex.renderToString(s, { throwOnError: false, displayMode: display, output: "html" });

/** Split [0,1] into consecutive slices by weight; returns local progress per slice. */
function slices(p: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const ends = weights.map((_, i) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);
  return ends.map((end, i) => {
    const start = i === 0 ? 0 : ends[i - 1];
    return clamp01((p - start) / (end - start || 1));
  });
}

/* ------------------------------------------------------------------ */
/* Solve: Given / Find / every step / boxed answer                      */
/* ------------------------------------------------------------------ */
export function Solve({ step, p, active }: ElProps) {
  const given = useMemo(() => step.items ?? [], [step.items]);
  const lines = useMemo(() => step.lines ?? [], [step.lines]);
  const weights = [given.length || step.text ? 0.6 + given.length * 0.4 : 0.01, ...lines.map((l) => 1 + l.latex.length / 40), 1];
  const local = slices(p, weights);
  const givenP = local[0];
  const answerP = local[local.length - 1];
  const html = useMemo(
    () => ({ given: given.map((g) => tex(g)), lines: lines.map((l) => tex(l.latex, true)), answer: step.answer ? tex(step.answer, true) : "" }),
    [given, lines, step.answer],
  );
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const { moveTo } = useBoard();
  const activeLine = local.slice(1, -1).findIndex((v) => v > 0 && v < 1);
  const lp = activeLine >= 0 ? local[activeLine + 1] : 0;

  useLayoutEffect(() => {
    if (!active) return;
    const idx = activeLine >= 0 ? activeLine + 1 : answerP > 0 && answerP < 1 ? lines.length + 1 : givenP > 0 && givenP < 1 ? 0 : -1;
    const el = idx >= 0 ? refs.current[idx] : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = idx === 0 ? givenP : idx === lines.length + 1 ? answerP : lp;
    moveTo(r.left + Math.min(r.width, 40 + r.width * t), r.top + r.height * 0.62);
  }, [active, activeLine, lp, givenP, answerP, lines.length, moveTo]);

  return (
    <div data-ink className="rounded-2xl border border-white/[0.09] bg-white/[0.025] px-5 py-4">
      {given.length || step.text ? (
        <div
          ref={(el) => {
            refs.current[0] = el;
          }}
          className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-dashed border-white/10 pb-3"
          style={{ opacity: givenP > 0 ? 1 : 0, transition: "opacity 250ms ease-out" }}
        >
          {given.length ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="rounded-md bg-chalk-cyan/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-chalk-cyan">Given</span>
              {given.map((g, i) => (
                <span
                  key={i}
                  className="text-[1.15rem] text-chalk"
                  style={{ opacity: givenP * given.length > i ? 1 : 0, transition: "opacity 200ms ease-out" }}
                  dangerouslySetInnerHTML={{ __html: html.given[i] }}
                />
              ))}
            </div>
          ) : null}
          {step.text ? (
            <div className="flex items-baseline gap-2">
              <span className="rounded-md bg-chalk-yellow/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-chalk-yellow">Find</span>
              <span className="font-hand text-2xl text-chalk" style={{ opacity: givenP > 0.6 ? 1 : 0, transition: "opacity 200ms" }}>
                {step.text}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        {lines.map((l, i) => {
          const v = local[i + 1];
          return (
            <div
              key={i}
              ref={(el) => {
                refs.current[i + 1] = el;
              }}
              className="flex flex-wrap items-center gap-x-4"
              style={{ visibility: v > 0 ? "visible" : "hidden" }}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/15 text-[11px] tabular-nums text-white/50">{i + 1}</span>
              <div
                className="formula solve-line min-w-0 overflow-x-auto overflow-y-hidden py-1 text-chalk [scrollbar-width:none]"
                style={{ clipPath: `inset(-12px ${(1 - clamp01(v / 0.8)) * 100}% -12px -12px)` }}
                dangerouslySetInnerHTML={{ __html: html.lines[i] }}
              />
              {l.note ? (
                <span className="font-hand text-xl text-chalk-dim" style={{ opacity: v > 0.8 ? 1 : 0, transition: "opacity 250ms ease-out" }}>
                  ← {l.note}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {html.answer ? (
        <div
          ref={(el) => {
            refs.current[lines.length + 1] = el;
          }}
          className="mt-3 inline-flex items-center gap-3 rounded-xl border-2 px-4 py-1"
          style={{
            borderColor: "var(--accent)",
            background: "color-mix(in oklab, var(--accent) 8%, transparent)",
            clipPath: `inset(-4px ${(1 - answerP) * 100}% -4px -4px)`,
          }}
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">Answer</span>
          <span className="formula solve-line text-chalk" dangerouslySetInnerHTML={{ __html: html.answer }} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plot: axes, curve drawn live, a dot that walks through points        */
/* ------------------------------------------------------------------ */
const PW = 600;
const PH = 320;
const M = { l: 48, r: 18, t: 18, b: 40 };

function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : String(+v.toFixed(2)));

export function Plot({ step, p, active, index }: ElProps) {
  const f = useMemo(() => compileExpr(step.fn ?? "") ?? ((x: number) => x), [step.fn]);
  const xMin = step.xMin ?? -5;
  const xMax = step.xMax ?? 5;
  const pts = useMemo(() => step.points ?? [], [step.points]);

  const geo = useMemo(() => {
    const N = 180;
    const xs = Array.from({ length: N + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / N);
    const ys = xs.map((x) => f(x));
    const finite = ys.filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
    let yLo = finite[Math.floor(finite.length * 0.02)] ?? -1;
    let yHi = finite[Math.ceil(finite.length * 0.98) - 1] ?? 1;
    for (const x of pts) {
      const y = f(x);
      if (Number.isFinite(y)) {
        yLo = Math.min(yLo, y);
        yHi = Math.max(yHi, y);
      }
    }
    if (yHi - yLo < 1e-6) {
      yLo -= 1;
      yHi += 1;
    }
    const pad = (yHi - yLo) * 0.1;
    yLo -= pad;
    yHi += pad;
    const sx = (x: number) => M.l + ((x - xMin) / (xMax - xMin)) * (PW - M.l - M.r);
    const sy = (y: number) => PH - M.b - ((y - yLo) / (yHi - yLo)) * (PH - M.t - M.b);
    let d = "";
    let pen = false;
    xs.forEach((x, i) => {
      const y = ys[i];
      if (!Number.isFinite(y) || y < yLo - (yHi - yLo) || y > yHi + (yHi - yLo)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(Math.max(yLo, Math.min(yHi, y))).toFixed(1)} `;
      pen = true;
    });
    return { d, sx, sy, xt: niceTicks(xMin, xMax), yt: niceTicks(yLo, yHi), yLo, yHi };
  }, [f, xMin, xMax, pts]);

  const hasPts = pts.length > 0;
  const [axesP, curveP, walkP] = slices(p, [0.15, hasPts ? 0.4 : 0.85, hasPts ? 0.45 : 0.0001]);
  const curveRef = useRef<SVGPathElement>(null);
  const { moveTo } = useBoard();

  // Dot position along the walk: x lerps between points, y follows the curve.
  const seg = hasPts ? Math.min(pts.length - 1, Math.floor(walkP * Math.max(1, pts.length - 1))) : 0;
  const segP = hasPts && pts.length > 1 ? walkP * (pts.length - 1) - seg : 1;
  const dotX = hasPts ? (pts.length > 1 ? pts[seg] + (pts[Math.min(seg + 1, pts.length - 1)] - pts[seg]) * clamp01(segP) : pts[0]) : xMin;
  const dotY = f(dotX);
  const visited = hasPts ? Math.min(pts.length, Math.floor(walkP * Math.max(1, pts.length - 1)) + 1) : 0;

  useLayoutEffect(() => {
    if (!active) return;
    const svg = curveRef.current?.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const s = r.width / PW;
    if (curveP > 0 && curveP < 1 && curveRef.current) {
      const el = curveRef.current;
      const pt = el.getPointAtLength(el.getTotalLength() * curveP);
      moveTo(r.left + pt.x * s, r.top + pt.y * s);
    } else if (walkP > 0 && walkP < 1 && Number.isFinite(dotY)) {
      moveTo(r.left + geo.sx(dotX) * s + 10, r.top + geo.sy(dotY) * s + 10);
    } else if (axesP > 0 && axesP < 1) {
      moveTo(r.left + M.l * s + (PW - M.l - M.r) * s * axesP, r.top + (PH - M.b) * s);
    }
  }, [active, axesP, curveP, walkP, dotX, dotY, geo, moveTo]);

  const zeroY = geo.yLo < 0 && geo.yHi > 0 ? geo.sy(0) : null;
  const zeroX = xMin < 0 && xMax > 0 ? geo.sx(0) : null;
  const gid = `glow-${index}`;

  return (
    <div className="flex flex-col items-center">
      <svg data-ink viewBox={`0 0 ${PW} ${PH}`} className="w-full max-w-[600px] overflow-visible">
        <defs>
          <filter id={gid} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g opacity={axesP > 0 ? 1 : 0} style={{ transition: "opacity 300ms ease-out" }}>
          {geo.xt.map((t) => (
            <g key={`x${t}`}>
              <line x1={geo.sx(t)} x2={geo.sx(t)} y1={M.t} y2={PH - M.b} stroke="rgba(255,255,255,0.06)" />
              <text x={geo.sx(t)} y={PH - M.b + 18} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.4)">
                {fmt(t)}
              </text>
            </g>
          ))}
          {geo.yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.l} x2={PW - M.r} y1={geo.sy(t)} y2={geo.sy(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={M.l - 8} y={geo.sy(t) + 4} textAnchor="end" fontSize="12" fill="rgba(255,255,255,0.4)">
                {fmt(t)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={PW - M.r} y1={zeroY ?? PH - M.b} y2={zeroY ?? PH - M.b} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          <line x1={zeroX ?? M.l} x2={zeroX ?? M.l} y1={M.t} y2={PH - M.b} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          {step.xLabel ? (
            <text x={PW - M.r} y={PH - 6} textAnchor="end" className="font-hand" fontSize="18" fill="var(--chalk-dim)">
              {step.xLabel}
            </text>
          ) : null}
          {step.yLabel ? (
            <text x={M.l + 6} y={M.t + 4} className="font-hand" fontSize="18" fill="var(--chalk-dim)">
              {step.yLabel}
            </text>
          ) : null}
        </g>
        <path
          ref={curveRef}
          d={geo.d}
          fill="none"
          stroke="var(--chalk-cyan)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - curveP}
        />
        {pts.slice(0, visited).map((x, i) => {
          const y = f(x);
          if (!Number.isFinite(y)) return null;
          return (
            <g key={i}>
              <circle cx={geo.sx(x)} cy={geo.sy(y)} r="5" fill="var(--chalk-pink)" opacity="0.55" />
              <text x={geo.sx(x)} y={geo.sy(y) - 12} textAnchor="middle" className="font-hand" fontSize="17" fill="var(--chalk-yellow)">
                {i + 1}
              </text>
            </g>
          );
        })}
        {hasPts && walkP > 0 && Number.isFinite(dotY) ? (
          <circle cx={geo.sx(dotX)} cy={geo.sy(dotY)} r="9" fill="var(--chalk-pink)" filter={`url(#${gid})`} />
        ) : null}
      </svg>
      <p className="mt-1 font-hand text-xl text-chalk-dim" style={{ opacity: curveP > 0.3 ? 1 : 0, transition: "opacity 300ms" }}>
        <span dangerouslySetInnerHTML={{ __html: tex(`y = ${(step.fn ?? "").replace(/\*/g, "\\cdot ")}`) }} />
        {step.text ? <span className="ml-3">{step.text}</span> : null}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Network: neurons appear, connections draw, a forward pass flows      */
/* ------------------------------------------------------------------ */
export function Network({ step, p, active }: ElProps) {
  const layers = (step.layers ?? []).map((n) => Math.min(n, 6));
  const labels = step.items ?? [];
  const W = 600;
  const maxN = Math.max(...layers);
  const H = Math.max(240, maxN * 54 + 50);
  const R = 15;
  const pos = layers.map((n, li) => {
    const x = 60 + (li * (W - 120)) / Math.max(1, layers.length - 1);
    return Array.from({ length: n }, (_, k) => ({ x, y: H / 2 - 18 + (k - (n - 1) / 2) * 54 }));
  });
  const [popP, edgeP, flowP] = slices(p, [0.3, 0.25, 0.45]);
  const popLocal = slices(popP, layers.map(() => 1));
  const edgeLocal = slices(edgeP, layers.slice(1).map(() => 1));
  const flowLocal = slices(flowP, layers.slice(1).map(() => 1));
  const { moveTo } = useBoard();
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const s = r.width / W;
    let x: number | null = null;
    let y = H / 2;
    const pl = popLocal.findIndex((v) => v > 0 && v < 1);
    const el = edgeLocal.findIndex((v) => v > 0 && v < 1);
    const fl = flowLocal.findIndex((v) => v > 0 && v < 1);
    if (fl >= 0) {
      x = pos[fl][0].x + (pos[fl + 1][0].x - pos[fl][0].x) * flowLocal[fl];
      y = H / 2 - 18 + 70;
    } else if (el >= 0) {
      x = pos[el][0].x + (pos[el + 1][0].x - pos[el][0].x) * edgeLocal[el];
      y = H - 40;
    } else if (pl >= 0) {
      const k = Math.min(pos[pl].length - 1, Math.floor(popLocal[pl] * pos[pl].length));
      x = pos[pl][k].x + R;
      y = pos[pl][k].y + R;
    }
    if (x !== null) moveTo(r.left + x * s, r.top + y * s);
  });

  return (
    <div className="flex justify-center">
      <svg ref={ref} data-ink viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[600px] overflow-visible">
        {/* connections */}
        {pos.slice(1).map((layer, li) =>
          layer.map((b, bi) =>
            pos[li].map((a, ai) => (
              <line
                key={`${li}-${ai}-${bi}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={flowLocal[li] >= 1 ? "var(--accent)" : "rgba(255,255,255,0.5)"}
                strokeOpacity={flowLocal[li] >= 1 ? 0.35 : 0.22}
                strokeWidth="1.3"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1 - edgeLocal[li]}
              />
            )),
          ),
        )}
        {/* forward-pass pulses */}
        {pos.slice(1).map((layer, li) =>
          flowLocal[li] > 0 && flowLocal[li] < 1
            ? layer.flatMap((b, bi) =>
                pos[li].map((a, ai) => (
                  <circle
                    key={`p${li}-${ai}-${bi}`}
                    cx={a.x + (b.x - a.x) * flowLocal[li]}
                    cy={a.y + (b.y - a.y) * flowLocal[li]}
                    r="3.2"
                    fill="var(--accent)"
                  />
                )),
              )
            : null,
        )}
        {/* neurons */}
        {pos.map((layer, li) =>
          layer.map((n, k) => {
            const shown = popLocal[li] * layer.length > k;
            const lit = li === 0 ? flowP > 0 : flowLocal[li - 1] >= 1;
            return (
              <circle
                key={`n${li}-${k}`}
                cx={n.x}
                cy={n.y}
                r={R}
                fill={lit ? "color-mix(in oklab, var(--accent) 30%, var(--board))" : "var(--board)"}
                stroke={lit ? "var(--accent)" : "var(--chalk)"}
                strokeWidth="2.2"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: `scale(${shown ? 1 : 0.6})`,
                  transformOrigin: `${n.x}px ${n.y}px`,
                  transition: "opacity 220ms ease-out, transform 220ms cubic-bezier(0.23,1,0.32,1), fill 300ms ease",
                }}
              />
            );
          }),
        )}
        {/* layer labels */}
        {pos.map((layer, li) => (
          <text
            key={`l${li}`}
            x={layer[0].x}
            y={H - 8}
            textAnchor="middle"
            className="font-hand"
            fontSize="19"
            fill="var(--chalk-yellow)"
            opacity={popLocal[li] >= 1 ? 1 : 0}
            style={{ transition: "opacity 250ms ease-out" }}
          >
            {labels[li] || (li === 0 ? "Input" : li === pos.length - 1 ? "Output" : `Hidden ${li}`)}
            {(step.layers ?? [])[li] > 6 ? ` (${(step.layers ?? [])[li]})` : ""}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix: bracketed grids, cells written one by one                    */
/* ------------------------------------------------------------------ */
export function Matrix({ step, p, active }: ElProps) {
  const blocks = step.matrices ?? [];
  const ops = step.ops ?? [];
  const total = blocks.reduce((t, m) => t + m.rows.reduce((a, r) => a + r.length, 0), 0) || 1;
  const shownCells = Math.floor(clamp01(p / 0.92) * total);
  const curRef = useRef<HTMLSpanElement | null>(null);
  const { moveTo } = useBoard();
  useLayoutEffect(() => {
    if (!active || p >= 1 || !curRef.current) return;
    const r = curRef.current.getBoundingClientRect();
    moveTo(r.right - 2, r.bottom - 4);
  }, [active, shownCells, p, moveTo]);

  let counter = 0;
  return (
    <div data-ink className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {blocks.map((m, bi) => {
          const cols = Math.max(...m.rows.map((r) => r.length));
          return (
            <div key={bi} className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                {m.label ? <span className="matrix-math text-chalk-yellow" dangerouslySetInnerHTML={{ __html: tex(m.label) }} /> : null}
                <div className="matrix-brackets grid gap-x-4 gap-y-1 px-4 py-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(2.2rem, auto))` }}>
                  {m.rows.flatMap((row, ri) =>
                    Array.from({ length: cols }, (_, ci) => {
                      const k = counter++;
                      const shown = k < shownCells;
                      return (
                        <span
                          key={`${ri}-${ci}`}
                          ref={k === shownCells - 1 ? curRef : undefined}
                          className="matrix-math flex items-center justify-center py-1 text-center text-chalk"
                          style={{ opacity: shown ? 1 : 0, transition: "opacity 160ms ease-out" }}
                          dangerouslySetInnerHTML={{ __html: tex(row[ci] ?? "") }}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
              {bi < blocks.length - 1 && ops[bi] ? (
                <span
                  className="text-2xl text-chalk"
                  style={{ opacity: counter <= shownCells ? 1 : 0, transition: "opacity 200ms" }}
                  dangerouslySetInnerHTML={{ __html: tex(ops[bi]) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {step.text ? <p className="font-hand text-xl text-chalk-dim" style={{ opacity: p > 0.9 ? 1 : 0, transition: "opacity 250ms" }}>{step.text}</p> : null}
    </div>
  );
}
