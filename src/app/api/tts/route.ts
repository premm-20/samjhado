// Teacher voice: Gemini TTS turns one narration line into audio.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cache = new Map<string, { type: string; data: Buffer }>();
const MAX_CACHE = 300;

// Every generated clip is also saved to disk, so the same narration never costs voice quota twice
// (survives server restarts). Lives in samjhado/.cache/tts.
const DISK_DIR = path.join(process.cwd(), ".cache", "tts");
const diskName = (key: string) => path.join(DISK_DIR, createHash("sha1").update(key).digest("hex") + ".wav");
async function fromDisk(key: string): Promise<Buffer | null> {
  try {
    return await readFile(diskName(key));
  } catch {
    return null;
  }
}
async function toDisk(key: string, data: Buffer) {
  try {
    await mkdir(DISK_DIR, { recursive: true });
    await writeFile(diskName(key), data);
  } catch {}
}

/** Wrap raw 16-bit PCM in a WAV header so browsers can play it. */
function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Free tier: ~10 TTS requests/day and 3/minute per model. Each model has its own allowance,
// so fall through a chain of TTS models (same voice) before giving up.
const DEFAULT_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];
const blockedUntil = new Map<string, number>();
const ALLOWED_VOICES = ["Sulafat", "Achernar", "Despina", "Aoede", "Leda", "Kore"];
/** hi-IN: Hindi words with native pronunciation and English terms in an Indian accent. */
const TTS_LANG = process.env.GEMINI_TTS_LANG || "hi-IN";

async function synth(key: string, model: string, voice: string, line: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              // Only the narration itself: any style instruction here gets read out loud.
              text: line,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          // Indian accent via the language setting (instructions in the text would be read aloud).
          languageCode: TTS_LANG,
        },
      },
    }),
  });
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY missing" }, { status: 400 });
  const { text, voice: asked } = (await request.json().catch(() => ({}))) as { text?: string; voice?: string };
  const line = String(text ?? "").trim().slice(0, 12000);
  if (!line) return Response.json({ error: "No text" }, { status: 400 });

  const models = process.env.GEMINI_TTS_MODEL ? process.env.GEMINI_TTS_MODEL.split(",").map((m) => m.trim()) : DEFAULT_MODELS;
  // One female voice for the whole lesson (same name on every fallback model).
  // Sulafat scored sweetest/smoothest with an Indian accent; the learner can pick another in the app.
  const voice = asked && ALLOWED_VOICES.includes(asked) ? asked : process.env.GEMINI_TTS_VOICE || "Sulafat";
  const cacheKey = `${voice}|${TTS_LANG}|${line}`;
  const hit = cache.get(cacheKey);
  if (hit) return new Response(new Uint8Array(hit.data), { headers: { "content-type": hit.type, "cache-control": "private, max-age=3600", "x-tts-cache": "memory" } });
  const disk = await fromDisk(cacheKey);
  if (disk) {
    cache.set(cacheKey, { type: "audio/wav", data: disk });
    return new Response(new Uint8Array(disk), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=3600", "x-tts-cache": "disk" } });
  }

  let lastError = "No TTS model available";
  let minRetry = 60;
  let daily = true;
  for (const model of models) {
    const until = blockedUntil.get(model) ?? 0;
    if (until > Date.now()) {
      minRetry = Math.min(minRetry, Math.ceil((until - Date.now()) / 1000));
      continue;
    }
    const res = await synth(key, model, voice, line);
    if (!res.ok) {
      const body = await res.text();
      lastError = `TTS ${res.status} (${model}): ${body.slice(0, 160)}`;
      if (res.status === 429) {
        const perDay = /PerDay/.test(body);
        const retry = Number(/"retryDelay":s*"(d+)/.exec(body)?.[1] ?? 0) || 30;
        blockedUntil.set(model, Date.now() + (perDay ? 60 * 60 * 1000 : retry * 1000));
        if (!perDay) {
          daily = false;
          minRetry = Math.min(minRetry, retry);
        }
      }
      continue;
    }
    const data = await res.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData as
      | { mimeType: string; data: string }
      | undefined;
    if (!part) {
      lastError = `No audio from ${model}`;
      continue;
    }
    let buf: Buffer = Buffer.from(part.data, "base64");
    let type = part.mimeType.split(";")[0];
    if (/L16|pcm/i.test(part.mimeType)) {
      const rate = Number(/rate=(d+)/.exec(part.mimeType)?.[1] ?? 24000);
      buf = pcmToWav(buf, rate);
      type = "audio/wav";
    }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { type, data: buf });
    if (type === "audio/wav") void toDisk(cacheKey, buf);
    return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-tts-model": model } });
  }
  // Every model is rate-limited: tell the client whether waiting a bit helps.
  return Response.json({ error: lastError, retryAfter: daily ? undefined : minRetry, daily }, { status: 429 });
}
