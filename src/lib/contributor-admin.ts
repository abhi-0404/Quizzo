import { supabase } from "@/integrations/supabase/client";

/**
 * Admin side of the contributor workflow: who the contributors are, and the
 * inbox of answer-key flags and solutions they have submitted.
 *
 * Every RPC here is admin-only in the database. The browser only ever receives
 * the rows the admin is entitled to see.
 */

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface ContributorRow {
  user_id: string;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  joined_at: string;
  reviews: number;
  flags: number;
  solutions: number;
}

export interface ContributorInvite {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
}

export interface ContributorList {
  contributors: ContributorRow[];
  invites: ContributorInvite[];
}

export type QuestionKind = "single" | "multi" | "numerical" | "comprehension";

export interface FlagRow {
  review_id: string;
  /** Sent back with the decision so an admin never applies a flag the reviewer edited after it was loaded. */
  updated_at: string;
  question_id: string;
  paper_id: string;
  position: number;
  kind: QuestionKind;
  snippet: string;
  options: unknown;
  current_correct: unknown;
  current_numerical: string | null;
  suggested_correct: unknown;
  suggested_numerical: string | null;
  note: string;
  created_at: string;
  course: string;
  reviewer_name: string;
  reviewer_email: string | null;
}

export interface SolutionRow {
  id: string;
  paper_id: string;
  /** null = a solution for the whole paper. */
  question_id: string | null;
  position: number | null;
  /** "video" rows are YouTube/Drive links: no file, mime or size. */
  kind: "file" | "video";
  video_url: string | null;
  storage_path: string | null;
  file_name: string;
  mime: string | null;
  size_bytes: number | null;
  note: string;
  created_at: string;
  course: string;
  author_name: string;
  author_email: string | null;
}

export interface ReviewInbox {
  flags: FlagRow[];
  solutions: SolutionRow[];
  confirmed_correct: number;
  accepted_flags: number;
}

/* ── Pure helpers (unit-tested) ───────────────────────────────────────────── */

/** Same normalisation the database applies before it looks an address up. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/** Mirrors the rule in `admin_add_contributor`: one @, a dot after it, no spaces, at most 254 chars. */
export function isValidEmail(raw: string): boolean {
  const addr = normalizeEmail(raw);
  return addr.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

/** 0 -> "A", 1 -> "B", ... */
export const optionLetter = (index: number): string => String.fromCharCode(65 + index);

/** Pulls the usable option indexes out of a jsonb value; anything unexpected is dropped. */
export function keyIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0)
    .sort((a, b) => a - b);
}

/**
 * Human text for an answer key: "B", "A, C" for option questions, the answer
 * itself for numerical ones, and a dash when there is no key.
 */
export function formatKey(kind: string, correct: unknown, numerical: string | null | undefined): string {
  if (kind === "numerical") {
    const n = (numerical ?? "").trim();
    return n || "—";
  }
  const letters = keyIndexes(correct).map(optionLetter);
  return letters.length ? letters.join(", ") : "—";
}

/** The option text behind each chosen letter, for showing "B · Median" under a key. */
export function keyOptions(options: unknown, correct: unknown): { letter: string; text: string }[] {
  const list = Array.isArray(options) ? options : [];
  return keyIndexes(correct).map((i) => ({
    letter: optionLetter(i),
    text: typeof list[i] === "string" ? (list[i] as string) : "",
  }));
}

/** 1536 -> "1.5 KB", 2_621_440 -> "2.5 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const isImageMime = (mime: string): boolean => mime.startsWith("image/");

/** "PDF" / "Image" for the file-type chip. */
export const mimeLabel = (mime: string): string => (mime === "application/pdf" ? "PDF" : isImageMime(mime) ? "Image" : "File");

/** What a solution is attached to. */
export const solutionTarget = (position: number | null | undefined): string =>
  position == null ? "Whole paper" : `Question ${position}`;

/** Up to two initials from a name, falling back to the email, then "?". */
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  // For an email only the part before "@" says anything about the person.
  const source = (name ?? "").trim() || (email ?? "").trim().split("@")[0];
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "");
  return letters.toUpperCase() || "?";
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Contributors ─────────────────────────────────────────────────────────── */

export async function listContributors(): Promise<ContributorList> {
  const { data, error } = await supabase.rpc("admin_list_contributors");
  if (error) throw error;
  return data as unknown as ContributorList;
}

/** 'granted': they already had an account. 'invited': access is applied on their first sign-in. */
export async function addContributor(email: string): Promise<"granted" | "invited"> {
  const { data, error } = await supabase.rpc("admin_add_contributor", { p_email: normalizeEmail(email) });
  if (error) throw error;
  return data === "granted" ? "granted" : "invited";
}

export async function removeContributor(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_remove_contributor", { p_user_id: userId });
  if (error) throw error;
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from("invitations").delete().eq("id", id);
  if (error) throw error;
}

/* ── Review inbox ─────────────────────────────────────────────────────────── */

export async function loadReviewInbox(): Promise<ReviewInbox> {
  const { data, error } = await supabase.rpc("admin_review_inbox");
  if (error) throw error;
  return data as unknown as ReviewInbox;
}

/** Accepting applies the suggested key to the question. Past attempts are not re-graded. */
export async function decideReview(reviewId: string, accept: boolean, expectedUpdatedAt: string): Promise<void> {
  const { error } = await supabase.rpc("admin_decide_review", {
    p_review_id: reviewId,
    p_accept: accept,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
}

export async function decideSolution(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_decide_solution", { p_id: id, p_approve: approve });
  if (error) throw error;
}

/** Short-lived link to a file in the private `solutions` bucket. */
export async function solutionUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("solutions").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create a link to the file");
  return data.signedUrl;
}
