import { GeminiError, generateLesson, streamLesson, type StreamEvent } from "@/lib/gemini";
import type { LessonRequest } from "@/lib/types";

export async function POST(request: Request) {
  let body: LessonRequest & { stream?: boolean };
  try {
    body = (await request.json()) as LessonRequest & { stream?: boolean };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body?.context || (body.mode !== "lesson" && body.mode !== "doubt")) {
    return Response.json({ error: "Missing context or mode" }, { status: 400 });
  }
  body.instruction = String(body.instruction ?? "").slice(0, 1000);
  // Courses send up to 12 earlier-class summaries so later classes can recall them.
  body.memory = Array.isArray(body.memory) ? body.memory.slice(-12).map((m) => String(m).slice(0, 400)) : [];

  // Streaming: one JSON event per line, steps sent as soon as Gemini writes them.
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        try {
          await streamLesson(body, emit);
        } catch (e) {
          emit({ type: "error", error: e instanceof Error ? e.message : "Unknown error", status: 500 });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  }

  try {
    const lesson = await generateLesson(body);
    return Response.json({ lesson });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status });
  }
}
