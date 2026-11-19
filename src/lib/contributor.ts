import { supabase } from "@/integrations/supabase/client";
import { parseVideoLink } from "./video-link";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  extensionForMime,
  reviewPayload,
  validateReview,
  validateSolutionFile,
  type KeyKind,
  type ReviewVerdict,
} from "./contributor-helpers";

// Pure helpers live in ./contributor-helpers so they can be tested without the
// Supabase client; re-exported here so pages need a single import.
export * from "./contributor-helpers";

/**
 * Data layer for the contributor portal.
 *
 * Row-level security already limits answer_reviews to the caller's own rows
 * (admins can read all), and shows a contributor other people's *approved*
 * solutions too, so every "my ..." query filters by author explicitly.
 */

export const contributorKeys = {
  papers: ["contrib-papers"] as const,
  paper: (id: string) => ["contrib-paper", id] as const,
  key: (id: string) => ["contrib-key", id] as const,
  reviews: (paperId: string) => ["contrib-reviews", paperId] as const,
  solutions: (paperId: string) => ["contrib-solutions", paperId] as const,
  myReviews: ["contrib-my-reviews"] as const,
  mySolutions: ["contrib-my-solutions"] as const,
  stats: ["contrib-stats"] as const,
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You need to be signed in.");
  return data.user.id;
}

/* ── Paper queue ──────────────────────────────────────────────────────────── */

export interface ReviewPaperRow {
  paper_id: string;
  course: string;
  course_slug: string;
  exam_type: "quiz_1" | "quiz_2" | "end_term";
  term: string;
  year: number;
  exam_date: string;
  programme: string;
  slot: string;
  variant_label: string;
  question_count: number;
  total_marks: number;
  my_reviews: number;
  my_flags: number;
  my_solutions: number;
  approved_solutions: number;
}

export async function listReviewPapers(): Promise<ReviewPaperRow[]> {
  const { data, error } = await supabase.rpc("contributor_papers");
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as unknown as ReviewPaperRow[];
}

/* ── Answer key ───────────────────────────────────────────────────────────── */

export interface AnswerKeyRow {
  questionId: string;
  position: number;
  correct: number[];
  numericalAnswer: string;
}

/** The key for a published paper. Reviewers only; the database enforces it. */
export async function loadAnswerKey(paperId: string): Promise<AnswerKeyRow[]> {
  const { data, error } = await supabase.rpc("get_answer_key", { p_paper_id: paperId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    questionId: r.question_id,
    position: r.position,
    correct: Array.isArray(r.correct) ? (r.correct as unknown[]).filter((n): n is number => typeof n === "number") : [],
    numericalAnswer: r.numerical_answer ?? "",
  }));
}

/* ── Reviews ──────────────────────────────────────────────────────────────── */

export type MyReview = Tables<"answer_reviews">;

/** My reviews, optionally limited to some questions. */
export async function listMyReviews(questionIds?: string[]): Promise<MyReview[]> {
  const userId = await currentUserId();
  let q = supabase.from("answer_reviews").select("*").eq("reviewer_id", userId);
  if (questionIds) {
    if (questionIds.length === 0) return [];
    q = q.in("question_id", questionIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export interface SaveReviewInput {
  questionId: string;
  verdict: ReviewVerdict;
  suggestedCorrect?: number[] | null;
  suggestedNumerical?: string | null;
  note?: string;
  kind?: KeyKind;
  optionCount?: number;
}

/** Create or change my review of a question. Decided reviews cannot be changed. */
export async function saveReview(input: SaveReviewInput): Promise<MyReview> {
  const problem = validateReview({
    verdict: input.verdict,
    suggestedCorrect: input.suggestedCorrect,
    suggestedNumerical: input.suggestedNumerical,
    note: input.note,
    kind: input.kind,
    optionCount: input.optionCount,
  });
  if (problem) throw new Error(problem);

  const userId = await currentUserId();
  const payload = reviewPayload(input);
  const { data, error } = await supabase
    .from("answer_reviews")
    .upsert(
      {
        question_id: input.questionId,
        reviewer_id: userId,
        verdict: payload.verdict,
        suggested_correct: payload.suggested_correct as Json,
        suggested_numerical: payload.suggested_numerical,
        note: payload.note,
      },
      { onConflict: "question_id,reviewer_id" }
    )
    .select("*")
    .single();
  if (error) {
    // The update policy only allows a pending review; a decided one trips it.
    if (error.code === "42501") throw new Error("This review has already been decided and can no longer be changed.");
    throw error;
  }
  return data;
}

export async function deleteMyReview(id: string): Promise<void> {
  const { error } = await supabase.from("answer_reviews").delete().eq("id", id);
  if (error) throw error;
}

/* ── Solutions ────────────────────────────────────────────────────────────── */

export type MySolution = Tables<"paper_solutions">;

const BUCKET = "solutions";

export interface UploadSolutionInput {
  paperId: string;
  /** null = a solution for the whole paper. */
  questionId: string | null;
  file: File;
  note?: string;
}

export async function uploadSolution(input: UploadSolutionInput): Promise<MySolution> {
  const problem = validateSolutionFile(input.file);
  if (problem) throw new Error(problem);
  const ext = extensionForMime(input.file.type);
  if (!ext) throw new Error("Only PDF, PNG, JPEG or WebP files can be uploaded.");

  const userId = await currentUserId();
  const path = `${input.paperId}/${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("paper_solutions")
    .insert({
      paper_id: input.paperId,
      question_id: input.questionId,
      author_id: userId,
      storage_path: path,
      file_name: input.file.name.slice(0, 200) || `solution.${ext}`,
      mime: input.file.type,
      size_bytes: input.file.size,
      note: (input.note ?? "").trim().slice(0, 500),
    })
    .select("*")
    .single();
  if (error) {
    // Do not leave an orphaned file behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export interface AddVideoSolutionInput {
  paperId: string;
  /** null = a solution for the whole paper. */
  questionId: string | null;
  /** Anything pasted: YouTube or Google Drive. Normalised before saving. */
  link: string;
  /** Short title shown to students and admins. */
  title?: string;
  note?: string;
}

/** A video solution is a link: nothing is uploaded, so it costs no storage. */
export async function addVideoSolution(input: AddVideoSolutionInput): Promise<MySolution> {
  const video = parseVideoLink(input.link);
  if (!video) throw new Error("Paste a YouTube or Google Drive video link.");
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("paper_solutions")
    .insert({
      paper_id: input.paperId,
      question_id: input.questionId,
      author_id: userId,
      kind: "video",
      video_url: video.canonical,
      file_name: (input.title ?? "").trim().slice(0, 200) || (video.provider === "youtube" ? "YouTube video" : "Drive video"),
      note: (input.note ?? "").trim().slice(0, 500),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** My solutions (always only mine), optionally for one paper. */
export async function listMySolutions(paperId?: string): Promise<MySolution[]> {
  const userId = await currentUserId();
  let q = supabase.from("paper_solutions").select("*").eq("author_id", userId).order("created_at", { ascending: false });
  if (paperId) q = q.eq("paper_id", paperId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Only a pending solution can be withdrawn. */
export async function deleteMySolution(row: Pick<MySolution, "id" | "storage_path" | "status">): Promise<void> {
  if (row.status !== "pending") throw new Error("Only a solution that is still pending can be deleted.");
  const { error } = await supabase.from("paper_solutions").delete().eq("id", row.id);
  if (error) throw error;
  // Best effort: the row is the source of truth, the file is just storage.
  // Video rows are links and have no file.
  if (row.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path]);
}

/** A link that works for an hour. The bucket is private. */
export async function solutionUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not open the file.");
  return data.signedUrl;
}

/* ── Submissions across papers ────────────────────────────────────────────── */

interface PaperContext {
  courses: { name: string; slug: string };
  sittings: { exam_type: "quiz_1" | "quiz_2" | "end_term"; term: string; year: number };
}

export interface SubmittedReview {
  id: string;
  questionId: string;
  paperId: string;
  position: number;
  course: string;
  courseSlug: string;
  examType: "quiz_1" | "quiz_2" | "end_term";
  term: string;
  year: number;
  verdict: ReviewVerdict;
  status: MyReview["status"];
  suggestedCorrect: number[];
  suggestedNumerical: string;
  note: string;
  createdAt: string;
}

export async function listSubmittedReviews(): Promise<SubmittedReview[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("answer_reviews")
    .select(
      "id, question_id, verdict, status, suggested_correct, suggested_numerical, note, created_at, questions!inner(position, paper_id, papers!inner(courses!inner(name, slug), sittings!inner(exam_type, term, year)))"
    )
    .eq("reviewer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    question_id: string;
    verdict: ReviewVerdict;
    status: MyReview["status"];
    suggested_correct: unknown;
    suggested_numerical: string | null;
    note: string;
    created_at: string;
    questions: { position: number; paper_id: string; papers: PaperContext };
  }[]).map((r) => ({
    id: r.id,
    questionId: r.question_id,
    paperId: r.questions.paper_id,
    position: r.questions.position,
    course: r.questions.papers.courses.name,
    courseSlug: r.questions.papers.courses.slug,
    examType: r.questions.papers.sittings.exam_type,
    term: r.questions.papers.sittings.term,
    year: r.questions.papers.sittings.year,
    verdict: r.verdict,
    status: r.status,
    suggestedCorrect: Array.isArray(r.suggested_correct)
      ? (r.suggested_correct as unknown[]).filter((n): n is number => typeof n === "number")
      : [],
    suggestedNumerical: r.suggested_numerical ?? "",
    note: r.note,
    createdAt: r.created_at,
  }));
}

export interface SubmittedSolution {
  id: string;
  paperId: string;
  /** null for a whole-paper solution. */
  position: number | null;
  course: string;
  examType: "quiz_1" | "quiz_2" | "end_term";
  term: string;
  year: number;
  kind: "file" | "video";
  videoUrl: string | null;
  fileName: string;
  mime: string;
  sizeBytes: number;
  storagePath: string | null;
  note: string;
  status: MySolution["status"];
  createdAt: string;
}

export async function listSubmittedSolutions(): Promise<SubmittedSolution[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("paper_solutions")
    .select(
      "id, paper_id, kind, video_url, file_name, mime, size_bytes, storage_path, note, status, created_at, questions(position), papers!inner(courses!inner(name, slug), sittings!inner(exam_type, term, year))"
    )
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    paper_id: string;
    kind: "file" | "video";
    video_url: string | null;
    file_name: string;
    mime: string | null;
    size_bytes: number | null;
    storage_path: string | null;
    note: string;
    status: MySolution["status"];
    created_at: string;
    questions: { position: number } | null;
    papers: PaperContext;
  }[]).map((s) => ({
    id: s.id,
    paperId: s.paper_id,
    position: s.questions?.position ?? null,
    course: s.papers.courses.name,
    examType: s.papers.sittings.exam_type,
    term: s.papers.sittings.term,
    year: s.papers.sittings.year,
    kind: s.kind ?? "file",
    videoUrl: s.video_url,
    fileName: s.file_name,
    mime: s.mime ?? "",
    sizeBytes: s.size_bytes ?? 0,
    storagePath: s.storage_path,
    note: s.note,
    status: s.status,
    createdAt: s.created_at,
  }));
}
