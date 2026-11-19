# SamjhaDo

Upload a book (PDF), highlight anything you don't understand, and an AI teacher explains it on a whiteboard in Hinglish — speaking out loud while an animated pointer writes, draws, animates graphs and networks, and solves numericals step by step. Every lesson also produces notebook-ready notes.

## Run on another laptop (Windows)

1. Install **Node.js LTS** (https://nodejs.org) and **Git** (https://git-scm.com).
2. Clone the repo, e.g. into Desktop:
   `git clone <your repo URL> samjhado`
3. Open the `samjhado` folder and double-click **setup-desktop.cmd**: it puts a **SamjhaDo** start button on the Desktop.
4. Double-click **SamjhaDo** on the Desktop. The first time it installs everything (1-3 min) and asks for your Gemini API key once (saved in `.env.local`, never committed). After that it just starts the app and opens Chrome.

`start.cmd` starts a self-restarting server (`serve.cmd`) in a minimized "SamjhaDo server" window; close that window to stop SamjhaDo. Course progress, notes and memory are saved per browser, so each laptop keeps its own.

## Run (developer)

```bash
npm install
# put your key in .env.local:  GEMINI_API_KEY=...
npm run dev
```

Open http://localhost:3000. "Demo lesson dekho" works without a key.

## Learners: Aarohi & Prem

- Pick who is learning on the home page ("Kaun padh raha hai?") or in the top bar.
- Each learner has their own course progress, memory, voice choice and live-app URL (saved in the browser). Switching learner switches all of it.
- The teacher addresses the learner by name a couple of times per lesson.
- Teaching style: `src/lib/profiles.ts`. `SHARED_INSTRUCTIONS` applies to both; add anything person-specific to that learner’s `extra` (empty today, so both are taught the same way).

## How it works

- **Highlight → Samjhao.** Select text and a single **Samjhao →** pill grows out of it. Click it: the text stays marked in the book, an arrow stretches to the board, and the lesson starts. The selection also lands in the composer, so you can type or speak a specific instruction instead. Pages have "Is page ko samjhao"; chapters in Contents have "Select".
- **Teacher voice.** Each step is spoken in Hinglish (Gemini TTS) while it is drawn; the board waits for the sentence to finish. Mute with the speaker button. Falls back to the browser's voice if Gemini's voice quota runs out.
- **Live animations.** `plot` (any function, with a dot walking through iterations), `network` (neurons + forward pass), `matrix` (matrix maths), `diagram` (flows).
- **Numericals.** `solve` steps show Given / Find, every arithmetic line with a reason, and a boxed answer. Numericals get extra thinking so the arithmetic is checked.
- **Notes.** The **Notes** button opens a ruled notebook with key points, formulas, worked examples and exam tips for every lesson and doubt. Copy as Markdown, download `.md`, or print / save as PDF.
- **Interrupt anytime.** Type or tap the mic during a lesson: it pauses, your doubt opens on a violet board, then you return to the main lesson where you left off.
- **Memory.** Each lesson's summary is sent with later requests so explanations connect (current session).

## YouTube

- Paste a **video** or **playlist** link on the home page.
- **Playlist:** every video is a class, taught in order (all pages of the playlist are read, e.g. 153 videos).
- **Long video:** split into ~15-minute **phases** (a 10-hour video = 40 phases); each phase is one whiteboard lesson. Gemini watches exactly that time range of the video (low resolution to save tokens).
- **"Agla phase samjhao"** always picks the next unexplained phase; ticks and a progress bar show what's done.
- **Course memory:** summaries of earlier classes are saved in the browser (per playlist/video) and sent with later lessons, so linked classes recall each other ("pichli class mein…"). Progress survives a page reload.
- **Deep mode:** a stronger model watches each phase at a resolution where code and tables are readable and re-teaches the whole segment start to end (about 1-2 minutes): `code` steps for the code typed in the video, `table` steps for datasets (real values read from the screen), and `clip` steps that jump the player to the exact frame being explained (▶ plays that part).
- Doubts mid-lesson work as usual (they reuse the board, not the video, to save quota).
- Only public videos work. Google's free tier also caps how much YouTube video Gemini can process per day, so very long courses may take several days on the free tier.

## GitHub repos

- Paste a public repo link (github.com/owner/repo) in the same box on the home page.
- **Phases** tab: (1) what the project is, from the README; (2) the folder map, drawn as folder trees with a note per item; (3) the entry point and how the app runs; then one phase per main folder (backend, frontend, tests…). "Agla phase samjhao" goes in order; progress and memory are saved per repo.
- **Full coverage:** after each folder overview, every teachable file inside it (sub-folders included) is its own lesson, in order; look-alike generated files (e.g. the same metrics.json per dataset) are taught once with the others named. Code blocks on the board are copied from the real file by line range, and the file outline (every function/class) is given to Gemini so none is skipped.
- **Live app (optional):** type where your project runs (e.g. http://localhost:8501) in the repo header; lessons then add "Live app mein dekho" cards that open the exact page a block of code powers.
- **Files** tab: browse or search the tree, open any file with line numbers, and press **"Is file ko samjhao"**: first a plain summary of what the file does and where it fits, then a walk through the code block by block.
- Uses the public GitHub API (60 calls/hour without a token; set `GITHUB_TOKEN` in .env.local for more).

## Video references

Any lesson can include a "Ye video bhi dekho" card: Gemini writes a search query, the app finds real YouTube results (no made-up links), and the video plays inline (the lesson pauses). "Dusra video" shows the next result.

## Gemini free-tier limits (seen in testing)

| What | Limit | What the app does |
| --- | --- | --- |
| Lesson model `gemini-flash-lite-latest` | fast (~3–8 s); sometimes 503 "high demand" | retries, then falls back to `gemini-flash-latest` (slower) |
| Voice (TTS) | 3 requests/min and 10/day **per model** | 2 requests per lesson; chains `gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts` → `gemini-2.5-flash-preview-tts`; then browser voice |

Enabling billing in Google AI Studio removes these limits.

## Env

| Var | Default |
| --- | --- |
| `GEMINI_API_KEY` | required |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` |
| `GEMINI_FALLBACK_MODEL` | `gemini-flash-latest` |
| `GEMINI_VIDEO_MODELS` | `gemini-3-flash-preview,gemini-3.5-flash,gemini-flash-latest,gemini-flash-lite-latest` (YouTube classes, tried in order) |
| `GEMINI_VIDEO_RESOLUTION` / `GEMINI_VIDEO_FPS` / `GEMINI_VIDEO_THINKING` | `MEDIA_RESOLUTION_MEDIUM` / `0.5` / `medium` |
| `GEMINI_THINKING` | `low` (numericals: `medium`); `off`, `medium`, `high` |
| `GEMINI_TTS_MODEL` | the chain above (comma-separated to override) |
| `GEMINI_TTS_VOICE` | `Sulafat` (warm female; also pickable in the app) |

## Code map

| Path | What |
| --- | --- |
| `src/lib/gemini.ts` | Teaching prompt, JSON schema, sanitizer, retries |
| `src/lib/mathExpr.ts` | Safe expression parser for plots (no eval) |
| `src/lib/voice.ts` | Voice player: chunked TTS, splits audio into steps by silence |
| `src/app/api/lesson/route.ts` | Lesson endpoint |
| `src/app/api/tts/route.ts` | Voice endpoint with model fallback |
| `src/components/board/` | Whiteboard player and step renderers (`elements.tsx`, `elements2.tsx`) |
| `src/components/PdfPane.tsx` | PDF viewer, Samjhao pill, highlight marks |
| `src/components/VideoPane.tsx` | YouTube player, classes, phases, progress |
| `src/app/api/yt/route.ts` | Reads public video/playlist info (titles, durations, order) |
| `src/lib/youtube.ts` | Link parsing, phase splitting |
| `src/components/NotesPanel.tsx` | Notebook notes + export |
| `src/components/Composer.tsx` | Type / voice input, lesson vs doubt |
| `src/components/Workspace.tsx` | App state, layout, book-to-board arrow, shortcuts |
