import { supabase } from "@/integrations/supabase/client";
import type { Question, QuestionAsset, SubQuestion } from "@/data/questions";
import type { Database } from "@/integrations/supabase/types";
import {
  courseSlug,
  durationForExamType,
  normaliseCourseHeading,
  termForDate,
  type ExamType,
  type MergedPaper,
  type MergedSitting,
} from "./pyq-ingest";

/**
 * Writes a merged sitting into Supabase.
 *
 * Kept apart from `@/lib/pyq-ingest` so that all the decision-making — dedup,
 * hashing, filename parsing — stays pure and unit tested, and this file is only
 * the I/O.
 *
 * Nothing here runs in a transaction: PostgREST has no multi-statement
 * transaction, so publishing is ordered to be safely re-runnable instead. A
 * paper is inserted unpublished, filled, and only flipped to published once its
 * questions and figures are in place, so a failure part-way leaves rows that are
 * invisible to students rather than a half-built paper on the site.
 */

export const FIGURE_BUCKET = "question-figures";

type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
export type CourseLevel = Database["public"]["Enums"]["course_level"];

export interface CourseCatalog {
  /** Normalised alias → course. */
  byAlias: Map<string, CourseRow>;
  courses: CourseRow[];
}

export async function loadCourseCatalog(): Promise<CourseCatalog> {
  const [{ data: courses }, { data: aliases }] = await Promise.all([
    supabase.from("courses").select("*").order("name"),
    supabase.from("course_aliases").select("course_id, alias"),
  ]);

  const list = courses ?? [];
  const byId = new Map(list.map((c) => [c.id, c]));
  const byAlias = new Map<string, CourseRow>();
  for (const a of aliases ?? []) {
    const c = byId.get(a.course_id);
    if (c) byAlias.set(a.alias, c);
  }
  return { byAlias, courses: list };
}

/** What a heading resolved to, for the review table. */
export interface CourseResolution {
  heading: string;
  course: CourseRow | null;
}

export function resolveHeadings(catalog: CourseCatalog, headings: string[]): CourseResolution[] {
  return headings.map((heading) => ({
    heading,
    course: catalog.byAlias.get(normaliseCourseHeading(heading)) ?? null,
  }));
}

/**
 * Point a heading at a course, remembering the mapping.
 *
 * The alias is what makes the importer self-improving: the next paper that uses
 * the same abbreviation resolves without asking.
 */
export async function mapHeadingToCourse(heading: string, courseId: string): Promise<void> {
  const alias = normaliseCourseHeading(heading);
  const { error } = await supabase
    .from("course_aliases")
    .upsert({ course_id: courseId, alias }, { onConflict: "alias" });
  if (error) throw error;
}

/**
 * Create a course for a heading nobody has mapped yet.
 *
 * `confirmed` is false so an admin can find these later and correct the name and
 * level — the PDF only gives an abbreviation, and the level is not in the file
 * at all (the programme in the filename is the student cohort, not the level).
 */
export async function createCourseForHeading(
  heading: string,
  name: string,
  level: CourseLevel
): Promise<CourseRow> {
  const { data, error } = await supabase
    .from("courses")
    .insert({ name, slug: courseSlug(name), level, confirmed: false })
    .select()
    .single();
  if (error) throw error;
  await mapHeadingToCourse(heading, data.id);
  return data;
}

/* ── Sitting ──────────────────────────────────────────────────────────────── */

export async function upsertSitting(date: string, examType: ExamType): Promise<string> {
  const { term, year } = termForDate(date);
  const { data, error } = await supabase
    .from("sittings")
    .upsert(
      { exam_date: date, exam_type: examType, term, year },
      { onConflict: "exam_date,exam_type" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/* ── Figures ──────────────────────────────────────────────────────────────── */

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Upload one question's figures and return the rows linking them back.
 *
 * `upsert` is on so that re-publishing a paper overwrites rather than erroring,
 * which keeps the whole operation re-runnable.
 */
async function uploadFigures(
  paperId: string,
  questionId: string,
  assets: QuestionAsset[]
): Promise<{ question_id: string; asset_key: string; storage_path: string; alt: string }[]> {
  const rows: { question_id: string; asset_key: string; storage_path: string; alt: string }[] = [];
  for (const asset of assets) {
    if (!asset.src.startsWith("data:")) continue;
    const path = `${paperId}/${questionId}/${asset.id}.png`;
    const blob = await dataUrlToBlob(asset.src);
    const { error } = await supabase.storage
      .from(FIGURE_BUCKET)
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (error) throw error;
    rows.push({ question_id: questionId, asset_key: asset.id, storage_path: path, alt: asset.alt });
  }
  return rows;
}

export function figureUrl(storagePath: string): string {
  return supabase.storage.from(FIGURE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/* ── Publishing ───────────────────────────────────────────────────────────── */

const CHUNK = 100;

const chunked = <T,>(xs: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

const kindOf = (q: Question): Database["public"]["Enums"]["question_kind"] => q.type;

export interface PublishParams {
  sitting: MergedSitting;
  examType: ExamType;
  /** Normalised heading → course id, already resolved by the review step. */
  courseByHeading: Map<string, string>;
  /** Only these headings are published; anything else is skipped. */
  selected: Set<string>;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface PublishResult {
  paperIds: string[];
  publishedCourses: number;
  skipped: string[];
  figures: number;
}

export async function publishSitting(params: PublishParams): Promise<PublishResult> {
  const { sitting, examType, courseByHeading, selected, onProgress } = params;

  const wanted = sitting.papers.filter((p) => selected.has(p.normalisedHeading));
  const sittingId = await upsertSitting(sitting.date, examType);
  const duration = durationForExamType(examType);

  const result: PublishResult = { paperIds: [], publishedCourses: 0, skipped: [], figures: 0 };

  for (let i = 0; i < wanted.length; i++) {
    const paper = wanted[i];
    onProgress?.(i, wanted.length, paper.sourceHeading);

    const courseId = courseByHeading.get(paper.normalisedHeading);
    if (!courseId) {
      result.skipped.push(paper.sourceHeading);
      continue;
    }

    const paperId = await writePaper(sittingId, courseId, duration, paper);
    result.paperIds.push(paperId);
    result.figures += await writeQuestions(paperId, paper.questions);

    // Only now is the paper whole, so only now does it become visible.
    const { error } = await supabase.from("papers").update({ published: true }).eq("id", paperId);
    if (error) throw error;
    result.publishedCourses++;
  }

  onProgress?.(wanted.length, wanted.length, "done");
  return result;
}

async function writePaper(
  sittingId: string,
  courseId: string,
  duration: number,
  paper: MergedPaper
): Promise<string> {
  // The unique key is (sitting, course, programme, content_hash), so re-running
  // an import updates the existing row instead of creating a second one.
  const { data, error } = await supabase
    .from("papers")
    .upsert(
      {
        sitting_id: sittingId,
        course_id: courseId,
        programme: paper.programme,
        slot: paper.slot,
        duration_minutes: duration,
        source_codes: paper.sourceCodes,
        content_hash: paper.contentHash,
        variant_label: paper.variantLabel,
        total_marks: paper.totalMarks,
        question_count: paper.questionCount,
        published: false,
      },
      { onConflict: "sitting_id,course_id,programme,content_hash" }
    )
    .select("id")
    .single();
  if (error) throw error;

  // Replace the question set wholesale; cascades clear the old assets.
  const { error: delErr } = await supabase.from("questions").delete().eq("paper_id", data.id);
  if (delErr) throw delErr;

  return data.id;
}

async function writeQuestions(paperId: string, questions: Question[]): Promise<number> {
  const rows = questions.map((q, i) => ({
    paper_id: paperId,
    position: i + 1,
    kind: kindOf(q),
    marks: Number(q.marks) || 0,
    stem: q.stem,
    passage: q.passage,
    options: q.options as unknown as Database["public"]["Tables"]["questions"]["Insert"]["options"],
    correct: q.correct as unknown as Database["public"]["Tables"]["questions"]["Insert"]["correct"],
    numerical_answer: q.numericalAnswer,
    sub_questions: stripSubAssets(q.subQuestions) as unknown as Database["public"]["Tables"]["questions"]["Insert"]["sub_questions"],
    source_question_id: q.id.replace(/^tcs-/, ""),
    issues: q.issues as unknown as Database["public"]["Tables"]["questions"]["Insert"]["issues"],
  }));

  const inserted: { id: string; position: number }[] = [];
  for (const batch of chunked(rows)) {
    const { data, error } = await supabase.from("questions").insert(batch).select("id, position");
    if (error) throw error;
    inserted.push(...(data ?? []));
  }

  const idByPosition = new Map(inserted.map((r) => [r.position, r.id]));
  let figures = 0;
  const assetRows: Awaited<ReturnType<typeof uploadFigures>> = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionId = idByPosition.get(i + 1);
    if (!questionId) continue;
    // A comprehension parent owns its children's figures too, since the runner
    // renders child stems against the parent's asset list.
    const all = [...q.assets, ...q.subQuestions.flatMap((s) => s.assets)];
    if (all.length === 0) continue;
    const rows = await uploadFigures(paperId, questionId, all);
    assetRows.push(...rows);
    figures += rows.length;
  }

  for (const batch of chunked(assetRows)) {
    const { error } = await supabase
      .from("question_assets")
      .upsert(batch, { onConflict: "question_id,asset_key" });
    if (error) throw error;
  }

  return figures;
}

/**
 * Sub-question figures are uploaded against the parent row, so the JSON copy
 * keeps only the reference and drops the (very large) data URL.
 */
function stripSubAssets(subs: SubQuestion[]): SubQuestion[] {
  return subs.map((s) => ({ ...s, assets: s.assets.map((a) => ({ ...a, src: "" })) }));
}
