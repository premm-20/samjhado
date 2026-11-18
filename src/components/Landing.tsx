"use client";
import { motion } from "motion/react";
import { ArrowRight, Hand, Loader2, Maximize2, MessageCircleQuestion, Mic, MousePointerClick, PlayCircle, Upload } from "lucide-react";
import type { YtSource } from "@/lib/youtube";
import { parseGitHubUrl, type RepoSource } from "@/lib/github";
import { friendlyError } from "@/lib/errors";
import { useState } from "react";

const ease = [0.23, 1, 0.32, 1] as const;

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`relative grid place-items-center rounded-[10px] bg-[var(--accent)] text-ink ${small ? "size-7" : "size-9"}`}>
        <svg viewBox="0 0 24 24" className={small ? "size-4" : "size-5"}>
          <path d="M4 17 C 7 9, 10 19, 13 11 S 18 7, 20 13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`font-semibold tracking-tight ${small ? "text-[15px]" : "text-lg"}`}>
        Samjha<span className="text-[var(--accent)]">Do</span>
      </span>
    </span>
  );
}

export function Landing({
  onFile,
  onDemo,
  onYoutube,
  onRepo,
}: {
  onFile: (f: File) => void;
  onDemo: () => void;
  onYoutube: (s: YtSource) => void;
  onRepo: (s: RepoSource) => void;
}) {
  const [over, setOver] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const openYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim() || ytBusy) return;
    setYtBusy(true);
    setYtError(null);
    try {
      // The same box takes YouTube videos/playlists and GitHub repos.
      const isRepo = parseGitHubUrl(ytUrl) !== null;
      const res = await fetch(isRepo ? "/api/gh" : "/api/yt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: ytUrl }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link open nahi hua");
      if (isRepo) onRepo(data.source as RepoSource);
      else onYoutube(data.source as YtSource);
    } catch (err) {
      setYtError(friendlyError(err));
    } finally {
      setYtBusy(false);
    }
  };
  const accept = (f?: File | null) => {
    if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) onFile(f);
  };

  return (
    <main
      className="app-bg relative min-h-dvh overflow-hidden text-white"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        accept(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="hero-grid pointer-events-none absolute inset-0" />
      <div className="hero-glow pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50">Phase 1 · Beta</span>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/[0.08] px-3 py-1 text-xs font-medium text-[var(--accent)]"
          >
            <span className="size-1.5 rounded-full bg-[var(--accent)]" /> AI whiteboard tutor for any book
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.05 }}
            className="font-display text-[3.4rem] leading-[0.98] tracking-[-0.02em] sm:text-7xl"
          >
            Koi bhi book.
            <br />
            <span className="relative inline-block font-hand text-[1.12em] text-[var(--accent)]">
              Samjho apni bhasha mein.
              <svg viewBox="0 0 400 20" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-4 w-full overflow-visible">
                <path className="hero-underline" d="M3 12 C 90 4, 180 18, 260 9 S 370 6, 397 11" fill="none" stroke="var(--chalk-yellow)" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.12 }}
            className="mt-8 max-w-lg text-lg leading-relaxed text-white/60"
          >
            PDF upload karo, jo samajh na aaye wo select karo — SamjhaDo use whiteboard pe likh ke, draw karke, formula solve karke{" "}
            <span className="text-white">Hinglish</span> mein samjhata hai. Beech mein doubt? Bas bolo.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <label className="press group flex cursor-pointer items-center gap-2 rounded-full bg-[var(--accent)] py-3 pl-5 pr-4 font-semibold text-ink shadow-[0_10px_40px_-10px_var(--accent)]">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />
              <Upload className="size-4" /> Book upload karo
              <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </label>
            <button onClick={onDemo} className="press flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 font-medium text-white hover:bg-white/[0.08]">
              <PlayCircle className="size-4 text-[var(--accent)]" /> Demo lesson dekho
            </button>
          </motion.div>
          <p className="mt-4 text-xs text-white/35">Ya PDF ko kahin bhi drag & drop karo</p>

          <motion.form
            onSubmit={openYoutube}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.24 }}
            className="composer-glass mt-7 flex max-w-xl items-center gap-2 rounded-full p-1.5 pl-4"
          >
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
              <rect x="2" y="5" width="20" height="14" rx="4" fill="#ff3d3d" />
              <path d="M10 9 L15.5 12 L10 15 Z" fill="#fff" />
            </svg>
            <input
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="YouTube video / playlist ya GitHub repo link paste karo"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              aria-label="YouTube link"
            />
            <button
              type="submit"
              disabled={!ytUrl.trim() || ytBusy}
              className="press flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {ytBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {ytBusy ? "Padh raha hoon…" : "Shuru karo"}
            </button>
          </motion.form>
          {ytError ? <p className="mt-2 pl-4 text-xs text-[var(--chalk-pink)]">{ytError}</p> : null}
          <p className="mt-2 pl-4 text-xs text-white/35">Playlist ho toh class-wise, lambi video phase-wise, aur GitHub repo ho toh poora project step-by-step samjhayega.</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, rotate: -1 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
        >
          <HeroBoard />
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-3 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: MousePointerClick, t: "Select, then decide", d: "Kuch bhi apne aap start nahi hota. Text ya page chuno, phir Explain dabao." },
          { icon: Mic, t: "Type ya bolo", d: "“Example ke saath samjhao” — apni command type karo ya bolkar do." },
          { icon: MessageCircleQuestion, t: "Beech mein doubt", d: "Lesson rok ke doubt pucho. Clear hone ke baad wapas main topic pe." },
          { icon: Maximize2, t: "Full screen focus", d: "Book hide karo, board full screen karo, aur bas padho." },
        ].map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.3 + i * 0.06 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
          >
            <f.icon className="size-5 text-[var(--accent)]" />
            <p className="mt-3 font-medium">{f.t}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/50">{f.d}</p>
          </motion.div>
        ))}
      </section>

      {over ? (
        <div className="fixed inset-4 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-[var(--accent)] bg-black/70 backdrop-blur-sm">
          <p className="flex items-center gap-3 font-hand text-5xl text-[var(--accent)]">
            <Hand className="size-10" /> Chhod do yahan!
          </p>
        </div>
      ) : null}
    </main>
  );
}

/** Decorative preview: a pointer sketching a tiny lesson. Plays once. */
function HeroBoard() {
  return (
    <div className="relative">
      <div className="board-surface relative aspect-[5/4] overflow-hidden rounded-[28px] border border-white/[0.08] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex h-10 items-center gap-1.5 border-b border-white/[0.06] px-4">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-ink">LESSON</span>
          <span className="text-xs text-white/50">Gradient Descent</span>
        </div>
        <svg viewBox="0 0 500 360" className="absolute inset-x-0 bottom-0 top-10 h-[calc(100%-2.5rem)] w-full">
          <text x="34" y="62" className="font-hand hero-type" fontSize="34" fill="var(--chalk-yellow)">
            Pahaadi se neeche utro
          </text>
          <path className="hero-draw d1" d="M40 300 C 120 120, 200 110, 250 250 S 380 330, 460 140" fill="none" stroke="var(--chalk)" strokeWidth="3" strokeLinecap="round" />
          <circle className="hero-pop p1" cx="96" cy="190" r="9" fill="var(--chalk-pink)" />
          <circle className="hero-pop p2" cx="160" cy="160" r="9" fill="var(--chalk-pink)" opacity="0.8" />
          <circle className="hero-pop p3" cx="236" cy="226" r="9" fill="var(--chalk-pink)" opacity="0.9" />
          <path className="hero-draw d2" d="M104 196 Q 130 150 152 162 M168 166 Q 210 175 228 220" fill="none" stroke="var(--chalk-cyan)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 7" />
          <text x="290" y="110" className="font-hand hero-type t2" fontSize="26" fill="var(--chalk)">
            θ ← θ − α∇L
          </text>
        </svg>
        <div className="hero-pointer absolute left-0 top-0">
          <svg width="28" height="28" viewBox="0 0 24 24">
            <path d="M3 2.5 L20 11 L12.5 13 L9.5 20.5 Z" fill="var(--accent)" stroke="#0b0d0c" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="caption-glass absolute inset-x-5 bottom-5 rounded-xl px-4 py-2.5 text-sm text-white/85">
          “Dekho, har step pe hum slope ke opposite direction mein thoda sa move karte hain…”
        </div>
      </div>
      <div className="absolute -right-3 -top-4 rotate-6 rounded-xl bg-[var(--chalk-yellow)] px-3 py-1.5 font-hand text-xl text-ink shadow-xl">Hinglish mein!</div>
    </div>
  );
}
