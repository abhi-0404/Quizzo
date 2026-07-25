import {
  isSubChoice,
  type Question as BuilderQuestion,
} from "@/data/questions";

/**
 * Hand-off between the paper builder (/admin/create) and the real exam runner
 * (/:slug/:courseSlug/exam).
 *
 * "Preview Paper" converts the builder's blocks into the exact shape the exam
 * UI already consumes and parks it in sessionStorage, so an admin can sit the
 * paper in Practice or Exam mode exactly as a student would. sessionStorage
 * (not React state) because the exam runner is a separate route and we want
 * the paper to survive a refresh of that route.
 */

export type ExamQType = "single" | "multi" | "comprehension" | "integer";

/** Mirrors the `Question` interface inside Exam.tsx. */
export interface ExamQuestion {
  id: number;
  type: ExamQType;
  text: string;
  options: string[];
  passage?: string;
  marks: number;
}

export interface PreviewPaper {
  subject: string;
  examLabel: string;
  durationMinutes: number;
  totalMarks: number;
  questions: ExamQuestion[];
}

const STORAGE_KEY = "quizzo_preview_paper";

export function storePreviewPaper(paper: PreviewPaper): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(paper));
  } catch {
    /* storage unavailable — the exam route falls back to sample questions */
  }
}

export function loadPreviewPaper(): PreviewPaper | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreviewPaper;
    return Array.isArray(parsed?.questions) && parsed.questions.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPreviewPaper(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

/** "1 Hour" / "1.5 Hours" → minutes. */
export function durationToMinutes(label: string): number {
  const m = label.match(/([\d.]+)/);
  const hours = m ? Number(m[1]) : 1;
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 60;
}

/**
 * Flatten builder blocks into the exam runner's flat question list.
 * Comprehension parents expand into one entry per sub-question, each carrying
 * the shared passage so the runner shows it above every child.
 */
export function toExamQuestions(blocks: BuilderQuestion[]): ExamQuestion[] {
  const out: ExamQuestion[] = [];
  let id = 0;

  for (const q of blocks) {
    // Only fall back to raw source when the block has no parsed stem at all —
    // the two views are kept in sync, so a LaTeX-authored block usually has one.
    if (!q.stem.trim() && q.type !== "comprehension") {
      out.push({ id: ++id, type: "single", text: q.latex.trim(), options: [], marks: q.marks });
      continue;
    }

    if (q.type === "comprehension") {
      for (const sq of q.subQuestions) {
        out.push({
          id: ++id,
          type: sq.type === "numerical" ? "integer" : sq.type === "multi_correct" ? "multi" : "single",
          text: sq.stem.trim(),
          options: isSubChoice(sq.type) ? sq.options.filter((o) => o.trim()) : [],
          passage: q.passage.trim() || undefined,
          marks: sq.marks,
        });
      }
      continue;
    }

    out.push({
      id: ++id,
      type: q.type === "numerical" ? "integer" : q.type === "multi" ? "multi" : "single",
      text: q.stem.trim(),
      options: q.type === "numerical" ? [] : q.options.filter((o) => o.trim()),
      marks: q.marks,
    });
  }

  return out;
}
