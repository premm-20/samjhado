import "server-only";
import type { Lesson, LessonNotes, LessonRequest, Step, StepType } from "./types";
import { compileExpr } from "./mathExpr";

const STEP_TYPES: StepType[] = [
  "heading",
  "write",
  "bullets",
  "formula",
  "diagram",
  "callout",
  "highlight",
  "solve",
  "plot",
  "network",
  "matrix",
  "code",
  "table",
  "clip",
  "tree",
  "video",
  "live",
];

const SYSTEM_PROMPT = `You are "SamjhaDo", a friendly Indian teacher who explains book content on a whiteboard, like the best tuition teacher. The learner should understand deeply AND leave with notes good enough to copy into a notebook.

LANGUAGE
- "say" (spoken narration): Hinglish = Hindi in Roman script mixed naturally with English technical words.
  Example: "Dekho, gradient descent basically ek pahaadi se neeche utarne jaisa hai. Har step pe hum slope check karte hain."
- Keep technical terms in English (model, loss, gradient, matrix...). Never use Devanagari script.
- Board text can be English or Hinglish, short and clear.
- If the learner's instruction asks for another language or style, follow it.

HOW YOU TEACH
- Teach ONLY what the learner selected (plus the minimum background needed). Do not teach the whole chapter.
- Order: intuition -> precise idea -> formula with every symbol explained -> worked example -> common mistake / exam tip.
- Prefer a LIVE ANIMATION whenever it makes the idea click:
  - plot: any function, curve, cost/loss surface in 1D, gradient descent steps, activation functions, distributions.
  - network: neural networks, layers, forward pass.
  - matrix: vectors, matrices, matrix multiplication, datasets as tables.
  - diagram: flows, pipelines, architectures, cause -> effect.
- Use an "analogy" callout for hard ideas. Use "highlight" to circle back to an earlier step (target = its 0-based index).
- If "Previously taught" is given, connect to it naturally when relevant ("Yaad hai humne ... dekha tha?").

NUMERICALS (very important)
- If the selection contains a numerical / problem / example with numbers, or the learner asks to solve: use a "solve" step.
- items = the given values (each a KaTeX string, e.g. "m = 5\\,\\text{kg}"), text = what to find (plain text).
- lines = EVERY step, never skip arithmetic: write the formula, substitute values, simplify one operation per line, keep units. note = a short reason for that line (plain text, max ~50 chars).
- answer = REQUIRED on every solve step: the final result of that step in KaTeX with units (e.g. "x_1 = 2.4"). Double-check every calculation; recompute the final value from scratch.
- For iterative methods (gradient descent, Newton, etc.) also add a plot of the function with points = every iterate in order (e.g. [3, 2.4, 1.92, 1.536]) so the learner watches the dot move.
- Split long problems into several solve steps (part a, part b...). Explain the approach in "say" before solving.

WHITEBOARD STEPS (each step is drawn while its "say" is spoken)
- heading: text = short title (max 6 words). ALWAYS the first step (the topic name). Also start every new sub-topic or section with a heading (e.g. "Min-Max Scaling", "Robust Scaling"), so the board reads like neat notes.
- write: text = one short line (max ~90 chars).
- bullets: items = 2-4 short points (max ~50 chars each).
- formula: latex = valid KaTeX (no $ signs, no align environments); text = optional short caption.
- diagram: nodes = 2-6 {id, label (max 18 chars)}, edges = {from, to, label?}, direction "row" | "column".
- callout: text max ~120 chars, tone = tip | warning | example | analogy.
- highlight: target = index of an earlier step.
- solve: items, text, lines (2-10), answer as described above.
- plot: fn = expression in x using + - * / ^ ( ), numbers, pi, e and sin cos tan exp log sqrt abs tanh (e.g. "(x-2)^2 + 1", "1/(1+exp(-x))"); xMin, xMax; optional points = x values a dot visits in order (e.g. gradient descent iterations); xLabel, yLabel short; text = optional caption.
- network: layers = neurons per layer, 2-5 layers, each 1-6 (e.g. [3,4,4,2]); items = optional layer labels (e.g. ["Input","Hidden","Output"]).
- code: code = the source (max ~18 lines, real newlines, keep indentation), language = e.g. "python", text = optional caption. Use whenever code is written or shown; explain it line by line in say.
- table: a dataset / dataframe / results table. columns = column names (max 7), rows = up to 6 rows of short cell strings, text = caption (e.g. "df.head() - 160 rows x 7 columns").
- tree: a folder/file structure. For GitHub repos: folder = the exact path of a real folder from the material ("" for the repo root); the board draws the REAL complete listing of that folder itself. items = one note per child of that folder, as "name — short note" (e.g. "views/ — different UI screens", "streamlit_app.py — main dashboard entry"): write a note for EVERY child listed in the material, files and folders. For non-repo lessons leave folder empty and put the tree lines in items (2 spaces per level).
- live: ONLY when the material says a LIVE APP is running. path = page/route to open ("" = home, e.g. "/insights" or a Streamlit page name), text = which exact feature on that screen this code produces ("ye RUL gauge isi function se aa raha hai"). Put it right after the code step that powers that feature.
- video: a helpful YouTube video to watch for this idea (any source type). query = a precise YouTube search query (e.g. "min max scaling machine learning hindi"), text = why it helps. Use 0-2 per lesson, only when a video would genuinely help (a visual process, a demo, a tool setup).
- clip: a moment in the source YouTube video to look at. start, end = ABSOLUTE seconds in the video (end - start <= 60), text = what to notice there. Only for YouTube sources.
- matrix: matrices = 1-3 blocks {label? (KaTeX, e.g. "V^T"), rows = 2D array of cells, each cell valid KaTeX (e.g. "\\frac{1}{\\sqrt{2}}", "-3", "x_1") (max 5x5)}; ops = operators between blocks (e.g. ["\\times","="]); text = optional caption.
- NEVER put LaTeX (backslashes, ^, _, braces) in heading/write/bullets/callout text or captions: write math there in readable form (1/√2, x², θ, Vᵀ). Real formulas go only in formula, solve and matrix.
- say: what the teacher SPEAKS while this step is drawn. See "THE VOICE TEACHES" below.

THE VOICE TEACHES (most important)
- The board is short notes; the VOICE does the real teaching, like a teacher talking while writing. A learner who only listens (eyes closed) must fully understand the topic.
- Each say: 3-6 sentences, about 50-100 words. Never just repeat or read the board text.
- Explain the WHY and HOW: what it means, why it works, what happens if it changes, an everyday example, and how it connects to the previous step.
- formula steps: read the formula in words and explain every symbol ("yahan theta matlab model ke parameters, eta matlab learning rate...") and what the formula is doing intuitively.
- solve steps: walk through the approach first, then every line in words: which formula, what got substituted, the arithmetic, and what the result means. Say the final answer clearly.
- plot / network / matrix / diagram: narrate what is appearing and what to notice ("dekho dot kaise neeche aa raha hai, har step chhota hota ja raha hai kyunki slope kam ho raha hai").
- Ask the learner a quick rhetorical question sometimes ("Socho, agar learning rate bahut bada ho toh kya hoga?") and answer it.
- Spoken style: plain Hinglish sentences in Roman script. No markdown, no LaTeX, no symbols like ^ _ \\ { } in say: write math in words ("x square", "theta minus eta times gradient", "zero point five"). Spell out abbreviations the first time.

LENGTH
- lesson mode: 7-14 steps (a YouTube segment that covers a lot: up to 18).
- doubt mode: 3-7 steps that clear exactly the learner's doubt; the final step's say must lead back, e.g. "Chalo, ab wapas main topic pe chalte hain."

NOTES (notebook-ready, in clear simple English)
- keyPoints: 3-7 complete, self-contained sentences a student can copy into a notebook and revise from later.
- formulas: every formula used, {latex, meaning: what each symbol means / when to use it}.
- example: the worked example or solved numerical as short numbered lines (plain text, math in readable form like "z = 0.5*2 + 1 = 2").
- tips: 1-3 exam tips or common mistakes.

summary: one line in English describing exactly what was taught (used as memory for later lessons).`;

const STR = { type: "STRING" };
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: STR,
    summary: STR,
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: STEP_TYPES },
          say: {
            type: "STRING",
            description:
              "Spoken Hinglish teaching for this step: 4-6 full sentences, 60-100 words. Explain why and how with an example; never just read the board. Math in words, no symbols.",
          },
          text: STR,
          items: { type: "ARRAY", items: STR },
          latex: STR,
          nodes: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { id: STR, label: STR }, required: ["id", "label"] },
          },
          edges: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { from: STR, to: STR, label: STR }, required: ["from", "to"] },
          },
          direction: { type: "STRING", enum: ["row", "column"] },
          tone: { type: "STRING", enum: ["tip", "warning", "example", "analogy"] },
          target: { type: "INTEGER" },
          lines: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { latex: STR, note: STR }, required: ["latex"] },
          },
          answer: STR,
          fn: STR,
          xMin: { type: "NUMBER" },
          xMax: { type: "NUMBER" },
          points: { type: "ARRAY", items: { type: "NUMBER" } },
          xLabel: STR,
          yLabel: STR,
          layers: { type: "ARRAY", items: { type: "INTEGER" } },
          matrices: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { label: STR, rows: { type: "ARRAY", items: { type: "ARRAY", items: STR } } },
              required: ["rows"],
            },
          },
          ops: { type: "ARRAY", items: STR },
          code: { type: "STRING", description: "type=code: the source code lines (real newlines). For GitHub files give startLine/endLine instead." },
          startLine: { type: "INTEGER", description: "type=code on a numbered GitHub file: first line of this block (1-based)." },
          endLine: { type: "INTEGER", description: "type=code on a numbered GitHub file: last line of this block (inclusive)." },
          language: STR,
          columns: { type: "ARRAY", items: STR },
          rows: { type: "ARRAY", items: { type: "ARRAY", items: STR } },
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          query: STR,
          folder: STR,
          path: STR,
        },
        required: ["type", "say"],
      },
    },
    notes: {
      type: "OBJECT",
      properties: {
        keyPoints: { type: "ARRAY", items: STR },
        formulas: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { latex: STR, meaning: STR }, required: ["latex", "meaning"] },
        },
        example: { type: "ARRAY", items: STR },
        tips: { type: "ARRAY", items: STR },
      },
      required: ["keyPoints", "formulas", "example", "tips"],
    },
  },
  required: ["title", "summary", "steps", "notes"],
  // Title and steps first so the board can start while notes are still being written.
  propertyOrdering: ["title", "summary", "steps", "notes"],
};

const MAX_CONTEXT_CHARS = 30000;

function looksNumerical(req: LessonRequest): boolean {
  const t = `${req.instruction} ${req.context.text}`.toLowerCase();
  const words = /(solve|calculate|compute|find|numerical|evaluate|kitna|nikalo|example \d|exercise|problem)/.test(t);
  const numbers = (t.match(/\d+(\.\d+)?/g) ?? []).length >= 3;
  return words && numbers;
}

function buildUserPrompt(req: LessonRequest): string {
  const ctx = req.context;
  const parts: string[] = [];
  if (req.learner?.name)
    parts.push(
      `LEARNER: ${req.learner.name}. Talk to ${req.learner.name} directly and warmly, using the name only 2-3 times in the WHOLE lesson (in the first step, the last step, and at most once in between, e.g. "Dekho ${req.learner.name}, ..."). In all other steps do not use the name.` +
        (req.learner.instructions ? `\nTEACHING PREFERENCES FOR THIS LEARNER: ${req.learner.instructions}` : ""),
    );
  parts.push(`Book: ${req.bookTitle || "Untitled"}`);
  if (req.memory.length) {
    parts.push(`Previously taught in this session:\n${req.memory.map((m) => `- ${m}`).join("\n")}`);
  }
  if (req.mode === "doubt" && req.mainLesson) {
    parts.push(
      `MODE: doubt. The learner interrupted the lesson "${req.mainLesson.title}".\n` +
        `Board so far:\n${req.mainLesson.boardSoFar.map((b) => `- ${b}`).join("\n")}\n` +
        `Teacher was saying: "${req.mainLesson.currentSay}"`,
    );
    parts.push(`Learner's doubt: ${req.instruction || "(not specified, explain the current point more simply)"}`);
  } else {
    parts.push(`MODE: lesson.`);
    parts.push(
      req.instruction.trim()
        ? `Learner's instruction: ${req.instruction.trim()}`
        : `Learner's instruction: (none) Explain this clearly in Hinglish.`,
    );
  }
  if (looksNumerical(req))
    parts.push(
      "This is a NUMERICAL. You MUST include one or more \"solve\" steps (Given / Find / every arithmetic line / answer) that solve it completely. A plot alone is not enough.",
    );
  const text = ctx.text.length > MAX_CONTEXT_CHARS ? ctx.text.slice(0, MAX_CONTEXT_CHARS) + "\n[...truncated]" : ctx.text;
  const v = ctx.video;
  if (v) {
    const where = v.course && v.total && v.total > 1 ? ` This is class ${v.position} of ${v.total} in the course "${v.course}".` : "";
    parts.push(
      `SOURCE: a YouTube class "${v.title}".${where} Teach phase ${v.phase} of ${v.phases} (${fmt(v.start)} to ${fmt(v.end)}).` +
        (req.mode === "lesson"
          ? `
The video segment is attached. Watch ALL of it, from ${fmt(v.start)} to ${fmt(v.end)}, before writing.

YOUR JOB: re-teach this class completely, from the first minute of the segment to the last, so the learner does not need to watch the video at all.
- Follow the instructor's order. Cover EVERY concept, definition, formula, example, dataset, line of code, output and numerical in the segment. Never stop after the intro: the lesson must reach the end of the segment.
- Use 14-26 steps. Spread them over the whole segment (roughly one step per 30-60 seconds of real teaching).
- DATASETS: whenever a dataset / dataframe / CSV / table appears, recreate it with a "table" step: real column names and 3-6 real rows read from the screen. If the values are unreadable, build a realistic sample with the same columns and say "sample data". Then explain what each column means and what the task is.
- CODE: whenever code is typed or shown (Jupyter, editor), show it with "code" steps (the actual code, cleaned up, max ~18 lines per step; split long code into several steps) and explain each line in say: what it does and why. Mention the output it produced (shape, values, errors) with a write/table step.
- CLIPS: add 3-6 "clip" steps at moments worth seeing in the video (a chart, an output, a demo, a diagram). start/end are ABSOLUTE seconds in the video between ${Math.floor(v.start)} and ${Math.ceil(v.end)}. In say, tell the learner what to notice in that part of the video.
- Use diagrams for workflows (e.g. API -> JSON -> DataFrame -> SQL), formulas/solve steps for any maths, and plots where a curve helps.
- If something is only mentioned briefly, still explain it properly from scratch, as a teacher would.
- If earlier classes are listed under "Previously taught", connect to them explicitly ("pichli class mein humne ... dekha tha").
- Notes must be detailed and complete for revision: every key point, every formula, the code patterns used (as short readable lines), and tips.`
          : ""),
    );
    if (text) parts.push(`Extra context:\n"""\n${text}\n"""`);
  } else if (ctx.repo) {
    const r = ctx.repo;
    const where = r.phase && r.phases ? ` This is phase ${r.phase} of ${r.phases} of the repo walkthrough.` : "";
    const job: Record<string, string> = {
      overview:
        "Explain WHAT this project is, for a complete beginner: the problem it solves, who would use it, what it does step by step, the main technologies (and what each is, in one simple line), and how to run it if the README says. Use a diagram of the big picture. No code walkthrough yet.",
      structure:
        "Explain the FOLDER STRUCTURE like a map of a house: show it with one or more \"tree\" steps (with a short note per important item), then explain what lives where and why it is organised this way. Point out which parts are backend, frontend, config, data, tests, docs. Do not explain code yet.",
      entry:
        "Explain HOW THE APP RUNS: the entry point(s) (which file starts everything), dependencies/config files, and the request/data flow from start to end. Use a diagram for the flow and short code steps only for the key lines of the entry files.",
      area: `This is the OVERVIEW of the folder (every file inside gets its own detailed lesson next). Explain the \"${r.folder}\" part of the project: what this area is responsible for, its files (with a "tree" step), how its files work together, and how it connects to the rest of the project. Mention the key functions/components by name. Keep code to the most important lines.`,
      file: `Explain the single file \"${r.file}\" COMPLETELY. FIRST a plain-language summary: what this file does, why it exists, which feature of the app it powers, and where it fits (who calls it, what it calls). THEN walk through the WHOLE file from the first line to the last, in order, one "code" step per logical block (imports, each function, each class/method, each section, the main block). The file is given WITH LINE NUMBERS ("39| def spec_of..."): for every code step set startLine and endLine of that block (inclusive) and leave code empty; the app shows the exact real lines. Do not skip any function or block: if a FILE OUTLINE is given, every listed function/class gets its own code step in that order; for a long file use more steps (up to 30). In say explain each block AS A WHOLE, never line by line: what the block achieves, how it works in plain words (the idea, not a narration of each statement), its inputs and outputs, and which visible feature it affects. Start the lesson with a diagram of how this file connects to the rest (who calls it, what it calls, data in/out). End with a short recap of the file's contribution.`,
    };
    parts.push(
      `SOURCE: the GitHub repository ${r.owner}/${r.repo} (branch ${r.branch}).${where} Topic: "${r.title}".` +
        (req.mode === "lesson"
          ? `\nYOUR JOB: ${job[r.kind] ?? job.overview}\nTeach so that even a non-technical person gets it: simple Hinglish, everyday analogies, one idea per step, and name real files/folders from the repo. Use 10-20 steps.
ACCURACY RULES (strict):
- The material contains the COMPLETE file list. Only describe files/folders that appear in it; never invent one.
- Never say a folder has "only" some files or skip files when describing a folder: account for every item in it (group small helper files together if needed, e.g. "__init__.py, theme.py aur components.py chhote helper files hain").
- If you are not sure what a file does (its code is not in the material), say what its name/location suggests and that you are inferring, instead of stating it as fact.
- For "tree" steps always set folder to the real path so the board shows the real listing.`
          : ""),
    );
    if (text) parts.push(`Repository material:\n"""\n${text}\n"""`);
  } else
    parts.push(`Selected from the book (${ctx.kind}, ${ctx.label}, page ${ctx.page}):\n"""\n${text || "(no text layer, read the page image)"}\n"""`);
  if (ctx.image) parts.push("The page image is attached; use it to read formulas, figures and tables correctly.");
  parts.push(
    "REMINDER: the learner mainly LISTENS. Every step's say must be 4-6 full spoken sentences (60-100 words) that truly teach: meaning, why, how, an example, what to notice. Short one-line says are not acceptable. Keep board text short.",
  );
  return parts.join("\n\n");
}

const clean = (s: unknown, max: number): string => (typeof s === "string" ? s.trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const stripDollars = (s: string) => s.replace(/^\$+|\$+$/g, "");

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π",
  sigma: "σ", tau: "τ", phi: "φ", omega: "ω", eta: "η", nabla: "∇", Sigma: "Σ", Delta: "Δ", infty: "∞",
  times: "×", cdot: "·", pm: "±", leq: "≤", geq: "≥", neq: "≠", approx: "≈", rightarrow: "→", to: "→", sum: "Σ",
};
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", T: "ᵀ", n: "ⁿ", i: "ⁱ", "-": "⁻", "+": "⁺" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", i: "ᵢ", j: "ⱼ", n: "ₙ", t: "ₜ" };

/** Board text is handwritten plain text: turn any LaTeX that slipped in into readable math. */
export function readableMath(s: string): string {
  if (!/[\\^_{}$]/.test(s)) return s;
  const sup = (v: string) => ([...v].every((c) => SUP[c]) ? [...v].map((c) => SUP[c]).join("") : `^(${v})`);
  const sub = (v: string) => ([...v].every((c) => SUB[c]) ? [...v].map((c) => SUB[c]).join("") : `_${v}`);
  let t = s.replace(/\$/g, "");
  // Inner pieces first (powers, indices, text), so fractions with nested braces flatten too.
  for (let k = 0; k < 4; k++) {
    t = t
      .replace(/\^\{([^{}]*)\}/g, (m, v) => sup(v))
      .replace(/_\{([^{}]*)\}/g, (m, v) => sub(v))
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|left|right)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  }
  t = t
    .replace(/\\(left|right)\b/g, "")
    .replace(/\\([a-zA-Z]+)/g, (m, w) => GREEK[w] ?? w)
    .replace(/\^(\w)(?!\w)/g, (m, v) => sup(v))
    .replace(/_(\w)(?!\w)/g, (m, v) => sub(v))
    .replace(/[{}]/g, "");
  // Drop parentheses that fractions/roots added around a single token: (1)/(√2) -> 1/√2, √(2) -> √2
  for (let k = 0; k < 2; k++) {
    t = t
      .replace(/√\(([^()\s+\-*/=]+)\)/g, "√$1")
      .replace(/\(([^()\s+\-*/=]+)\)(?=\/)/g, "$1")
      .replace(/\/\(([^()\s+\-*/=]+)\)/g, "/$1");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

/** Narration goes to the voice: strip leftover LaTeX/markdown so it isn't read as symbols. */
function speakable(s: string): string {
  return s
    .replace(/\^\s*2\b/g, " square")
    .replace(/\^\s*3\b/g, " cube")
    .replace(/\\(alpha|beta|gamma|theta|eta|sigma|lambda|mu|pi|delta|nabla)\b/g, " $1 ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[$*_{}\\#`]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeNotes(raw: unknown): LessonNotes | undefined {
  const n = (raw ?? {}) as Record<string, unknown>;
  const notes: LessonNotes = {
    keyPoints: arr(n.keyPoints).map((s) => readableMath(clean(s, 300))).filter(Boolean).slice(0, 10),
    formulas: arr(n.formulas)
      .map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        return { latex: stripDollars(clean(o.latex, 300)), meaning: readableMath(clean(o.meaning, 300)) };
      })
      .filter((f) => f.latex)
      .slice(0, 8),
    example: arr(n.example).map((s) => readableMath(clean(s, 240))).filter(Boolean).slice(0, 14),
    tips: arr(n.tips).map((s) => readableMath(clean(s, 240))).filter(Boolean).slice(0, 5),
  };
  return notes.keyPoints.length || notes.formulas.length || notes.example.length ? notes : undefined;
}

/** Drop anything the board can't draw, so a sloppy response never crashes the player. */
export function sanitizeLesson(raw: unknown, kind: Lesson["kind"]): Lesson {
  const r = (raw ?? {}) as Record<string, unknown>;
  const steps: Step[] = [];
  for (const s0 of arr(r.steps).slice(0, 30)) {
    const s = (s0 ?? {}) as Record<string, unknown>;
    const type = s.type as StepType;
    if (!STEP_TYPES.includes(type)) continue;
    const step: Step = { type, say: speakable(clean(s.say, 1200)) };
    switch (type) {
      case "heading":
      case "write":
        step.text = readableMath(clean(s.text, 160));
        if (!step.text) continue;
        break;
      case "bullets":
        step.items = arr(s.items).map((i) => readableMath(clean(i, 100))).filter(Boolean).slice(0, 5);
        if (!step.items.length) continue;
        break;
      case "formula":
        step.latex = stripDollars(clean(s.latex, 400));
        step.text = readableMath(clean(s.text, 120));
        if (!step.latex) continue;
        break;
      case "diagram": {
        const nodes = arr(s.nodes)
          .map((n) => ({ id: clean((n as Record<string, unknown>)?.id, 30), label: clean((n as Record<string, unknown>)?.label, 26) }))
          .filter((n) => n.id && n.label)
          .slice(0, 7);
        const ids = new Set(nodes.map((n) => n.id));
        const edges = arr(s.edges)
          .map((e) => {
            const o = (e ?? {}) as Record<string, unknown>;
            return { from: clean(o.from, 30), to: clean(o.to, 30), label: clean(o.label, 16) || undefined };
          })
          .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
          .slice(0, 10);
        if (nodes.length < 2) continue;
        step.nodes = nodes;
        step.edges = edges;
        step.direction = s.direction === "column" ? "column" : "row";
        break;
      }
      case "callout":
        step.text = readableMath(clean(s.text, 220));
        step.tone = (["tip", "warning", "example", "analogy"] as const).includes(s.tone as never)
          ? (s.tone as Step["tone"])
          : "tip";
        if (!step.text) continue;
        break;
      case "highlight": {
        const t = Number(s.target);
        if (!Number.isInteger(t) || t < 0 || t >= steps.length || steps[t].type === "highlight") continue;
        step.target = t;
        break;
      }
      case "solve": {
        step.items = arr(s.items).map((i) => stripDollars(clean(i, 120))).filter(Boolean).slice(0, 6);
        step.text = readableMath(clean(s.text, 160));
        step.lines = arr(s.lines)
          .map((l) => {
            const o = (l ?? {}) as Record<string, unknown>;
            return { latex: stripDollars(clean(o.latex, 300)), note: readableMath(clean(o.note, 90)) || undefined };
          })
          .filter((l) => l.latex)
          .slice(0, 12);
        step.answer = stripDollars(clean(s.answer, 160));
        if (!step.lines.length) continue;
        if (!step.answer) {
          // Fall back to the last line's final "= value" so there is always a boxed result.
          const last = step.lines[step.lines.length - 1].latex;
          const lhs = last.split("=")[0].trim();
          const rhs = last.split("=").pop()!.trim();
          step.answer = lhs && rhs && lhs !== rhs ? `${lhs} = ${rhs}` : last;
        }
        break;
      }
      case "plot": {
        const fn = clean(s.fn, 120);
        let xMin = num(s.xMin) ?? -5;
        let xMax = num(s.xMax) ?? 5;
        if (xMax <= xMin) [xMin, xMax] = [Math.min(xMin, xMax) - 1, Math.max(xMin, xMax) + 1];
        if (!fn || !compileExpr(fn)) continue;
        step.fn = fn;
        step.xMin = xMin;
        step.xMax = xMax;
        step.points = arr(s.points)
          .map(num)
          .filter((v): v is number => v !== undefined && v >= xMin && v <= xMax)
          .slice(0, 8);
        step.xLabel = readableMath(clean(s.xLabel, 20));
        step.yLabel = readableMath(clean(s.yLabel, 20));
        step.text = readableMath(clean(s.text, 120));
        break;
      }
      case "network": {
        step.layers = arr(s.layers)
          .map((v) => Math.round(Number(v)))
          .filter((v) => v >= 1)
          .map((v) => Math.min(v, 8))
          .slice(0, 6);
        step.items = arr(s.items).map((i) => clean(i, 16)).slice(0, 6);
        if (step.layers.length < 2) continue;
        break;
      }
      case "matrix": {
        step.matrices = arr(s.matrices)
          .map((m) => {
            const o = (m ?? {}) as Record<string, unknown>;
            const rows = arr(o.rows)
              .map((row) => arr(row).map((c) => stripDollars(clean(String(c ?? ""), 80))).slice(0, 6))
              .filter((row) => row.length)
              .slice(0, 6);
            return { label: stripDollars(clean(o.label, 30)) || undefined, rows };
          })
          .filter((m) => m.rows.length)
          .slice(0, 3);
        step.ops = arr(s.ops).map((o) => stripDollars(clean(o, 10))).slice(0, 2);
        step.text = readableMath(clean(s.text, 120));
        if (!step.matrices.length) continue;
        break;
      }
      case "code": {
        // The code sometimes lands in another field (text/latex); take it from wherever it is.
        const rawCode = [s.code, s.text, s.latex].find((v) => typeof v === "string" && v.includes("\n")) ?? s.code ?? "";
        if (rawCode === s.text) s.text = "";
        const code = typeof rawCode === "string" ? rawCode.replace(/\t/g, "    ").replace(/\s+$/g, "") : "";
        const sl = Number(s.startLine);
        const el = Number(s.endLine);
        if (Number.isInteger(sl) && sl > 0) {
          step.startLine = sl;
          step.endLine = Number.isInteger(el) && el >= sl ? Math.min(el, sl + 60) : sl + 15;
        }
        const lines = code.split("\n").slice(0, 24).map((l) => l.slice(0, 110));
        step.code = lines.join("\n");
        step.language = clean(s.language, 20) || "python";
        step.text = readableMath(clean(s.text, 120));
        if (!step.code.trim() && !step.startLine) continue;
        break;
      }
      case "table": {
        step.columns = arr(s.columns).map((c) => clean(String(c ?? ""), 24)).slice(0, 8);
        step.rows = arr(s.rows)
          .map((row) => arr(row).map((c) => clean(String(c ?? ""), 28)).slice(0, 8))
          .filter((row) => row.length)
          .slice(0, 8);
        step.text = readableMath(clean(s.text, 120));
        if (!step.rows.length && !step.columns.length) continue;
        break;
      }
      case "tree": {
        if (typeof s.folder === "string") step.folder = s.folder.trim().replace(/^\.?\/+|\/+$/g, "").slice(0, 200);
        step.items = arr(s.items)
          .map((i) => (typeof i === "string" ? i.replace(/\t/g, "  ").replace(/\s+$/, "").slice(0, 90) : ""))
          .filter((i) => i.trim())
          .slice(0, 80);
        if (!step.items.length && step.folder === undefined) continue;
        break;
      }
      case "live": {
        step.path = typeof s.path === "string" ? s.path.trim().slice(0, 200) : "";
        step.text = readableMath(clean(s.text, 160));
        break;
      }
      case "video": {
        step.query = clean(s.query, 100);
        step.text = readableMath(clean(s.text, 140));
        if (!step.query) continue;
        break;
      }
      case "clip": {
        const start = num(s.start);
        let end = num(s.end);
        if (start === undefined || start < 0) continue;
        if (end === undefined || end <= start) end = start + 20;
        step.start = Math.floor(start);
        step.end = Math.ceil(Math.min(end, start + 90));
        step.text = readableMath(clean(s.text, 140));
        break;
      }
    }
    steps.push(step);
  }
  return {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title: clean(r.title, 80) || "Explanation",
    summary: clean(r.summary, 240),
    steps,
    notes: sanitizeNotes(r.notes),
  };
}

export class GeminiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/** Same request as generateLesson, shared with the streaming path. */
function buildRequestBody(req: LessonRequest) {
  const thinking = process.env.GEMINI_THINKING || (looksNumerical(req) ? "medium" : "low");
  const userParts: Record<string, unknown>[] = [{ text: buildUserPrompt(req) }];
  if (req.context.image) userParts.push({ inlineData: { mimeType: "image/jpeg", data: req.context.image } });
  const video = req.mode === "lesson" ? req.context.video : undefined;
  if (video)
    userParts.unshift({
      fileData: { fileUri: `https://www.youtube.com/watch?v=${video.id}` },
      // Half a frame per second keeps a 15-minute phase readable but within token limits.
      videoMetadata: { startOffset: `${Math.floor(video.start)}s`, endOffset: `${Math.ceil(video.end)}s`, fps: Number(process.env.GEMINI_VIDEO_FPS || 0.5) },
    });
  return JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      temperature: 0.6,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      ...(video ? { mediaResolution: process.env.GEMINI_VIDEO_RESOLUTION || "MEDIA_RESOLUTION_MEDIUM" } : {}),
      ...(thinking === "off" ? {} : { thinkingConfig: { thinkingLevel: video ? process.env.GEMINI_VIDEO_THINKING || "medium" : thinking } }),
    },
  });
}

export type StreamEvent =
  | { type: "meta"; id: string; kind: Lesson["kind"]; title: string }
  | { type: "step"; step: Step }
  | { type: "done"; title: string; summary: string; notes?: Lesson["notes"] }
  | { type: "error"; error: string; status: number };

/** Complete top-level objects inside the "steps" array of a partial JSON text. */
function completeStepObjects(text: string): string[] {
  const at = text.search(/"steps"\s*:\s*\[/);
  if (at < 0) return [];
  let i = text.indexOf("[", at) + 1;
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    } else if (c === "]" && depth === 0) break;
  }
  return out;
}

/**
 * Streams a lesson: each step is sent as soon as Gemini finishes writing it, so the board
 * can start in a few seconds instead of waiting for the whole lesson and its notes.
 */
export async function streamLesson(req: LessonRequest, emit: (e: StreamEvent) => void): Promise<void> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    emit({ type: "error", error: "GEMINI_API_KEY is missing. Add it to samjhado/.env.local and restart the dev server.", status: 400 });
    return;
  }
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const id = `${req.mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const body = buildRequestBody(req);
  let emitted = 0;
  let metaSent = false;

  // Deep video lessons: strong model, full response (a cut-off stream would lose most of the class).
  // Deep sources (YouTube classes, GitHub repos): strong model + full response, never a cut-off stream.
  if (req.mode === "lesson" && (req.context.video || req.context.repo)) {
    try {
      const lesson = await generateLesson(req);
      emit({ type: "meta", id, kind: lesson.kind, title: lesson.title });
      for (const st of lesson.steps) emit({ type: "step", step: st });
      emit({ type: "done", title: lesson.title, summary: lesson.summary, notes: lesson.notes });
    } catch (e) {
      emit({ type: "error", error: e instanceof Error ? e.message : String(e), status: e instanceof GeminiError ? e.status : 502 });
    }
    return;
  }

  const attempts = [model, model];
  let res: Response | null = null;
  for (let a = 0; a < attempts.length; a++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(attempts[a])}:streamGenerateContent?alt=sse`,
      { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body },
    );
    if (res.ok || (res.status !== 503 && res.status !== 500)) break;
    await new Promise((r) => setTimeout(r, 1000 * (a + 1)));
  }

  const fallback = async () => {
    // Streaming unavailable: use the regular (retrying, model-fallback) path and send it all at once.
    const lesson = await generateLesson(req);
    if (!metaSent) emit({ type: "meta", id, kind: lesson.kind, title: lesson.title });
    metaSent = true;
    for (const s of lesson.steps.slice(emitted)) emit({ type: "step", step: s });
    emit({ type: "done", title: lesson.title, summary: lesson.summary, notes: lesson.notes });
  };

  try {
    if (!res || !res.ok || !res.body) {
      if (res && res.status !== 503 && res.status !== 500 && res.status !== 429) {
        const t = await res.text();
        let msg = t.slice(0, 300);
        try {
          msg = JSON.parse(t)?.error?.message ?? msg;
        } catch {}
        emit({ type: "error", error: `Gemini error ${res.status}: ${msg}`, status: res.status });
        return;
      }
      await fallback();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let finishReason = "";
    const otherLines: string[] = [];
    const pump = () => {
      if (!metaSent) {
        const m = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) {
          metaSent = true;
          emit({ type: "meta", id, kind: req.mode, title: clean(JSON.parse(`"${m[1]}"`), 80) || "Explanation" });
        }
      }
      const raws = completeStepObjects(text);
      if (raws.length > emitted) {
        const parsed = raws.map((r) => {
          try {
            return JSON.parse(r);
          } catch {
            return null;
          }
        });
        // Re-sanitize from the start so rules that look back (highlight targets) stay consistent.
        const steps = sanitizeLesson({ steps: parsed.filter(Boolean) }, req.mode).steps;
        if (!metaSent && steps.length) {
          metaSent = true;
          emit({ type: "meta", id, kind: req.mode, title: "Explanation" });
        }
        for (const s of steps.slice(emitted)) emit({ type: "step", step: s });
        emitted = Math.max(emitted, steps.length);
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) {
          if (line) otherLines.push(line.slice(0, 200));
          continue;
        }
        try {
          const j = JSON.parse(line.slice(5));
          text += j?.candidates?.[0]?.content?.parts?.map((p: { text?: string; thought?: boolean }) => (p.thought ? "" : (p.text ?? ""))).join("") ?? "";
          if (j?.candidates?.[0]?.finishReason) finishReason = j.candidates[0].finishReason;
        } catch (err) {
          if (process.env.SAMJHADO_DEBUG) console.log("[stream] bad line", line.length, String(err).slice(0, 80));
        }
      }
      pump();
    }
    pump();
    // An overload error can arrive mid-stream (as non-data lines) and end the stream early.
    const streamError = !finishReason && otherLines.some((l) => /"code"|error/i.test(l));
    if (streamError && !emitted) {
      await fallback();
      return;
    }
    // Stream ended early after some steps: tell the learner instead of silently showing half a lesson.
    if (!finishReason && emitted) {
      emit({ type: "error", error: "Gemini beech mein ruk gaya, lesson adhoora reh gaya. Dobara try karo.", status: 502 });
      return;
    }

    let full: Lesson | null = null;
    try {
      full = sanitizeLesson(JSON.parse(text), req.mode);
    } catch {}
    if (!full || (!emitted && !full.steps.length)) {
      if (!emitted) {
        await fallback();
        return;
      }
    }
    if (full) for (const s of full.steps.slice(emitted)) emit({ type: "step", step: s });
    emit({ type: "done", title: full?.title ?? "Explanation", summary: full?.summary ?? "", notes: full?.notes });
  } catch (e) {
    if (!emitted) {
      try {
        await fallback();
        return;
      } catch (e2) {
        e = e2;
      }
    }
    emit({ type: "error", error: e instanceof Error ? e.message : String(e), status: e instanceof GeminiError ? e.status : 502 });
  }
}

/** Models tried in order. YouTube classes use stronger models (slower, but they read code/tables). */
function modelChain(req: LessonRequest): string[] {
  const env = (v?: string) => (v ? v.split(",").map((m) => m.trim()).filter(Boolean) : null);
  const fast = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest";
  if (req.mode === "lesson" && (req.context.video || req.context.repo))
    return env(process.env.GEMINI_VIDEO_MODELS) ?? ["gemini-3-flash-preview", "gemini-3.5-flash", fallback, fast];
  return [fast, fast, fallback];
}

export async function generateLesson(req: LessonRequest): Promise<Lesson> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is missing. Add it to samjhado/.env.local and restart the dev server.", 400);
  const body = buildRequestBody(req);
  const models = modelChain(req);
  const isVideo = req.mode === "lesson" && !!(req.context.video || req.context.repo);
  // Retry overloads / quota / timeouts on the next model in the chain.
  let res: Response | null = null;
  let used = models[0];
  const isVideoSource = req.mode === "lesson" && !!req.context.video;
  for (let a = 0; a < models.length; a++) {
    used = models[a];
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(used)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(isVideo ? 240_000 : 120_000),
      });
    } catch {
      res = null; // timed out: try the next model
      continue;
    }
    if (res.ok) break;
    // Some models refuse very long YouTube videos (400 "invalid argument") while others accept
    // them, so for video lessons a 400 also moves on to the next model.
    const retryable = [429, 500, 503, 504].includes(res.status) || (isVideoSource && res.status === 400);
    if (!retryable || a === models.length - 1) break;
    if (res.status !== 400) await new Promise((r) => setTimeout(r, 800 * (a + 1)));
  }
  if (!res) throw new GeminiError("Gemini is too busy right now (timed out). Try again in a minute.", 504);
  if (!res.ok && res.status === 400 && isVideoSource)
    throw new GeminiError(
      "Gemini is video ko process nahi kar pa raha (koi bhi model accept nahi kar raha — video bahut lambi ya restricted ho sakti hai). Thodi der baad try karo, ya isi course ki chhoti video try karo.",
      400,
    );
  return parseLessonResponse(res, used, req);
}

async function parseLessonResponse(res: Response, model: string, req: LessonRequest): Promise<Lesson> {
  if (!res.ok) {
    const body = await res.text();
    let msg = body.slice(0, 300);
    try {
      msg = JSON.parse(body)?.error?.message ?? msg;
    } catch {}
    if (res.status === 404) msg = `Model "${model}" not found. Set GEMINI_MODEL in .env.local. (${msg})`;
    throw new GeminiError(`Gemini error ${res.status}: ${msg}`, res.status === 429 ? 429 : 502);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError(`Gemini returned no content (${data?.candidates?.[0]?.finishReason ?? "unknown"})`, 502);
  if (process.env.SAMJHADO_DEBUG) {
    const fr = data?.candidates?.[0]?.finishReason;
    const line = `[lesson] model=${data?.modelVersion} finish=${fr} chars=${text.length}\n${text}\n-----\n`;
    if (process.env.SAMJHADO_DEBUG_FILE) (await import("node:fs")).appendFileSync(process.env.SAMJHADO_DEBUG_FILE, line);
    else console.log(line.slice(0, 4000));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned invalid JSON. Try again.", 502);
  }
  const lesson = sanitizeLesson(parsed, req.mode);
  fillCodeFromSource(lesson, req.context.text);
  if (lesson.steps.length === 0) throw new GeminiError("Gemini returned an empty lesson. Try again.", 502);
  return lesson;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Repo file lessons: Gemini only names line ranges; copy the exact lines from the numbered file
 * in the material ("39| def spec_of(...)"), so the board always shows the real code.
 */
function fillCodeFromSource(lesson: Lesson, material: string) {
  const numbered = new Map<number, string>();
  for (const line of material.split("\n")) {
    const m = line.match(/^\s*(\d+)\| ?(.*)$/);
    if (m) numbered.set(Number(m[1]), m[2]);
  }
  lesson.steps = lesson.steps.filter((s) => {
    if (s.type !== "code" || !s.startLine) return true;
    if (!numbered.size) return !!s.code?.trim();
    const out: string[] = [];
    for (let n = s.startLine; n <= (s.endLine ?? s.startLine); n++) {
      const l = numbered.get(n);
      if (l !== undefined) out.push(l);
    }
    // trim blank edges
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    if (out.length) {
      s.code = out.join("\n");
      s.text = s.text ? `${s.text} · lines ${s.startLine}-${s.endLine}` : `lines ${s.startLine}-${s.endLine}`;
      return true;
    }
    return !!s.code?.trim();
  });
}
