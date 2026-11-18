// Reads a public GitHub repo: metadata, README, full file tree, and single file contents.
// Works without a token (60 API calls/hour); set GITHUB_TOKEN in .env.local for more.
import { parseGitHubUrl, rawUrl, type RepoEntry, type RepoSource } from "@/lib/github";

const headers = (): Record<string, string> => ({
  accept: "application/vnd.github+json",
  "user-agent": "samjhado-app",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (res.status === 404) throw new Error("Repo nahi mila. Link check karo, aur repo public hona chahiye.");
  if (res.status === 403 || res.status === 429) throw new Error("GitHub ki free limit (60/hour) khatam. Thodi der baad try karo, ya GITHUB_TOKEN set karo.");
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json() as Promise<T>;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; file?: { owner: string; repo: string; branch: string; path: string } };

  // Single file contents (for the code viewer and file lessons).
  if (body.file) {
    const { owner, repo, branch, path } = body.file;
    const res = await fetch(rawUrl({ owner, repo, branch }, path));
    if (!res.ok) return Response.json({ error: `File nahi mili (${res.status})` }, { status: 502 });
    const text = await res.text();
    return Response.json({ path, content: text.slice(0, 200_000), truncated: text.length > 200_000 });
  }

  const parsed = parseGitHubUrl(String(body.url ?? ""));
  if (!parsed) return Response.json({ error: "Ye GitHub repo ka link nahi lag raha (github.com/owner/repo)." }, { status: 400 });
  try {
    const meta = await gh<{ default_branch: string; description: string | null; language: string | null; stargazers_count: number; full_name: string }>(
      `/repos/${parsed.owner}/${parsed.repo}`,
    );
    const branch = parsed.branch ?? meta.default_branch;
    const [treeRes, readme] = await Promise.all([
      gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
        `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      ),
      fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, { headers: { ...headers(), accept: "application/vnd.github.raw" } })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
    ]);
    const tree: RepoEntry[] = treeRes.tree
      .filter((e) => e.type === "blob" || e.type === "tree")
      .slice(0, 6000)
      .map((e) => ({ path: e.path, type: e.type as RepoEntry["type"], size: e.size }));
    const source: RepoSource = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      description: meta.description ?? "",
      language: meta.language ?? "",
      stars: meta.stargazers_count ?? 0,
      readme: readme.slice(0, 40_000),
      tree,
      truncated: treeRes.truncated,
    };
    return Response.json({ source });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "GitHub se padh nahi paya" }, { status: 502 });
  }
}
