"use client";
// The repo currently open, so board elements (folder trees) can draw from the REAL file list
// instead of trusting what the model typed.
import { isInteresting, type RepoEntry } from "./github";

let current: RepoEntry[] | null = null;

export function setRepoTree(tree: RepoEntry[] | null) {
  current = tree;
}

export interface FolderChild {
  name: string;
  path: string;
  dir: boolean;
  /** For folders: how many files are inside (any depth). */
  files: number;
}

/** Every direct child of a folder ("" = repo root), folders first. Null when no repo is open. */
export function folderChildren(folder: string): FolderChild[] | null {
  if (!current) return null;
  const base = folder.replace(/^\/+|\/+$/g, "");
  const prefix = base ? base + "/" : "";
  const map = new Map<string, FolderChild>();
  for (const e of current) {
    if (!e.path.startsWith(prefix) || !isInteresting(e.path)) continue;
    const rest = e.path.slice(prefix.length);
    if (!rest) continue;
    const [first, ...more] = rest.split("/");
    const dir = more.length > 0 || e.type === "tree";
    const key = first;
    const hit = map.get(key) ?? { name: first, path: prefix + first, dir, files: 0 };
    hit.dir = hit.dir || dir;
    if (e.type === "blob" && more.length > 0) hit.files++;
    map.set(key, hit);
  }
  if (base && !current.some((e) => e.path === base || e.path.startsWith(prefix))) return null;
  return [...map.values()].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

/* Where the learner is running the project (e.g. http://localhost:8501), for "live" board steps. */
let liveUrl: string | null = null;
export function setLiveUrl(url: string | null) {
  liveUrl = url ? url.replace(/\/+$/, "") : null;
}
export function getLiveUrl(): string | null {
  return liveUrl;
}
