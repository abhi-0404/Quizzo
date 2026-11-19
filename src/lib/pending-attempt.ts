/**
 * Holds one finished-but-unsubmitted exam attempt across the redirect to /auth.
 *
 * A signed-out student can sit and finish a paper, but grading happens in the
 * database and needs a user. The raw responses are held here until one exists,
 * rather than being thrown away the moment "Submit" is pressed.
 */

export interface PendingAttemptAnswer {
  questionId: string;
  response: unknown;
  timeSeconds: number;
}

export interface PendingAttempt {
  paperId: string;
  mode: "exam" | "practice";
  durationSeconds: number;
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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAttempt;
    // Untrusted storage that is replayed into an RPC: check the shape.
    if (
      typeof parsed?.paperId !== "string" ||
      !Array.isArray(parsed.answers) ||
      typeof parsed.slug !== "string" ||
      typeof parsed.courseSlug !== "string"
    ) {
      return null;
    }
    return parsed;
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
