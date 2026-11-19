// Learner profiles. Each person keeps their own progress, memory, voice and settings.
//
// HOW TO CHANGE TEACHING STYLE LATER:
// - SHARED_INSTRUCTIONS applies to everyone (today both learners are taught the same way).
// - Add anything person-specific to that profile's `extra` (e.g. "examples cricket se do",
//   "zyada maths derivations dikhao"). It is sent with every lesson for that learner only.

export const SHARED_INSTRUCTIONS = [
  "Teach at a 'god level but super simple' standard: start from zero, build intuition first, then the exact idea, then a worked example.",
  "Use everyday Indian examples and analogies. One idea per step. Never assume prior knowledge without a one-line recap.",
  "Be warm and encouraging, like a favourite teacher. Check understanding with a quick rhetorical question now and then.",
].join(" ");

export interface Profile {
  id: string;
  name: string;
  /** Accent used for this learner's chip. */
  color: string;
  /** Extra teaching preferences for this learner only (empty = same as everyone). */
  extra: string;
}

export const PROFILES: Profile[] = [
  { id: "aarohi", name: "Aarohi", color: "#ff8fc7", extra: "" },
  { id: "prem", name: "Prem", color: "#7fe0ff", extra: "" },
];

const KEY = "samjhado:profile";

export function getProfileId(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && PROFILES.some((p) => p.id === v)) return v;
  } catch {}
  return PROFILES[1].id;
}

export function setProfileId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

export function profileById(id: string): Profile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[1];
}

/** localStorage key scoped to a learner, so two people never share progress. */
export function scoped(profileId: string, key: string): string {
  return `samjhado:${profileId}:${key}`;
}

/** What the lesson request carries about the learner. */
export function learnerFor(profileId: string): { name: string; instructions: string } {
  const p = profileById(profileId);
  return { name: p.name, instructions: [SHARED_INSTRUCTIONS, p.extra].filter(Boolean).join(" ") };
}
