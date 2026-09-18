import type { Question } from "@/data/questions";
import type { ImportedCourse, TcsIonPaper } from "./parse-tcs-ion";

/**
 * Turning parsed PDFs into publishable papers.
 *
 * Everything here is pure and synchronous so it can be unit tested without a
 * database or a browser; `@/lib/pyq-publish` owns the Supabase writes.
 *
 * The shape of the source data (measured across 9 real papers, see
 * plan/pyq-pipeline.md) drives every decision below:
 *
 *   * The filename carries programme, slot, exam code and date. Nothing else
 *     does — the PDF's own metadata does not name the exam type at all.
 *   * Two exam codes of the SAME cohort are duplicates of each other.
 *   * Two different cohorts are NOT duplicates, even for the same course on the
 *     same day: Degree and Diploma "AI" share only 29 questions.
 */

/* ── Filename ─────────────────────────────────────────────────────────────── */

export type Programme = "foundation" | "diploma" | "degree" | "improvement";
export type Slot = "fn" | "an";
export type ExamType = "quiz_1" | "quiz_2" | "end_term";

export interface PaperFilename {
  programme: Programme;
  slot: Slot;
  /** Exam code as printed, e.g. "QDB2". */
  code: string;
  /** The cohort's code family, e.g. "QDB" — the digit is only the variant. */
  codeFamily: string;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const FILENAME =
  /(?:IIT\s*M\s+)?(DEGREE|DIPLOMA|FOUNDATION|IMPROVEMENT)\s+(FN|AN)\s+EXAM\s+([A-Z]{2,4}\d*)\s+(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/i;

/**
 * The cohort behind an exam code: "QDB1" and "QDB2" are the same sitting, only
 * the trailing digit differs.
 *
 * Both the filename path and the manual path go through here, so they can never
 * disagree about what counts as a family. An empty code has an empty family.
 */
function codeFamilyOf(code: string): string {
  return code.replace(/\d+$/, "");
}

/**
 * Read the metadata out of a filename such as
 * `IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf`.
 *
 * Returns null when the name does not follow the convention, which the importer
 * surfaces so the admin can fill the fields in by hand rather than guessing.
 */
export function parsePaperFilename(filename: string): PaperFilename | null {
  return parsePaperMetaFromText(filename);
}

/**
 * Reads the same `<programme> <slot> EXAM <code> <day> <month> <year>`
 * convention out of *any* string — filename or otherwise. There is nothing
 * filename-specific about the pattern itself (no extension is required, no
 * anchor to the end of the string), which is what lets the importer try the
 * PDF's own "Question Paper Name :" row first: that row is printed inside the
 * document and survives however the uploaded file happens to be named,
 * whereas the filename is whatever the admin's browser or OS called it.
 */
export function parsePaperMetaFromText(text: string): PaperFilename | null {
  const m = text.match(FILENAME);
  if (!m) return null;

  const month = MONTHS[m[5].slice(0, 3).toLowerCase()];
  if (!month) return null;

  const day = Number(m[4]);
  const year = Number(m[6]);
  const code = m[3].toUpperCase();

  return {
    programme: m[1].toLowerCase() as Programme,
    slot: m[2].toLowerCase() as Slot,
    code,
    codeFamily: codeFamilyOf(code),
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Metadata an admin supplies when a filename carries none. */
export interface ManualPaperMeta {
  programme: Programme;
  slot: Slot;
  /** Exam code as printed, e.g. "QDB2". May be empty for a pre-split file. */
  code: string;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Counted by hand: `Date` remaps a two-digit year and rolls a bad day over. */
function daysInMonth(year: number, month: number): number {
  if (month !== 2) return MONTH_LENGTHS[month - 1];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/**
 * True when a filename carries no usable metadata, so the admin must supply it.
 *
 * Users routinely split a master PDF into per-course files ("MLT.pdf",
 * "Maths2.pdf"), which strips every field the convention encoded.
 */
export function needsManualMeta(filename: string): boolean {
  return parsePaperFilename(filename) === null;
}

/**
 * Build the same record `parsePaperFilename` returns, from fields typed in by
 * hand.
 *
 * The date is rejected rather than coerced: a paper filed under the wrong
 * sitting is silently wrong forever, and `Date` would happily read "2025-02-30"
 * as 2 March.
 */
export function manualPaperFilename(meta: ManualPaperMeta): PaperFilename {
  const m = meta.date.match(ISO_DATE);
  if (!m) throw new Error(`Date must be YYYY-MM-DD, got "${meta.date}".`);

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`"${meta.date}" is not a real calendar date.`);
  }

  const code = meta.code.trim().toUpperCase();

  return {
    programme: meta.programme,
    slot: meta.slot,
    code,
    codeFamily: codeFamilyOf(code),
    date: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

/** Quizzes run an hour per course, end terms an hour and a half. */
export function durationForExamType(examType: ExamType): number {
  return examType === "end_term" ? 90 : 60;
}

/* ── Course headings ──────────────────────────────────────────────────────── */

/**
 * Normalise a section heading for alias lookup.
 *
 * The same course is titled both `Maths2` and `Sem2 Maths2` depending on the
 * paper, so the semester prefix is dropped. Everything is lowercased and inner
 * whitespace collapsed; the result is what `course_aliases.alias` stores.
 */
export function normaliseCourseHeading(heading: string): string {
  return heading
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^sem\s*\d+\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Slug used when a heading has to become a brand-new course record. */
export function courseSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ── Content hash ─────────────────────────────────────────────────────────── */

/**
 * Strip everything that legitimately differs between two extractions of the
 * same paper.
 *
 * Figure references matter here: asset ids come from a per-import counter
 * (`f1`, `f2`, …), so the same course imported on its own and imported
 * alongside others would otherwise produce different text and be stored as a
 * spurious variant.
 */
function hashableText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\(asset-[^)]*\)/g, "[figure]")
    .replace(/\b\d{10,}\b/g, "")
    .replace(/[\s\u00a0\ufffd]+/g, " ")
    .trim()
    .toLowerCase();
}

/** FNV-1a, doubled to 64 bits. Deterministic and dependency-free. */
function fnv1a64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * A stable fingerprint of one course's questions.
 *
 * Two exam codes of the same cohort produce the same hash, which is what makes
 * re-importing idempotent. Two different cohorts do not, which is what keeps
 * their genuinely different papers apart.
 */
export function hashCoursePaper(questions: Question[]): string {
  const parts: string[] = [];
  for (const q of questions) {
    parts.push(q.type);
    parts.push(String(q.marks));
    parts.push(hashableText(q.stem));
    parts.push(hashableText(q.passage));
    for (const o of q.options) parts.push(hashableText(o));
    parts.push(q.correct.join(","));
    parts.push(hashableText(q.numericalAnswer));
    for (const sq of q.subQuestions) {
      parts.push(sq.type);
      parts.push(String(sq.marks));
      parts.push(hashableText(sq.stem));
      for (const o of sq.options) parts.push(hashableText(o));
      parts.push(sq.correct.join(","));
      parts.push(hashableText(sq.numericalAnswer));
    }
  }
  return fnv1a64(parts.join(""));
}

export const marksOfPaper = (questions: Question[]): number =>
  questions.reduce(
    (n, q) =>
      n +
      (q.type === "comprehension"
        ? q.subQuestions.reduce((m, s) => m + (Number(s.marks) || 0), 0)
        : Number(q.marks) || 0),
    0
  );

export const countOfPaper = (questions: Question[]): number =>
  questions.reduce((n, q) => n + (q.type === "comprehension" ? q.subQuestions.length : 1), 0);

/* ── Merging several PDFs into one sitting ────────────────────────────────── */

/** One course's paper, as it will be written to the database. */
export interface MergedPaper {
  /** Heading exactly as the PDF printed it, kept for tracing and for aliasing. */
  sourceHeading: string;
  normalisedHeading: string;
  programme: Programme;
  slot: Slot;
  contentHash: string;
  /** Every exam code whose extraction produced this exact content. */
  sourceCodes: string[];
  /** Set when a cohort produced more than one distinct version of a course. */
  variantLabel: string;
  questions: Question[];
  totalMarks: number;
  questionCount: number;
  /** Index into the merge input, so figures are cropped from the right PDF. */
  sourceFileIndex: number;
  /** 1-based page where this course's section heading appears in its source PDF. */
  startPage: number;
  /** 1-based PDF page of each entry in `questions`, same order, where known. */
  questionPages: number[];
  /**
   * True when these questions preceded the first `Section Id :` row in their
   * source PDF — the tail of whatever section came before, not this course
   * (see parse-tcs-ion.ts's "Unattributed" course). Real content, but from an
   * unknown, possibly unrelated, subject — callers should not pre-select it.
   */
  orphan: boolean;
}

export interface MergeInput {
  file: PaperFilename;
  paper: TcsIonPaper;
}

export interface MergedSitting {
  date: string;
  papers: MergedPaper[];
  stats: {
    files: number;
    /** Course extractions that collapsed into an existing paper. */
    duplicates: number;
    /** Courses where one cohort produced more than one distinct version. */
    variants: number;
  };
}

const VARIANT_LABELS = ["", "Set B", "Set C", "Set D", "Set E", "Set F"];

/**
 * Union several parsed PDFs into the set of papers a sitting actually contains.
 *
 * Papers are keyed on (course heading, programme, content hash). An identical
 * hash means another exam code of the same cohort, so its code is recorded and
 * nothing is inserted twice. A different hash within the same cohort is a real
 * variant and is kept as its own paper rather than silently discarded.
 */
export function mergeSitting(inputs: MergeInput[]): MergedSitting {
  const byKey = new Map<string, MergedPaper>();
  const cohortCourse = new Map<string, number>();
  let duplicates = 0;
  let variants = 0;

  for (let fileIndex = 0; fileIndex < inputs.length; fileIndex++) {
    const { file, paper } = inputs[fileIndex];
    for (const course of paper.courses) {
      const normalised = normaliseCourseHeading(course.name);
      const hash = hashCoursePaper(course.questions);
      const key = `${normalised}|${file.programme}|${hash}`;

      const existing = byKey.get(key);
      if (existing) {
        if (!existing.sourceCodes.includes(file.code)) existing.sourceCodes.push(file.code);
        duplicates++;
        continue;
      }

      // How many distinct versions this cohort has produced for this course.
      const cohortKey = `${normalised}|${file.programme}`;
      const seen = cohortCourse.get(cohortKey) ?? 0;
      cohortCourse.set(cohortKey, seen + 1);
      if (seen > 0) variants++;

      byKey.set(key, {
        sourceHeading: course.name,
        normalisedHeading: normalised,
        programme: file.programme,
        slot: file.slot,
        contentHash: hash,
        sourceCodes: [file.code],
        variantLabel: VARIANT_LABELS[seen] ?? `Set ${seen + 1}`,
        questions: course.questions,
        totalMarks: marksOfPaper(course.questions),
        questionCount: countOfPaper(course.questions),
        sourceFileIndex: fileIndex,
        startPage: course.startPage,
        questionPages: course.questionPages,
        orphan: course.sectionId === "",
      });
    }
  }

  const papers = [...byKey.values()].sort(
    (a, b) =>
      a.normalisedHeading.localeCompare(b.normalisedHeading) ||
      a.programme.localeCompare(b.programme) ||
      a.variantLabel.localeCompare(b.variantLabel)
  );

  return {
    date: inputs[0]?.file.date ?? "",
    papers,
    stats: { files: inputs.length, duplicates, variants },
  };
}

/** Every distinct course heading a merge produced, for alias resolution. */
export const headingsOf = (sitting: MergedSitting): string[] =>
  [...new Set(sitting.papers.map((p) => p.normalisedHeading))].sort();

/** Convenience for the review UI: does every PDF belong to the same date? */
export function sittingDateConflict(inputs: MergeInput[]): string[] {
  return [...new Set(inputs.map((i) => i.file.date))].sort();
}

/* ── Exam type inference ──────────────────────────────────────────────────── */

export interface ScheduledAssessment {
  examType: ExamType;
  /** ISO date. */
  date: string;
}

/**
 * Guess the exam type from the date.
 *
 * The PDF genuinely does not say. `Group Minimum Duration` is 90 on quizzes as
 * well as end terms, and `Duration` varies between two codes of the same
 * sitting, so the only usable signal is which scheduled assessment the paper's
 * date is nearest to. The admin confirms the result — this is a pre-fill, never
 * an authority.
 */
export function inferExamType(
  date: string,
  schedule: ScheduledAssessment[],
  toleranceDays = 21
): ExamType | null {
  if (!date || schedule.length === 0) return null;
  const target = Date.parse(date);
  if (Number.isNaN(target)) return null;

  let best: { type: ExamType; days: number } | null = null;
  for (const entry of schedule) {
    const when = Date.parse(entry.date);
    if (Number.isNaN(when)) continue;
    const days = Math.abs(when - target) / 86_400_000;
    if (!best || days < best.days) best = { type: entry.examType, days };
  }
  return best && best.days <= toleranceDays ? best.type : null;
}

/** "2025-08-31" → the IITM term it belongs to. */
export function termForDate(date: string): { term: string; year: number } {
  const [y, m] = date.split("-").map(Number);
  const term = m >= 9 ? "Sept Term" : m >= 5 ? "May Term" : "Jan Term";
  return { term, year: y || 0 };
}

/** Re-export so the importer can talk about courses without a second import. */
export type { ImportedCourse };
