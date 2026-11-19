"use client";
import { getProfileId, scoped } from "./profiles";
// Teacher voice for one board.
// Gemini's free tier allows only a few TTS requests per minute, so narration is fetched
// in at most two chunks per lesson (first two steps, then the rest). Each chunk's audio is
// split back into steps by finding the pauses between paragraphs.

type Status = "loading" | "ready" | "failed";

interface Segment {
  chunk: number;
  start: number;
  end: number;
}

interface Chunk {
  steps: number[];
  status: Status;
  url?: string;
  segments?: Segment[];
}

const chunkCache = new Map<string, Promise<{ url: string; buffer: ArrayBuffer } | null>>();

/** Teacher voices the learner can pick (all female, Indian accent via hi-IN). Sulafat scored sweetest. */
export const VOICES = [
  { id: "Sulafat", label: "Sulafat · warm & sweet" },
  { id: "Achernar", label: "Achernar · soft" },
  { id: "Despina", label: "Despina · smooth" },
  { id: "Aoede", label: "Aoede · bright" },
] as const;
const voiceKey = () => scoped(getProfileId(), "voice");
export function getVoice(): string {
  try {
    const v = localStorage.getItem(voiceKey()) ?? localStorage.getItem("samjhado:voice");
    if (v && VOICES.some((x) => x.id === v)) return v;
  } catch {}
  return "Sulafat";
}
export function setVoice(v: string) {
  try {
    localStorage.setItem(voiceKey(), v);
  } catch {}
}

async function fetchChunk(text: string, voice: string): Promise<{ url: string; buffer: ArrayBuffer } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (res.status === 429) {
        const { retryAfter, daily } = (await res.json().catch(() => ({}))) as { retryAfter?: number; daily?: boolean };
        if (daily) return null; // out of free voice for today: browser voice takes over
        await new Promise((r) => setTimeout(r, Math.min(30, retryAfter ?? 10) * 1000));
        continue;
      }
      if (!res.ok) return null;
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), buffer: await blob.arrayBuffer() };
    } catch {
      return null;
    }
  }
  return null;
}

function cachedChunk(text: string) {
  const voice = getVoice();
  const key = `${voice}|${text}`;
  let p = chunkCache.get(key);
  if (!p) {
    p = fetchChunk(text, voice);
    chunkCache.set(key, p);
    p.then((r) => r === null && chunkCache.delete(key));
  }
  return p;
}

/** Find where each paragraph starts/ends in the audio by locating silent gaps. */
async function splitBySilence(buffer: ArrayBuffer, weights: number[]): Promise<{ start: number; end: number }[]> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const data = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const win = Math.round(sr * 0.02);
    const rms: number[] = [];
    for (let i = 0; i + win <= data.length; i += win) {
      let s = 0;
      for (let j = i; j < i + win; j++) s += data[j] * data[j];
      rms.push(Math.sqrt(s / win));
    }
    const sorted = [...rms].sort((a, b) => a - b);
    const thr = Math.max(0.004, sorted[Math.floor(sorted.length * 0.9)] * 0.08);
    const voiced = rms.map((v) => v > thr);
    const first = voiced.indexOf(true);
    const last = voiced.lastIndexOf(true);
    const t = (w: number) => (w * win) / sr;
    if (first < 0) return weights.map(() => ({ start: 0, end: audio.duration }));

    // Silent runs between first and last voiced window.
    const gaps: { at: number; len: number }[] = [];
    let run = -1;
    for (let w = first; w <= last; w++) {
      if (!voiced[w] && run < 0) run = w;
      if (voiced[w] && run >= 0) {
        const len = w - run;
        if (len >= 10) gaps.push({ at: t(run + len / 2), len: t(len) });
        run = -1;
      }
    }

    const s0 = t(first);
    const s1 = t(last + 1);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const bounds: number[] = [];
    let acc = 0;
    let minAt = s0;
    for (let k = 0; k < weights.length - 1; k++) {
      acc += weights[k];
      const expected = s0 + (acc / total) * (s1 - s0);
      let best: { at: number; len: number } | null = null;
      let bestScore = Infinity;
      for (const g of gaps) {
        if (g.at <= minAt + 0.3) continue;
        const score = Math.abs(g.at - expected) - g.len * 1.5;
        if (score < bestScore) {
          bestScore = score;
          best = g;
        }
      }
      const at = best && Math.abs(best.at - expected) < (s1 - s0) * 0.25 ? best.at : expected;
      bounds.push(at);
      minAt = at;
    }
    const edges = [Math.max(0, s0 - 0.05), ...bounds, Math.min(audio.duration, s1 + 0.15)];
    return weights.map((_, k) => ({ start: edges[k], end: edges[k + 1] }));
  } finally {
    ctx.close().catch(() => {});
  }
}

// Known Indian female system voices, best first (Edge/Windows neural, Chrome, Windows desktop, macOS).
// Only Indian voices: no American/British fallbacks.
const FEMALE_HINTS = [
  "swara", // Microsoft Swara Online (Natural) - Hindi (India)
  "neerja", // Microsoft Neerja Online (Natural) - English (India)
  "google हिन्दी", // Chrome Hindi (female)
  "heera", // Microsoft Heera - English (India)
  "kalpana", // Microsoft Kalpana - Hindi
  "lekha", // macOS Hindi
  "veena", // macOS English (India)
  "isha",
  "aditi",
  "raveena",
];
const isIndian = (v: SpeechSynthesisVoice) => /-IN$/i.test(v.lang) || /india|hindi|हिन्दी/i.test(v.name);
const MALE_HINTS = ["ravi", "prabhat", "hemant", "madhur", "rishi", "david", "mark", "guy", "george", "male", "daniel", "alex"];

let cachedVoice: SpeechSynthesisVoice | null | undefined;
/** One consistent female voice for the browser fallback (never a male one if a female exists). */
function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet; try again next time
  const name = (v: SpeechSynthesisVoice) => v.name.toLowerCase();
  for (const hint of FEMALE_HINTS) {
    const v = voices.find((x) => name(x).includes(hint) && isIndian(x));
    if (v) return (cachedVoice = v);
  }
  const notMale = (v: SpeechSynthesisVoice) => !MALE_HINTS.some((h) => name(v).includes(h));
  // Any Indian voice that isn't known to be male; otherwise null and lang="hi-IN" lets the
  // browser use its own Indian voice. Never a US/UK voice.
  cachedVoice =
    voices.find((v) => v.lang === "hi-IN" && notMale(v)) ??
    voices.find((v) => v.lang === "en-IN" && notMale(v)) ??
    voices.find((v) => isIndian(v) && notMale(v)) ??
    null;
  return cachedVoice;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
  };
}

export class VoicePlayer {
  private chunks: Chunk[] = [];
  private stepChunk: number[] = [];
  private audio: HTMLAudioElement | null = null;
  private seg: Segment | null = null;
  private utter: SpeechSynthesisUtterance | null = null;
  private speaking = false;
  private played = false;
  private source: "gemini" | "browser" | null = null;
  private rate = 1;
  private disposed = false;
  private raf = 0;

  private texts: string[] = [];
  /** First step not yet assigned to a narration chunk. */
  private nextStep = 0;

  /**
   * Feed the narration as steps arrive (lessons stream in). Step 1 is voiced on its own so the
   * teacher starts talking within seconds; later steps go in groups of up to 5 per request
   * (keeps clips short and within the free-tier request budget). `final` = no more steps coming.
   */
  update(texts: string[], final: boolean) {
    this.texts = texts;
    while (this.nextStep < texts.length) {
      const size = this.chunks.length === 0 ? 1 : 8; // fewer voice requests per lesson
      const remaining = texts.length - this.nextStep;
      if (remaining < size && !final) break;
      const take = Math.min(size, remaining);
      this.addChunk(Array.from({ length: take }, (_, k) => this.nextStep + k));
      this.nextStep += take;
    }
  }

  private addChunk(steps: number[]) {
    const ci = this.chunks.length;
    const chunk: Chunk = { steps, status: "loading" };
    this.chunks.push(chunk);
    steps.forEach((s) => (this.stepChunk[s] = ci));
    const texts = this.texts;
    const spoken = steps.filter((s) => texts[s]?.trim());
    if (!spoken.length) {
      chunk.status = "failed";
      return;
    }
    const text = spoken.map((s) => texts[s].trim()).join("\n\n");
    cachedChunk(text)
      .then(async (r) => {
        if (!r) throw new Error("no audio");
        const parts = await splitBySilence(r.buffer, spoken.map((s) => texts[s].length));
        if (this.disposed) return;
        chunk.url = r.url;
        chunk.segments = [];
        spoken.forEach((s, k) => (chunk.segments![s] = { chunk: ci, ...parts[k] }));
        chunk.status = "ready";
      })
      .catch(() => {
        chunk.status = "failed";
      });
  }

  /**
   * One voice per lesson: if the first chunk of Gemini audio failed, the whole lesson uses the
   * browser voice (so it never flips between two different voices mid-lesson).
   */
  private browserOnly() {
    return this.chunks[0]?.status === "failed";
  }

  statusOf(stepIndex: number): Status {
    if (this.browserOnly()) return "failed";
    // Not grouped into a chunk yet (more steps still streaming in): its audio is on the way.
    if (stepIndex >= this.nextStep) return stepIndex < this.texts.length ? "loading" : "failed";
    const c = this.chunks[this.stepChunk[stepIndex]];
    return c?.status ?? "failed";
  }

  /** Speak step i: its slice of the Gemini audio, or the browser voice as a fallback. */
  play(stepIndex: number) {
    this.stop();
    this.played = false;
    const text = this.texts[stepIndex];
    if (!text?.trim()) return;
    const chunk = this.chunks[this.stepChunk[stepIndex]];
    const seg = chunk?.segments?.[stepIndex];
    if (!this.browserOnly() && chunk?.status === "ready" && chunk.url && seg) {
      this.source = "gemini";
      const a = new Audio(chunk.url);
      a.playbackRate = this.rate;
      a.currentTime = seg.start;
      a.onplaying = () => (this.played = true);
      a.onended = () => (this.speaking = false);
      a.onerror = () => (this.speaking = false);
      this.audio = a;
      this.seg = seg;
      this.speaking = true;
      a.play().catch(() => (this.speaking = false));
      const watch = () => {
        if (!this.audio || this.audio !== a) return;
        if (a.currentTime >= seg.end) {
          a.pause();
          this.speaking = false;
          return;
        }
        this.raf = requestAnimationFrame(watch);
      };
      this.raf = requestAnimationFrame(watch);
      return;
    }
    if ("speechSynthesis" in window) {
      this.source = "browser";
      const u = new SpeechSynthesisUtterance(text);
      u.voice = pickFemaleVoice();
      u.lang = u.voice?.lang ?? "hi-IN";
      u.pitch = 1.05;
      u.rate = Math.min(2, 0.95 * this.rate);
      u.onstart = () => (this.played = true);
      u.onend = () => (this.speaking = false);
      u.onerror = () => (this.speaking = false);
      this.utter = u;
      this.speaking = true;
      window.speechSynthesis.speak(u);
    }
  }

  pause() {
    this.audio?.pause();
    if (this.utter) window.speechSynthesis.pause();
  }

  resume() {
    if (this.audio && this.speaking) this.audio.play().catch(() => (this.speaking = false));
    if (this.utter) window.speechSynthesis.resume();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
      this.audio = null;
    }
    this.seg = null;
    if (this.utter) {
      this.utter.onend = null;
      window.speechSynthesis.cancel();
      this.utter = null;
    }
    this.speaking = false;
  }

  setRate(r: number) {
    this.rate = r;
    if (this.audio) this.audio.playbackRate = r;
  }

  /** True once audio for the current step actually started (false if autoplay was blocked). */
  /** Which voice spoke the last step: Gemini's (the chosen voice) or the browser fallback. */
  lastSource(): "gemini" | "browser" | null {
    return this.source;
  }

  hasPlayed() {
    return this.played;
  }

  isSpeaking() {
    return this.speaking;
  }

  /** 0..1 progress through the current step's narration, or null when unknown. */
  progress(): number | null {
    const a = this.audio;
    const s = this.seg;
    if (!a || !s || s.end <= s.start) return null;
    return Math.max(0, Math.min(1, (a.currentTime - s.start) / (s.end - s.start)));
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }
}
