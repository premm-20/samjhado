// Shared lesson types: the whiteboard script Gemini writes and the board plays.

export type StepType =
  | "heading"
  | "write"
  | "bullets"
  | "formula"
  | "diagram"
  | "callout"
  | "highlight"
  | "solve"
  | "plot"
  | "network"
  | "matrix"
  | "code"
  | "table"
  | "clip"
  | "tree"
  | "video"
  | "live";

export interface DiagramNode {
  id: string;
  label: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface SolveLine {
  latex: string;
  note?: string;
}

export interface MatrixBlock {
  label?: string;
  rows: string[][];
}

export interface Step {
  type: StepType;
  /** What the teacher says while drawing this step (Hinglish by default). */
  say: string;
  text?: string;
  items?: string[];
  latex?: string;
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  direction?: "row" | "column";
  tone?: "tip" | "warning" | "example" | "analogy";
  /** highlight: index of an earlier step to circle again. */
  target?: number;
  /** solve: worked lines and the final answer (items = given, text = find). */
  lines?: SolveLine[];
  answer?: string;
  /** plot: y = fn(x) over [xMin, xMax]; points = x positions a dot visits in order. */
  fn?: string;
  xMin?: number;
  xMax?: number;
  points?: number[];
  xLabel?: string;
  yLabel?: string;
  /** network: neurons per layer, optional layer labels in items. */
  layers?: number[];
  /** matrix: blocks with operators between them. */
  matrices?: MatrixBlock[];
  ops?: string[];
  /** code: source shown on the board, typed line by line. */
  code?: string;
  language?: string;
  /** code (repo files): the block's line range in the real file; the app fills the code from it. */
  startLine?: number;
  endLine?: number;
  /** table: a dataset / dataframe sample. */
  columns?: string[];
  rows?: string[][];
  /** clip: a moment in the YouTube video (seconds) the player jumps to. */
  start?: number;
  end?: number;
  /** tree: the real repo folder to draw ("" = root); items then only carry notes. */
  folder?: string;
  /** live: page/route of the learner's running app to show ("" = home). */
  path?: string;
  /** video: a YouTube search query; the board finds and embeds a matching video. */
  query?: string;
}

export interface LessonNotes {
  keyPoints: string[];
  formulas: { latex: string; meaning: string }[];
  example: string[];
  tips: string[];
}

export interface Lesson {
  id: string;
  kind: "lesson" | "doubt";
  title: string;
  /** One-line memory of what was taught; sent with later requests so lessons connect. */
  summary: string;
  steps: Step[];
  notes?: LessonNotes;
}

/** What the learner picked in the book. */
export interface VideoSegment {
  id: string;
  title: string;
  start: number;
  end: number;
  /** "Phase 2 of 5" style labels and playlist position, for the prompt. */
  phase: number;
  phases: number;
  course?: string;
  position?: number;
  total?: number;
}

export interface RepoTopic {
  owner: string;
  repo: string;
  branch: string;
  /** "overview" | "structure" | "entry" | "area" | "file" */
  kind: string;
  title: string;
  folder?: string;
  file?: string;
  phase?: number;
  phases?: number;
}

export interface BookContext {
  kind: "selection" | "page" | "chapter" | "video" | "repo";
  /** GitHub lessons: which repo and which part of it. */
  repo?: RepoTopic;
  /** video lessons: which part of which YouTube video to teach. */
  video?: VideoSegment;
  label: string;
  text: string;
  page: number;
  /** Optional JPEG of the page (base64, no prefix) so Gemini can read formulas and figures. */
  image?: string;
}

export interface LessonRequest {
  mode: "lesson" | "doubt";
  bookTitle: string;
  context: BookContext;
  instruction: string;
  memory: string[];
  /** doubt mode: what the main lesson is about and where it was paused. */
  mainLesson?: { title: string; boardSoFar: string[]; currentSay: string };
}
