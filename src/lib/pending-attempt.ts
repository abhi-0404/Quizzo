/**
 * Holds one graded-but-unsaved exam attempt across the redirect to /auth.
 *
 * A signed-out student can sit and finish a paper; grading happens client-side
 * regardless of auth state. Only the persistence step (`attempts` insert)
 * requires a user id, so the graded result is held here until one exists,
 * rather than being thrown away the moment "Submit" is pressed.
 */

export interface PendingAttemptAnswer {
  questionId?: string;
  response: unknown;
  status: "correct" | "incorrect" | "skipped";
  marks: number;
  timeSeconds: number;
}

export interface PendingAttempt {
  paperId: string;
  mode: "exam" | "practice";
  durationSeconds: number;
  totalMarks: number;
  answers: PendingAttemptAnswer[];
  slug: string;
  courseSlug: string;
}

const KEY = "quizzo_pending_attempt";

export function savePendingAttempt(attempt: PendingAttempt) {
  try {
    localStorage.setItem(KEY, JSON.stringify(attempt));
  } catch {
    // Storage unavailable (private mode, quota) — same as before this existed:
    // the attempt is lost, but nothing crashes.
  }
}

export function loadPendingAttempt(): PendingAttempt | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingAttempt) : null;
  } catch {
    return null;
  }
}

export function clearPendingAttempt() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
