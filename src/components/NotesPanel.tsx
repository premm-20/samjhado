"use client";
import katex from "katex";
import { motion } from "motion/react";
import { Check, Copy, Download, Printer, X } from "lucide-react";
import { useState } from "react";
import type { Lesson } from "@/lib/types";

const tex = (s: string) => katex.renderToString(s, { throwOnError: false, displayMode: true, output: "html" });

export function notesToMarkdown(book: string, entries: Lesson[]): string {
  const out: string[] = [`# ${book || "SamjhaDo"} — Notes`, ""];
  for (const l of entries) {
    if (!l.notes) continue;
    out.push(`## ${l.kind === "doubt" ? "Doubt: " : ""}${l.title}`, "");
    if (l.notes.keyPoints.length) out.push("**Key points**", ...l.notes.keyPoints.map((k) => `- ${k}`), "");
    if (l.notes.formulas.length)
      out.push("**Formulas**", ...l.notes.formulas.map((f) => `- $${f.latex}$ — ${f.meaning}`), "");
    if (l.notes.example.length) out.push("**Worked example**", ...l.notes.example.map((e, i) => `${i + 1}. ${e}`), "");
    if (l.notes.tips.length) out.push("**Yaad rakho**", ...l.notes.tips.map((t) => `- ${t}`), "");
  }
  return out.join("\n");
}

export function NotesPanel({ book, entries, onClose }: { book: string; entries: Lesson[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const withNotes = entries.filter((e) => e.notes);
  const md = () => notesToMarkdown(book, withNotes);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(book || "samjhado").replace(/[^\w\- ]+/g, "")} notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0.6, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-y-0 right-0 z-[45] flex w-[min(440px,92%)] flex-col shadow-[-30px_0_80px_-30px_rgba(0,0,0,0.9)]"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-black/10 bg-[#efe8d6] px-3 text-[#2b2a26]">
        <p className="flex-1 font-hand text-2xl font-bold">Meri Notebook</p>
        <NoteBtn label={copied ? "Copied" : "Copy as Markdown"} onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </NoteBtn>
        <NoteBtn label="Download .md" onClick={download}>
          <Download className="size-4" />
        </NoteBtn>
        <NoteBtn label="Print / Save as PDF" onClick={() => window.print()}>
          <Printer className="size-4" />
        </NoteBtn>
        <NoteBtn label="Close notes" onClick={onClose}>
          <X className="size-4" />
        </NoteBtn>
      </div>

      <div className="notebook print-notes min-h-0 flex-1 overflow-y-auto">
        {withNotes.length === 0 ? (
          <p className="pt-10 font-hand text-2xl text-[#6b675c]">Abhi koi notes nahi. Koi topic samjho, notes yahan apne aap ban jayenge.</p>
        ) : (
          withNotes.map((l) => (
            <section key={l.id} className="pb-8">
              <h3 className="font-hand text-[1.9rem] font-bold leading-[2rem] text-[#1f3a8a]">
                {l.kind === "doubt" ? <span className="mr-2 text-[#b45309]">Doubt:</span> : null}
                {l.title}
              </h3>
              {l.notes!.keyPoints.length ? (
                <>
                  <h4 className="note-h">Key points</h4>
                  <ul className="list-disc pl-5">
                    {l.notes!.keyPoints.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {l.notes!.formulas.length ? (
                <>
                  <h4 className="note-h">Formulas</h4>
                  {l.notes!.formulas.map((f, i) => (
                    <div key={i} className="note-formula">
                      <div dangerouslySetInnerHTML={{ __html: tex(f.latex) }} />
                      <p className="text-[#55524a]">{f.meaning}</p>
                    </div>
                  ))}
                </>
              ) : null}
              {l.notes!.example.length ? (
                <>
                  <h4 className="note-h">Worked example</h4>
                  <ol className="list-decimal pl-5">
                    {l.notes!.example.map((e, i) => (
                      <li key={i} className="font-mono text-[13px]">
                        {e}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {l.notes!.tips.length ? (
                <>
                  <h4 className="note-h text-[#b91c1c]">Yaad rakho</h4>
                  <ul className="list-disc pl-5">
                    {l.notes!.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ))
        )}
      </div>
    </motion.aside>
  );
}

function NoteBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="press grid size-8 place-items-center rounded-lg text-[#3b3a35] hover:bg-black/[0.07]">
      {children}
    </button>
  );
}
