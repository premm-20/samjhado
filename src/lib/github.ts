// Shared GitHub helpers (client + server): link parsing, repo phases, key-file detection.

export interface RepoEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface RepoSource {
  owner: string;
  repo: string;
  branch: string;
  description: string;
  language: string;
  stars: number;
  readme: string;
  tree: RepoEntry[];
  truncated: boolean;
}

/** One teaching phase of a repo walkthrough. */
export interface RepoPhase {
  key: string;
  title: string;
  kind: "overview" | "structure" | "entry" | "area" | "file";
  /** area phases: the folder this phase explains. */
  folder?: string;
  /** file phases: the file, its top-level group, and look-alike files taught together with it. */
  similar?: string[];
  file?: string;
  group?: string;
}

export function parseGitHubUrl(raw: string): { owner: string; repo: string; branch?: string; path?: string } | null {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^www\./, "") !== "github.com") return null;
  const [owner, repo, kind, branch, ...rest] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  return {
    owner,
    repo: repo.replace(/\.git$/, ""),
    branch: kind === "tree" || kind === "blob" ? branch : undefined,
    path: rest.length ? rest.join("/") : undefined,
  };
}

const IGNORE = /(^|\/)(node_modules|\.git|dist|build|out|\.next|__pycache__|\.venv|venv|env|coverage|\.idea|\.vscode|vendor|target|\.cache|\.pytest_cache|\.mypy_cache|site-packages)(\/|$)/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|bmp|pdf|zip|gz|tar|7z|rar|mp3|mp4|wav|mov|avi|woff2?|ttf|eot|otf|pyc|so|dll|exe|bin|pt|pth|h5|onnx|pkl|joblib|npy|npz|parquet|db|sqlite|lock)$/i;

export function isInteresting(path: string): boolean {
  return !IGNORE.test(path);
}

export function isReadable(path: string): boolean {
  return !BINARY.test(path) && isInteresting(path);
}

/** Files that usually reveal how a project starts and what it depends on. */
const ENTRY_HINTS = [
  /^package\.json$/,
  /^requirements\.txt$/,
  /^pyproject\.toml$/,
  /^setup\.py$/,
  /^Dockerfile$/,
  /^docker-compose\.ya?ml$/,
  /^go\.mod$/,
  /^Cargo\.toml$/,
  /^pom\.xml$/,
  /^(src\/)?(main|app|index|server|manage|cli|run)\.(py|js|ts|tsx|jsx|go|rs|java)$/,
  /^(app|api|server|backend)\/(main|app|index|server)\.(py|js|ts)$/,
  /^src\/app\/(page|layout)\.(tsx|jsx)$/,
  /^(app|src)\/(__init__|main)\.py$/,
  /^streamlit_app\.py$/,
  /^vercel\.json$/,
  /^next\.config\.(js|ts|mjs)$/,
  /^vite\.config\.(js|ts)$/,
];

export function entryFiles(tree: RepoEntry[]): string[] {
  const files = tree.filter((e) => e.type === "blob" && isReadable(e.path)).map((e) => e.path);
  const hits: string[] = [];
  for (const re of ENTRY_HINTS) for (const f of files) if (re.test(f) && !hits.includes(f)) hits.push(f);
  return hits.slice(0, 8);
}

/** Top-level folders worth a phase each, biggest first, kept in a sensible order. */
export function mainFolders(tree: RepoEntry[], limit = 6): string[] {
  const count = new Map<string, number>();
  for (const e of tree) {
    if (e.type !== "blob" || !isInteresting(e.path) || !e.path.includes("/")) continue;
    const top = e.path.split("/")[0];
    if (top.startsWith(".")) continue;
    count.set(top, (count.get(top) ?? 0) + 1);
  }
  // A single "src" folder with sub-areas: use its sub-folders instead.
  if (count.size === 1 && count.has("src")) {
    const sub = new Map<string, number>();
    for (const e of tree) {
      const m = e.type === "blob" && e.path.match(/^src\/([^/]+)\//);
      if (m) sub.set(`src/${m[1]}`, (sub.get(`src/${m[1]}`) ?? 0) + 1);
    }
    if (sub.size > 1) return [...sub.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
  }
  return [...count.entries()]
    .filter(([, n]) => n >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/** Files worth a full lesson: readable source/config/docs, not noise (licences, lockfiles, huge data dumps). */
export function isTeachable(e: RepoEntry): boolean {
  if (e.type !== "blob" || !isReadable(e.path)) return false;
  const name = e.path.split("/").pop()!.toLowerCase();
  if (name.startsWith(".") && !/^\.env\.example$/.test(name)) return false;
  if (/^(license|licence|copying|notice)(\.|$)/.test(name)) return false;
  if (/\.(csv|tsv|jsonl|log|txt)$/.test(name) && (e.size ?? 0) > 60_000) return false;
  return (e.size ?? 0) <= 200_000;
}

/**
 * The full course for a repo: overview, folder map, entry/flow, then for every top-level folder
 * an overview followed by EVERY teachable file inside it (sub-folders included, in path order),
 * and finally the root-level files. "Agla phase" walks this list from start to end.
 */
export function repoPhases(src: RepoSource): RepoPhase[] {
  const phases: RepoPhase[] = [
    { key: "overview", title: "Ye project kya hai (README)", kind: "overview" },
    { key: "structure", title: "Folder structure ka naksha", kind: "structure" },
    { key: "entry", title: "Entry point & flow: app kaise chalta hai", kind: "entry" },
  ];
  const teachable = src.tree.filter(isTeachable).map((e) => e.path);
  const byPath = (a: string, b: string) => {
    // folder-wise: files of a folder before its sub-folders' files
    const da = a.split("/").slice(0, -1).join("/");
    const db = b.split("/").slice(0, -1).join("/");
    return da === db ? a.localeCompare(b) : da.localeCompare(db);
  };
  // Generated look-alikes (e.g. reports/FD001/metrics.json … reports/UCI/metrics.json): teach one,
  // list the others with it, so the course doesn't repeat the same lesson 8 times.
  const sigOf = (p: string) => {
    const parts = p.split("/");
    return parts.length >= 3 ? [...parts.slice(0, -2), "*", parts[parts.length - 1]].join("/") : p;
  };
  const bySig = new Map<string, string[]>();
  for (const p of teachable.sort(byPath)) bySig.set(sigOf(p), [...(bySig.get(sigOf(p)) ?? []), p]);
  const similarOf = new Map<string, string[]>();
  const hidden = new Set<string>();
  for (const list of bySig.values()) {
    if (list.length < 3) continue;
    similarOf.set(list[0], list.slice(1));
    list.slice(1).forEach((p) => hidden.add(p));
  }
  const filePhase = (p: string, title: string, group: string): RepoPhase => {
    const sim = similarOf.get(p);
    return {
      key: `file:${p}`,
      title: sim ? `${title}  (+${sim.length} same type)` : title,
      kind: "file",
      file: p,
      group,
      ...(sim ? { similar: sim } : {}),
    };
  };
  for (const folder of mainFolders(src.tree, 50)) {
    phases.push({ key: `area:${folder}`, title: `${folder}/ folder`, kind: "area", folder, group: folder });
    for (const p of teachable.filter((t) => t.startsWith(folder + "/") && !hidden.has(t)).sort(byPath))
      phases.push(filePhase(p, p.slice(folder.length + 1), folder));
  }
  const covered = new Set(phases.filter((p) => p.file).map((p) => p.file));
  const rest = teachable.filter((t) => !covered.has(t) && !hidden.has(t)).sort(byPath);
  for (const p of rest) phases.push(filePhase(p, p, "(root files)"));
  return phases;
}

/** Indented text tree (folders first), trimmed for prompts and the board. */
export function treeText(tree: RepoEntry[], root = "", maxLines = 160): string {
  const lines: string[] = [];
  const entries = tree.filter((e) => isInteresting(e.path) && (!root || e.path === root || e.path.startsWith(root + "/")));
  const sorted = entries.sort((a, b) => a.path.localeCompare(b.path));
  for (const e of sorted) {
    const rel = root ? e.path.slice(root.length + 1) : e.path;
    if (!rel) continue;
    const depth = rel.split("/").length - 1;
    if (depth > 3) continue;
    lines.push(`${"  ".repeat(depth)}${rel.split("/").pop()}${e.type === "tree" ? "/" : ""}`);
    if (lines.length >= maxLines) {
      lines.push("  …");
      break;
    }
  }
  return lines.join("\n");
}

/** Exact, complete list of what is inside a folder (direct children with file counts, then every file path). */
export function completeListing(tree: RepoEntry[], folder: string, maxFiles = 400): string {
  const base = folder.replace(/^\/+|\/+$/g, "");
  const prefix = base ? base + "/" : "";
  const files = tree.filter((e) => e.type === "blob" && e.path.startsWith(prefix) && isInteresting(e.path)).map((e) => e.path);
  const children = new Map<string, { dir: boolean; files: number }>();
  for (const f of files) {
    const [first, ...more] = f.slice(prefix.length).split("/");
    const c = children.get(first) ?? { dir: more.length > 0, files: 0 };
    c.dir = c.dir || more.length > 0;
    c.files++;
    children.set(first, c);
  }
  for (const e of tree) {
    if (e.type !== "tree" || !e.path.startsWith(prefix) || !isInteresting(e.path)) continue;
    const first = e.path.slice(prefix.length).split("/")[0];
    if (first && !children.has(first)) children.set(first, { dir: true, files: 0 });
  }
  const kids = [...children.entries()].sort((a, b) => Number(b[1].dir) - Number(a[1].dir) || a[0].localeCompare(b[0]));
  const head = `COMPLETE contents of ${base || "the repo root"}/ — ${kids.length} direct items, ${files.length} files in total:\n` +
    kids.map(([n, c]) => `- ${n}${c.dir ? `/  (folder, ${c.files} files)` : ""}`).join("\n");
  const all = files.slice(0, maxFiles).map((f) => `  ${f}`).join("\n");
  return `${head}\n\nEvery file path inside (${files.length}${files.length > maxFiles ? `, first ${maxFiles} shown` : ""}):\n${all}`;
}

/** Progress key for a repo lesson (phase or single file). */
export function repoTopicKey(t: { kind: string; folder?: string; file?: string }): string {
  if (t.kind === "file") return `file:${t.file}`;
  if (t.kind === "area") return `area:${t.folder}`;
  return t.kind;
}

export function rawUrl(src: Pick<RepoSource, "owner" | "repo" | "branch">, path: string): string {
  return `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${encodeURIComponent(src.branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
