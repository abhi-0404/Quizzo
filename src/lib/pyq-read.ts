import { supabase } from "@/integrations/supabase/client";
import type { QuestionAsset } from "@/data/questions";
import type { ExamQuestion } from "@/data/preview-paper";
import type { Database } from "@/integrations/supabase/types";
import { figureUrl } from "./pyq-publish";
import { gradeAnswer, type AnswerStatus, type Response } from "./grade";

// Grading lives in ./grade so it stays importable without the Supabase client.
export { gradeAnswer, summarise, matchesNumeric } from "./grade";
export type { AnswerStatus, Response } from "./grade";

/**
 * Everything the student-facing pages read.
 *
 * The degree browser, course pages and the exam runner are all reachable
 * without signing in, so every query here has to work as `anon` — which the
 * migration's read policies allow for published papers only.
 */

export type CourseLevel = Database["public"]["Enums"]["course_level"];
export type ExamType = Database["public"]["Enums"]["exam_type"];

export interface CourseCounts {
  papers: number;
  questions: number;
}

export interface CourseSummary {
  id: string;
  name: string;
  slug: string;
  level: CourseLevel;
  /** Totals across every exam type. */
  paperCount: number;
  questionCount: number;
  /** Same totals split by exam type, so the browser's filter is real. */
  byExamType: Record<ExamType, CourseCounts>;
}

const emptyCounts = (): Record<ExamType, CourseCounts> => ({
  quiz_1: { papers: 0, questions: 0 },
  quiz_2: { papers: 0, questions: 0 },
  end_term: { papers: 0, questions: 0 },
});

/**
 * The catalog, with real paper and question counts.
 *
 * `question_count` is denormalised onto `papers` at publish time precisely so
 * this stays two queries rather than a count per course.
 */
export async function listCourses(): Promise<CourseSummary[]> {
  const [{ data: courses }, { data: papers }] = await Promise.all([
    supabase.from("courses").select("id, name, slug, level").order("name"),
    supabase
      .from("papers")
      .select("course_id, question_count, sittings!inner(exam_type)")
      .eq("published", true),
  ]);

  const tally = new Map<string, Record<ExamType, CourseCounts>>();
  for (const row of (papers ?? []) as unknown as {
    course_id: string;
    question_count: number | null;
    sittings: { exam_type: ExamType };
  }[]) {
    const forCourse = tally.get(row.course_id) ?? emptyCounts();
    const bucket = forCourse[row.sittings.exam_type];
    bucket.papers += 1;
    bucket.questions += row.question_count ?? 0;
    tally.set(row.course_id, forCourse);
  }

  return (courses ?? []).map((c) => {
    const byExamType = tally.get(c.id) ?? emptyCounts();
    const all = Object.values(byExamType);
    return {
      ...c,
      byExamType,
      paperCount: all.reduce((n, b) => n + b.papers, 0),
      questionCount: all.reduce((n, b) => n + b.questions, 0),
    };
  });
}

export interface PaperSummary {
  id: string;
  courseName: string;
  courseSlug: string;
  examDate: string;
  examType: ExamType;
  term: string;
  year: number;
  programme: Database["public"]["Enums"]["exam_programme"];
  slot: Database["public"]["Enums"]["exam_slot"];
  variantLabel: string;
  durationMinutes: number;
  totalMarks: number;
  questionCount: number;
  sourceCodes: string[];
  examCode: string;
}

const EXAM_LABEL: Record<ExamType, string> = {
  quiz_1: "Quiz 1",
  quiz_2: "Quiz 2",
  end_term: "End Term",
};

export const examTypeLabel = (t: ExamType) => EXAM_LABEL[t] ?? t;

/** Papers for one course, newest sitting first. */
export async function listPapersForCourse(slug: string): Promise<PaperSummary[]> {
  const { data, error } = await supabase
    .from("papers")
    .select(
      "id, programme, slot, variant_label, duration_minutes, total_marks, question_count, source_codes, exam_code, courses!inner(name, slug), sittings!inner(exam_date, exam_type, term, year)"
    )
    .eq("published", true)
    .eq("courses.slug", slug);
  if (error) throw error;

  type Row = (typeof data)[number] & {
    courses: { name: string; slug: string };
    sittings: { exam_date: string; exam_type: ExamType; term: string; year: number };
  };

  return ((data ?? []) as Row[])
    .map((r) => ({
      id: r.id,
      courseName: r.courses.name,
      courseSlug: r.courses.slug,
      examDate: r.sittings.exam_date,
      examType: r.sittings.exam_type,
      term: r.sittings.term,
      year: r.sittings.year,
      programme: r.programme,
      slot: r.slot,
      variantLabel: r.variant_label,
      durationMinutes: r.duration_minutes,
      totalMarks: r.total_marks,
      questionCount: r.question_count,
      sourceCodes: r.source_codes ?? [],
      examCode: r.exam_code ?? "",
    }))
    .sort((a, b) => b.examDate.localeCompare(a.examDate) || a.programme.localeCompare(b.programme));
}

/** A question as the runner consumes it, now carrying its answer key. */
export interface LoadedQuestion extends ExamQuestion {
  /** Database id — needed so an attempt can record answers per question. */
  questionId: string;
  correct: number[];
  numericalAnswer: string;
}

export interface LoadedPaper {
  paper: PaperSummary;
  questions: LoadedQuestion[];
}

/**
 * Load one paper for the runner.
 *
 * Comprehension parents are flattened into one entry per sub-question, matching
 * what `toExamQuestions` already does for the admin preview, so the runner has a
 * single flat list either way.
 */
export async function loadPaper(paperId: string): Promise<LoadedPaper | null> {
  const { data: paperRow, error } = await supabase
    .from("papers")
    .select(
      "id, programme, slot, variant_label, duration_minutes, total_marks, question_count, source_codes, exam_code, courses!inner(name, slug), sittings!inner(exam_date, exam_type, term, year)"
    )
    .eq("id", paperId)
    .maybeSingle();
  if (error) throw error;
  if (!paperRow) return null;

  const [{ data: questionRows }, { data: assetRows }] = await Promise.all([
    supabase.from("questions").select("*").eq("paper_id", paperId).order("position"),
    supabase
      .from("question_assets")
      .select("question_id, asset_key, storage_path, alt")
      .in(
        "question_id",
        (await supabase.from("questions").select("id").eq("paper_id", paperId)).data?.map((q) => q.id) ?? []
      ),
  ]);

  const assetsByQuestion = new Map<string, QuestionAsset[]>();
  for (const a of assetRows ?? []) {
    const list = assetsByQuestion.get(a.question_id) ?? [];
    list.push({ id: a.asset_key, src: figureUrl(a.storage_path), alt: a.alt });
    assetsByQuestion.set(a.question_id, list);
  }

  /* Comprehension groups were expanded into one row per sub-question at publish
     time, so the rows are already the flat list the runner wants — each child
     carrying its group's passage. */
  const questions: LoadedQuestion[] = (questionRows ?? []).map((row, i) => ({
    id: i + 1,
    questionId: row.id,
    type: row.kind === "numerical" ? "integer" : row.kind === "multi" ? "multi" : "single",
    text: row.stem,
    options: row.kind === "numerical" ? [] : ((row.options as unknown as string[]) ?? []).filter(Boolean),
    passage: row.passage || undefined,
    marks: Number(row.marks) || 0,
    assets: assetsByQuestion.get(row.id) ?? [],
    correct: (row.correct as unknown as number[]) ?? [],
    numericalAnswer: row.numerical_answer ?? "",
  }));

  const r = paperRow as typeof paperRow & {
    courses: { name: string; slug: string };
    sittings: { exam_date: string; exam_type: ExamType; term: string; year: number };
  };

  return {
    paper: {
      id: r.id,
      courseName: r.courses.name,
      courseSlug: r.courses.slug,
      examDate: r.sittings.exam_date,
      examType: r.sittings.exam_type,
      term: r.sittings.term,
      year: r.sittings.year,
      programme: r.programme,
      slot: r.slot,
      variantLabel: r.variant_label,
      durationMinutes: r.duration_minutes,
      totalMarks: r.total_marks,
      questionCount: r.question_count,
      sourceCodes: r.source_codes ?? [],
      examCode: r.exam_code ?? "",
    },
    questions,
  };
}

/* ── Attempts ─────────────────────────────────────────────────────────────── */

export interface AttemptAnswerInput {
  questionId: string;
  response: Response;
  status: AnswerStatus;
  marks: number;
  timeSeconds: number;
}

export interface SaveAttemptInput {
  userId: string;
  paperId: string;
  mode: Database["public"]["Enums"]["attempt_mode"];
  durationSeconds: number;
  totalMarks: number;
  answers: AttemptAnswerInput[];
}

/** Persist a finished session. Returns the attempt id, or null if not signed in. */
export async function saveAttempt(input: SaveAttemptInput): Promise<string | null> {
  const score = input.answers.reduce((n, a) => n + a.marks, 0);
  const counts = input.answers.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Record<AnswerStatus, number>
  );

  const { data, error } = await supabase
    .from("attempts")
    .insert({
      user_id: input.userId,
      paper_id: input.paperId,
      mode: input.mode,
      submitted_at: new Date().toISOString(),
      duration_seconds: input.durationSeconds,
      score,
      total_marks: input.totalMarks,
      correct_count: counts.correct ?? 0,
      incorrect_count: counts.incorrect ?? 0,
      skipped_count: counts.skipped ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;

  // One row per question so the report can show per-question time and outcome.
  const rows = input.answers.map((a) => ({
    attempt_id: data.id,
    question_id: a.questionId,
    response: (a.response ?? null) as never,
    status: a.status,
    marks_awarded: a.marks,
    time_seconds: a.timeSeconds,
  }));
  if (rows.length) {
    const { error: answerError } = await supabase.from("attempt_answers").insert(rows);
    if (answerError) throw answerError;
  }

  return data.id;
}

export interface AttemptDetail {
  id: string;
  paperId: string;
  courseName: string;
  courseSlug: string;
  examType: ExamType;
  examDate: string;
  mode: Database["public"]["Enums"]["attempt_mode"];
  score: number;
  totalMarks: number;
  correct: number;
  incorrect: number;
  skipped: number;
  durationSeconds: number;
  submittedAt: string | null;
  answers: {
    questionId: string;
    position: number;
    kind: string;
    marks: number;
    status: AnswerStatus;
    marksAwarded: number;
    timeSeconds: number;
  }[];
}

export async function loadAttempt(attemptId: string): Promise<AttemptDetail | null> {
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, paper_id, mode, score, total_marks, correct_count, incorrect_count, skipped_count, duration_seconds, submitted_at, papers!inner(courses!inner(name, slug), sittings!inner(exam_date, exam_type))"
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: answers } = await supabase
    .from("attempt_answers")
    .select("question_id, status, marks_awarded, time_seconds, questions!inner(position, kind, marks)")
    .eq("attempt_id", attemptId);

  const r = data as typeof data & {
    papers: {
      courses: { name: string; slug: string };
      sittings: { exam_date: string; exam_type: ExamType };
    };
  };

  return {
    id: r.id,
    paperId: r.paper_id,
    courseName: r.papers.courses.name,
    courseSlug: r.papers.courses.slug,
    examType: r.papers.sittings.exam_type,
    examDate: r.papers.sittings.exam_date,
    mode: r.mode,
    score: Number(r.score),
    totalMarks: r.total_marks,
    correct: r.correct_count,
    incorrect: r.incorrect_count,
    skipped: r.skipped_count,
    durationSeconds: r.duration_seconds,
    submittedAt: r.submitted_at,
    answers: ((answers ?? []) as never[])
      .map((a: never) => {
        const row = a as unknown as {
          question_id: string;
          status: AnswerStatus;
          marks_awarded: number;
          time_seconds: number;
          questions: { position: number; kind: string; marks: number };
        };
        return {
          questionId: row.question_id,
          position: row.questions.position,
          kind: row.questions.kind,
          marks: Number(row.questions.marks),
          status: row.status,
          marksAwarded: Number(row.marks_awarded),
          timeSeconds: row.time_seconds,
        };
      })
      .sort((a, b) => a.position - b.position),
  };
}

export interface AttemptSummary {
  id: string;
  courseName: string;
  courseSlug: string;
  examType: ExamType;
  examDate: string;
  score: number;
  totalMarks: number;
  submittedAt: string | null;
}

export async function listAttempts(userId: string): Promise<AttemptSummary[]> {
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, score, total_marks, submitted_at, papers!inner(courses!inner(name, slug), sittings!inner(exam_date, exam_type))"
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as never[]).map((row: never) => {
    const r = row as unknown as {
      id: string;
      score: number;
      total_marks: number;
      submitted_at: string | null;
      papers: {
        courses: { name: string; slug: string };
        sittings: { exam_date: string; exam_type: ExamType };
      };
    };
    return {
      id: r.id,
      courseName: r.papers.courses.name,
      courseSlug: r.papers.courses.slug,
      examType: r.papers.sittings.exam_type,
      examDate: r.papers.sittings.exam_date,
      score: Number(r.score),
      totalMarks: r.total_marks,
      submittedAt: r.submitted_at,
    };
  });
}

/* ── Admin question bank ──────────────────────────────────────────────────── */

export interface BankQuestion {
  id: string;
  courseName: string;
  courseSlug: string;
  kind: Database["public"]["Enums"]["question_kind"];
  marks: number;
  stem: string;
  examType: ExamType;
  examDate: string;
  issues: string[];
}

/**
 * Every published question, for the admin bank.
 *
 * Capped rather than paginated: a term is a few thousand rows, and the bank is
 * a search-and-scan surface, not a report.
 */
export async function listQuestionBank(limit = 1000): Promise<BankQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, kind, marks, stem, issues, papers!inner(courses!inner(name, slug), sittings!inner(exam_date, exam_type))")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as never[]).map((row: never) => {
    const r = row as unknown as {
      id: string;
      kind: Database["public"]["Enums"]["question_kind"];
      marks: number;
      stem: string;
      issues: unknown;
      papers: {
        courses: { name: string; slug: string };
        sittings: { exam_date: string; exam_type: ExamType };
      };
    };
    return {
      id: r.id,
      courseName: r.papers.courses.name,
      courseSlug: r.papers.courses.slug,
      kind: r.kind,
      marks: Number(r.marks),
      stem: r.stem,
      examType: r.papers.sittings.exam_type,
      examDate: r.papers.sittings.exam_date,
      issues: Array.isArray(r.issues) ? (r.issues as string[]) : [],
    };
  });
}
