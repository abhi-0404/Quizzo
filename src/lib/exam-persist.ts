import type { Answer, QStatus } from "./exam-session";

/**
 * Keeps a sitting alive across an accidental refresh. Answers, statuses, notes
 * and timing go to localStorage under one key per paper and mode; they are
 * cleared after a successful submit. Only small JSON, never paper content.
 */

export interface SavedSession {
  v: 1;
  startedAt: number;
  answers: Record<number, Answer>;
  statuses: QStatus[];
  questionMs: Record<number, number>;
  current: number;
}

const key = (paperId: string, mode: string) => `quizzo_session:${paperId}:${mode}`;
const notesKey = (paperId: string) => `quizzo_notes:${paperId}`;

const STATUSES = new Set<QStatus>(["notVisited", "notAnswered", "answered", "marked", "answeredMarked"]);

export function saveSession(paperId: string, mode: string, s: SavedSession): void {
  try {
    localStorage.setItem(key(paperId, mode), JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Returns a saved session only if it is well formed and fits a paper of `total` questions. */
export function loadSession(paperId: string, mode: string, total: number): SavedSession | null {
  try {
    const raw = localStorage.getItem(key(paperId, mode));
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (
      s?.v !== 1 ||
      typeof s.startedAt !== "number" ||
      !Array.isArray(s.statuses) ||
      s.statuses.length !== total ||
      !s.statuses.every((x) => STATUSES.has(x)) ||
      typeof s.answers !== "object" ||
      s.answers === null
    ) {
      return null;
    }
    return {
      ...s,
      current: Number.isInteger(s.current) && s.current >= 0 && s.current < total ? s.current : 0,
      questionMs: s.questionMs && typeof s.questionMs === "object" ? s.questionMs : {},
    };
  } catch {
    return null;
  }
}

export function clearSession(paperId: string, mode: string): void {
  try {
    localStorage.removeItem(key(paperId, mode));
  } catch {
    /* ignore */
  }
}

/**
 * Rough-work notes: one per question plus one general note for the paper.
 * They outlive a session and stay with the paper on this device.
 */
export interface ExamNotes {
  general: string;
  /** Keyed by question index (0-based). Empty notes are not stored. */
  byQuestion: Record<number, string>;
}

export const emptyNotes = (): ExamNotes => ({ general: "", byQuestion: {} });

const MAX_NOTE = 5000;

/** Reads notes; an older single text note becomes the general note. */
export function loadNotes(paperId: string): ExamNotes {
  try {
    const raw = localStorage.getItem(notesKey(paperId));
    if (!raw) return emptyNotes();
    if (!raw.startsWith("{")) return { general: raw, byQuestion: {} };
    const n = JSON.parse(raw) as Partial<ExamNotes>;
    const byQuestion: Record<number, string> = {};
    for (const [k, v] of Object.entries(n.byQuestion ?? {})) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && typeof v === "string" && v.trim()) byQuestion[i] = v.slice(0, MAX_NOTE);
    }
    return { general: typeof n.general === "string" ? n.general.slice(0, MAX_NOTE) : "", byQuestion };
  } catch {
    return emptyNotes();
  }
}

export function saveNotes(paperId: string, notes: ExamNotes): void {
  try {
    const byQuestion: Record<number, string> = {};
    for (const [k, v] of Object.entries(notes.byQuestion)) if (v.trim()) byQuestion[Number(k)] = v.slice(0, MAX_NOTE);
    const general = notes.general.slice(0, MAX_NOTE);
    if (!general.trim() && Object.keys(byQuestion).length === 0) localStorage.removeItem(notesKey(paperId));
    else localStorage.setItem(notesKey(paperId), JSON.stringify({ general, byQuestion }));
  } catch {
    /* ignore */
  }
}

/** Questions that carry a non-empty note. */
export const notedQuestions = (n: ExamNotes): Set<number> =>
  new Set(Object.entries(n.byQuestion).filter(([, v]) => v.trim()).map(([k]) => Number(k)));

/** All notes as plain text, for copying or downloading. */
export function notesToText(n: ExamNotes, title: string): string {
  const parts = [title];
  if (n.general.trim()) parts.push("", "General", n.general.trim());
  for (const i of [...notedQuestions(n)].sort((a, b) => a - b)) parts.push("", `Question ${i + 1}`, n.byQuestion[i].trim());
  return parts.join("\n");
}

/** A timed exam can be resumed only while its clock has not run out. */
export function isResumable(s: SavedSession, practice: boolean, totalSeconds: number, now: number): boolean {
  return practice || s.startedAt + totalSeconds * 1000 > now;
}
