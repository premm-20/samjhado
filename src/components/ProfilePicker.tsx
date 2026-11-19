"use client";
import { PROFILES } from "@/lib/profiles";

/** "Kaun padh raha hai?" — pick the learner (Aarohi / Prem). */
export function ProfilePicker({ value, onChange, compact }: { value: string; onChange: (id: string) => void; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "rounded-full border border-white/10 bg-white/[0.03] p-1 pl-3"}`}>
      {compact ? null : <span className="text-xs text-white/50">Kaun padh raha hai?</span>}
      <div className="flex gap-1">
        {PROFILES.map((p) => {
          const on = p.id === value;
          return (
            <button
              key={p.id}
              onClick={() => onChange(p.id)}
              aria-pressed={on}
              title={`${p.name} ki padhai (alag progress, notes aur memory)`}
              className={`press flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ${
                on ? "text-ink" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
              }`}
              style={on ? { background: p.color } : undefined}
            >
              <span className="grid size-4 place-items-center rounded-full bg-black/20 text-[9px] font-bold">{p.name[0]}</span>
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
