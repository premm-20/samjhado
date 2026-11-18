import type { Step } from "@/lib/types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How long the pointer spends drawing a step, in ms at 1x speed. */
export function drawDuration(step: Step): number {
  switch (step.type) {
    case "heading":
      return clamp(700 + (step.text?.length ?? 0) * 45, 1000, 2600);
    case "write":
      return clamp(400 + (step.text?.length ?? 0) * 32, 900, 4200);
    case "bullets":
      return (step.items ?? []).reduce((t, i) => t + clamp(300 + i.length * 30, 700, 2200), 0);
    case "formula":
      return clamp(1500 + (step.latex?.length ?? 0) * 14, 1600, 3800);
    case "diagram":
      return (step.nodes?.length ?? 0) * 650 + (step.edges?.length ?? 0) * 450 + 300;
    case "callout":
      return clamp(600 + (step.text?.length ?? 0) * 24, 1200, 4000);
    case "highlight":
      return 1100;
    case "solve":
      return 700 + (step.items?.length ?? 0) * 500 + (step.lines ?? []).reduce((t, l) => t + 900 + l.latex.length * 18, 0) + 1000;
    case "plot":
      return 2600 + (step.points?.length ?? 0) * 750;
    case "network": {
      const n = (step.layers ?? []).reduce((a, b) => a + Math.min(b, 6), 0);
      return 1200 + n * 160 + 2200;
    }
    case "matrix": {
      const cells = (step.matrices ?? []).reduce((t, m) => t + m.rows.reduce((a, r) => a + r.length, 0), 0);
      return clamp(600 + cells * 110, 1400, 6000);
    }
    case "code":
      return clamp(500 + (step.code?.length ?? 0) * 22, 1500, 9000);
    case "table": {
      const cells = (step.columns?.length ?? 0) + (step.rows ?? []).reduce((a, r) => a + r.length, 0);
      return clamp(700 + cells * 70, 1400, 5000);
    }
    case "clip":
      return 1600;
    case "tree":
      return clamp(600 + (step.items?.length ?? 0) * 380, 1400, 7000);
    case "video":
      return 1800;
    case "live":
      return 2200;
  }
}

/** Time for the learner to read the narration caption. */
export function readDuration(step: Step): number {
  const words = step.say.trim().split(/\s+/).filter(Boolean).length;
  return words * 340 + 600;
}

export function stepDuration(step: Step): { draw: number; total: number } {
  const draw = drawDuration(step);
  return { draw, total: Math.max(draw + 500, readDuration(step)) };
}

/** Plain-text description of a step, used as "board so far" context for doubts. */
export function describeStep(step: Step): string {
  switch (step.type) {
    case "heading":
    case "write":
    case "callout":
      return step.text ?? "";
    case "bullets":
      return (step.items ?? []).join("; ");
    case "formula":
      return `formula: ${step.latex}`;
    case "diagram":
      return `diagram: ${(step.nodes ?? []).map((n) => n.label).join(" -> ")}`;
    case "highlight":
      return `(circled step ${step.target})`;
    case "solve":
      return `solved: ${(step.lines ?? []).map((l) => l.latex).join(" ; ")} => ${step.answer ?? ""}`;
    case "plot":
      return `graph of y = ${step.fn}`;
    case "network":
      return `neural network ${(step.layers ?? []).join("-")}`;
    case "matrix":
      return `matrices: ${(step.matrices ?? []).map((m) => m.rows.map((r) => r.join(" ")).join(" / ")).join(` ${step.ops?.[0] ?? ""} `)}`;
    case "code":
      return `code (${step.language}): ${(step.code ?? "").split("\n").slice(0, 4).join(" | ")}`;
    case "table":
      return `table: ${(step.columns ?? []).join(", ")}${step.text ? ` (${step.text})` : ""}`;
    case "clip":
      return `video moment ${step.start}s-${step.end}s: ${step.text ?? ""}`;
    case "tree":
      return `folder tree: ${(step.items ?? []).map((i) => i.trim()).slice(0, 8).join(", ")}`;
    case "video":
      return `video reference: ${step.query}`;
    case "live":
      return `live app: ${step.path || "/"} — ${step.text ?? ""}`;
  }
}
