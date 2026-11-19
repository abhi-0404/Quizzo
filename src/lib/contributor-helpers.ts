/**
 * Pure helpers for the contributor portal.
 *
 * Deliberately free of any Supabase import so they stay unit-testable. The data
 * layer (`./contributor`) re-exports everything here.
 */

export type ReviewVerdict = "correct" | "incorrect";
export type ReviewStatus = "pending" | "accepted" | "rejected";
export type SolutionStatus = "pending" | "approved" | "rejected";
/** What the key looks like: option indexes (single / multi) or a number. */
export type KeyKind = "single" | "multi" | "numerical";

/* ── Solution files ───────────────────────────────────────────────────────── */

export const MAX_SOLUTION_BYTES = 10 * 1024 * 1024;

/** Allowed uploads, mirroring the `solutions` bucket and the table's CHECK. */
export const SOLUTION_MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const SOLUTION_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function extensionForMime(mime: string): string | null {
  return SOLUTION_MIME_EXT[mime] ?? null;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Returns a human-readable problem with the file, or null when it is fine. */
export function validateSolutionFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.size || file.size <= 0) return "That file is empty.";
  if (!extensionForMime(file.type)) return "Only PDF, PNG, JPEG or WebP files can be uploaded.";
  if (file.size > MAX_SOLUTION_BYTES) return `That file is ${formatBytes(file.size)}. The limit is 10 MB.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Reviews ──────────────────────────────────────────────────────────────── */

export const MAX_NOTE_LENGTH = 1000;
export const MAX_NUMERICAL_LENGTH = 60;
/** Same shapes the grader accepts: "3", "-2.5", or a range such as "80 to 81". */
const NUMERIC_KEY = /^-?\d+(\.\d+)?(\s*to\s*-?\d+(\.\d+)?)?$/i;

export interface ReviewDraft {
  verdict: ReviewVerdict;
  suggestedCorrect?: number[] | null;
  suggestedNumerical?: string | null;
  note?: string;
  /** When known, the suggestion is checked against the question's shape. */
  kind?: KeyKind;
  optionCount?: number;
}

/** Returns an error message, or null when the review can be saved. */
export function validateReview(d: ReviewDraft): string | null {
  if ((d.note ?? "").length > MAX_NOTE_LENGTH) return `The note is limited to ${MAX_NOTE_LENGTH} characters.`;
  if (d.verdict === "correct") return null;

  const picks = d.suggestedCorrect ?? [];
  const numeric = (d.suggestedNumerical ?? "").trim();

  if (d.kind === "numerical") {
    if (!numeric) return "Enter the answer you think is correct.";
  } else if (d.kind === "single") {
    if (picks.length !== 1) return "Pick the one option you think is correct.";
  } else if (d.kind === "multi") {
    if (picks.length < 1) return "Pick every option you think is correct.";
  } else if (picks.length === 0 && !numeric) {
    return "Say what the correct answer should be.";
  }

  if (numeric) {
    if (numeric.length > MAX_NUMERICAL_LENGTH) return "That answer is too long.";
    if (!NUMERIC_KEY.test(numeric)) return "Enter a number, or a range like 80 to 81.";
  }
  if (new Set(picks).size !== picks.length) return "An option was picked twice.";
  for (const i of picks) {
    if (!Number.isInteger(i) || i < 0) return "That option is not valid.";
    if (d.optionCount != null && i >= d.optionCount) return "That option does not exist on this question.";
  }
  return null;
}

/** The exact columns to store: a "correct" verdict carries no suggestion. */
export function reviewPayload(d: ReviewDraft): {
  verdict: ReviewVerdict;
  suggested_correct: number[] | null;
  suggested_numerical: string | null;
  note: string;
} {
  const note = (d.note ?? "").trim();
  if (d.verdict === "correct") {
    return { verdict: "correct", suggested_correct: null, suggested_numerical: null, note };
  }
  const picks = [...new Set(d.suggestedCorrect ?? [])].sort((a, b) => a - b);
  const numeric = (d.suggestedNumerical ?? "").trim();
  return {
    verdict: "incorrect",
    suggested_correct: d.kind === "numerical" ? null : picks.length ? picks : null,
    suggested_numerical: d.kind === "numerical" || (!picks.length && numeric) ? numeric || null : null,
    note,
  };
}

export type QuestionReviewState = "unreviewed" | "confirmed" | "flagged";

export function reviewState(r: { verdict: ReviewVerdict } | null | undefined): QuestionReviewState {
  if (!r) return "unreviewed";
  return r.verdict === "correct" ? "confirmed" : "flagged";
}

/** Letters for option indexes: [0, 2] -> "A, C". */
export function formatKey(correct: number[], numerical: string, kind: KeyKind): string {
  if (kind === "numerical") return numerical.trim() || "—";
  if (!correct.length) return "—";
  return [...correct].sort((a, b) => a - b).map((i) => String.fromCharCode(65 + i)).join(", ");
}

/* ── Progress and stats ───────────────────────────────────────────────────── */

/** done / total as a whole percentage, clamped to 0..100. */
export function progressPct(done: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export interface PaperProgress {
  paper_id: string;
  question_count: number;
  my_reviews: number;
}

export interface ContributorStats {
  papersAvailable: number;
  questionsReviewed: number;
  confirmed: number;
  flagsRaised: number;
  flagsPending: number;
  flagsAccepted: number;
  flagsRejected: number;
  solutionsSubmitted: number;
  solutionsPending: number;
  solutionsApproved: number;
  solutionsRejected: number;
}

/** Every number comes from the contributor's own rows; nothing is estimated. */
export function computeStats(
  papers: { paper_id: string }[],
  reviews: { verdict: ReviewVerdict; status: ReviewStatus }[],
  solutions: { status: SolutionStatus }[]
): ContributorStats {
  const flags = reviews.filter((r) => r.verdict === "incorrect");
  return {
    papersAvailable: papers.length,
    questionsReviewed: reviews.length,
    confirmed: reviews.filter((r) => r.verdict === "correct").length,
    flagsRaised: flags.length,
    flagsPending: flags.filter((r) => r.status === "pending").length,
    flagsAccepted: flags.filter((r) => r.status === "accepted").length,
    flagsRejected: flags.filter((r) => r.status === "rejected").length,
    solutionsSubmitted: solutions.length,
    solutionsPending: solutions.filter((s) => s.status === "pending").length,
    solutionsApproved: solutions.filter((s) => s.status === "approved").length,
    solutionsRejected: solutions.filter((s) => s.status === "rejected").length,
  };
}

/** Papers the contributor has started but not finished, nearest to done first. */
export function papersInProgress<T extends PaperProgress>(papers: T[], limit = 5): T[] {
  return papers
    .filter((p) => p.my_reviews > 0 && p.my_reviews < p.question_count)
    .sort((a, b) => progressPct(b.my_reviews, b.question_count) - progressPct(a.my_reviews, a.question_count))
    .slice(0, limit);
}

/** "2026-05-14T09:30:00Z" -> "14 May 2026". Empty or invalid input gives "—". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
