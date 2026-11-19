import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* Node 20 lacks APIs the modern pdf.js build relies on (Promise.withResolvers
   and friends), so the audit reads the PDF through the legacy build, which is
   the same code transpiled down. `extractPdf` imports "pdfjs-dist" by name. */
vi.mock("pdfjs-dist", async () => {
  const legacy = await import("pdfjs-dist/legacy/build/pdf.mjs");
  legacy.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.resolve(__dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
  return legacy;
});

import { extractPdf, type PdfExtract } from "@/lib/pdf-extract";
import { parseTcsIonPaper, type TcsIonPaper } from "@/lib/parse-tcs-ion";
import { normaliseCourseHeading } from "@/lib/pyq-ingest";

/**
 * Audit of the importer against a real IIT Madras paper.
 *
 * Reads "PYQ pdf/IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025.pdf" end to end,
 * parses it, writes one JSON row per question (and per comprehension
 * sub-question) for a human to read, and asserts the paper-wide invariants that
 * every bug found so far broke. Figures are not cropped (Node has no
 * OffscreenCanvas); the report only records which figure regions each question
 * references.
 *
 * Skipped unless the PDF is present: it is a 10 MB binary kept out of git.
 *
 *   PYQ_AUDIT_OUT      where to write the report (default: OS temp dir)
 *   PYQ_AUDIT_EXTRACT  optional cache of the raw extraction; read when it
 *                      exists, written when it does not
 */

const PDF = path.resolve(__dirname, "../../PYQ pdf/IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025.pdf");
const hasPdf = existsSync(PDF);
const OUT = process.env.PYQ_AUDIT_OUT || path.join(os.tmpdir(), "pyq-audit.json");
const EXTRACT_CACHE = process.env.PYQ_AUDIT_EXTRACT;

/**
 * Every normalised heading the seeded `course_aliases` resolve
 * (supabase/migrations 20260731000100 and 20260915000100): each course's own
 * lowercased name plus the abbreviations observed in real papers.
 */
const SEEDED_ALIASES = new Set([
  // course names
  "english i", "english ii", "mathematics i", "mathematics ii", "statistics i", "statistics ii",
  "computational thinking", "programming in python", "database management systems",
  "programming in java", "data structures and algorithms", "modern application development i",
  "modern application development ii", "mathematical methods for data science",
  "machine learning foundations", "machine learning techniques", "machine learning practice",
  "business data management", "business analytics", "tools in data science", "system commands",
  "software engineering", "software testing", "operating systems", "computer systems architecture",
  "computer system design", "artificial intelligence", "deep learning", "deep learning practice",
  "deep learning for computer vision", "large language models", "big data analytics",
  "natural language processing", "reinforcement learning", "programming in c",
  "statistical computing", "advanced algorithms", "game theory and strategy", "managerial economics",
  "market research", "mathematical foundations of generative ai",
  "algorithmic thinking in bioinformatics", "introduction to deep learning and generative ai",
  "strategies for professional growth", "big data and biological networks",
  "data visualization design", "speech technology",
  "design thinking for data-driven app development", "industry 4.0",
  "privacy & security in online social media", "introduction to big data", "financial forensics",
  "linear statistical models", "mathematical thinking", "corporate finance",
  "algorithms for data science (ads)", "machine learning operations (mlops)",
  "data science and ai lab", "app dev lab", "computer networks", "theory of computation",
  "compiler design", "discrete mathematics", "sequential decision making",
  // abbreviations
  "english1", "english2", "maths1", "maths2", "statistics1", "statistics2", "ct",
  "intro to python", "python", "dbms", "java", "pdsa", "appdev1", "appdev2", "mmds", "mlf", "mlt",
  "mlp", "bdm", "tds", "sw engg", "sw testing", "os", "ai", "dlp", "dl(cv)", "llm", "bda", "nlp",
  "rl", "algorithmic thinking in bio", "ads", "spg", "psosm", "dvd", "mlops",
]);

async function loadExtract(): Promise<PdfExtract> {
  if (EXTRACT_CACHE && existsSync(EXTRACT_CACHE)) {
    return JSON.parse(readFileSync(EXTRACT_CACHE, "utf8")) as PdfExtract;
  }
  const buf = readFileSync(PDF);
  const extract = await extractPdf(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  );
  if (EXTRACT_CACHE) writeFileSync(EXTRACT_CACHE, JSON.stringify(extract));
  return extract;
}

const FIGURE = /!\[[^\]]*\]\(asset-([A-Za-z0-9]+)\)/g;
const figuresIn = (...texts: string[]) => texts.flatMap((t) => [...t.matchAll(FIGURE)].map((m) => m[1]));
const textOnly = (s: string) => s.replace(FIGURE, "").trim();

/** Exporter metadata that must never reach a stem, passage or option. */
const LEAK =
  /(Question Number\s*:|Question Id\s*:|Question Type\s*:|Correct Marks\s*:|Section Id\s*:|Sub-Section|Question Shuffling|Possible Answers\s*:|Answers Type\s*:|Response Type\s*:|Display Number Panel|Group All Questions|Clear Response|Question Label\s*:|Group Comprehension)/;
// Detecting stray control characters is the point of this check.
// eslint-disable-next-line no-control-regex
const GARBLE = /[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const NUMERIC = /^-?\d+(\.\d+)?( to -?\d+(\.\d+)?)?$/;

interface Row {
  course: string;
  /** 1-based position in the course; sub-questions also carry `sub`. */
  n: number;
  sub?: number;
  id: string;
  page: number;
  type: string;
  marks: number;
  stemStart: string;
  optionCount: number;
  options: string[];
  correct: number[];
  numericalAnswer: string;
  passage: boolean;
  passageStart: string;
  figures: string[];
  issues: string[];
  /** Problems the audit found that the parser did not flag. Must stay empty. */
  audit: string[];
  /** Unusual but faithful to the source (e.g. a TRUE/FALSE question with 2 options). */
  notes: string[];
}

/** Checks for one question or sub-question. */
function auditOne(
  kind: string,
  stem: string,
  options: string[],
  correct: number[],
  numericalAnswer: string,
  marks: number,
  flagged: boolean
): { audit: string[]; notes: string[] } {
  const audit: string[] = [];
  const notes: string[] = [];
  if (!stem.trim()) audit.push("empty stem");
  if (LEAK.test(stem)) audit.push("metadata leaked into stem");
  if (GARBLE.test(stem) || options.some((o) => GARBLE.test(o))) audit.push("garbled character");
  if (kind === "numerical") {
    if (!numericalAnswer) audit.push("numerical without answer");
    else if (!NUMERIC.test(numericalAnswer)) audit.push(`malformed answer "${numericalAnswer}"`);
    const r = numericalAnswer.match(/^(-?[\d.]+) to (-?[\d.]+)$/);
    if (r && Number(r[1]) > Number(r[2])) audit.push(`inverted range ${numericalAnswer}`);
  } else {
    const filled = options.filter((o) => o.trim()).length;
    if (filled < 2 || filled > 6) audit.push(`${filled} options`);
    else if (filled !== 4) notes.push(`${filled} options`);
    options.forEach((o, i) => {
      if (LEAK.test(o)) audit.push(`metadata leaked into option ${i + 1}`);
      if (/\b\d{10,}\.?/.test(o)) audit.push(`option id inside option ${i + 1}`);
      if (o.length > 600) audit.push(`option ${i + 1} is ${o.length} chars`);
    });
    if (!correct.length) audit.push("no correct option");
    if (correct.some((i) => !options[i]?.trim())) audit.push("correct index points at an empty option");
    if ((kind === "single" || kind === "single_correct") && correct.length > 1) {
      audit.push(`${correct.length} correct on single`);
    }
    if ((kind === "multi" || kind === "multi_correct") && correct.length === 1) {
      notes.push("multi-select with one correct option");
    }
    const seen = new Set<string>();
    for (const o of options.map(textOnly).filter(Boolean)) {
      if (seen.has(o)) audit.push(`duplicate option "${o.slice(0, 40)}"`);
      seen.add(o);
    }
  }
  if (!(marks > 0) || marks > 10) (flagged ? notes : audit).push(`marks ${marks}`);
  return { audit, notes };
}

function report(paper: TcsIonPaper) {
  const rows: Row[] = [];
  for (const course of paper.courses) {
    course.questions.forEach((q, qi) => {
      const base = {
        course: course.name,
        n: qi + 1,
        page: course.questionPages[qi],
        passage: !!q.passage.trim(),
        passageStart: q.passage.slice(0, 160),
      };
      if (q.type === "comprehension") {
        const audit: string[] = [];
        if (!q.passage.trim()) audit.push("empty passage");
        if (LEAK.test(q.passage)) audit.push("metadata leaked into passage");
        if (!q.subQuestions.length) audit.push("no sub-questions");
        rows.push({
          ...base,
          id: q.id,
          type: "comprehension",
          marks: q.marks,
          stemStart: "",
          optionCount: 0,
          options: [],
          correct: [],
          numericalAnswer: "",
          figures: figuresIn(q.passage),
          issues: q.issues,
          audit,
          notes: [],
        });
        q.subQuestions.forEach((s, si) => {
          const choice = s.type !== "numerical";
          rows.push({
            ...base,
            id: s.id,
            sub: si + 1,
            type: s.type,
            marks: s.marks,
            stemStart: s.stem.slice(0, 160),
            optionCount: choice ? s.options.filter((o) => o.trim()).length : 0,
            options: choice ? s.options : [],
            correct: s.correct,
            numericalAnswer: s.numericalAnswer,
            figures: figuresIn(s.stem, ...s.options),
            issues: q.issues.filter((i) => i.startsWith(`Sub-question ${si + 1}:`)),
            ...auditOne(s.type, s.stem, choice ? s.options : [], s.correct, s.numericalAnswer, s.marks, q.issues.length > 0),
          });
        });
        return;
      }
      const choice = q.type !== "numerical";
      rows.push({
        ...base,
        id: q.id,
        type: q.type,
        marks: q.marks,
        stemStart: q.stem.slice(0, 160),
        optionCount: choice ? q.options.filter((o) => o.trim()).length : 0,
        options: choice ? q.options : [],
        correct: q.correct,
        numericalAnswer: q.numericalAnswer,
        figures: figuresIn(q.stem, q.passage, ...q.options),
        issues: q.issues,
        ...auditOne(q.type, q.stem, choice ? q.options : [], q.correct, q.numericalAnswer, q.marks, q.issues.length > 0),
      });
    });
  }

  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  for (const r of rows) if (seen.get(r.id)! > 1) r.audit.push("duplicate id");

  return rows;
}

/** Rows the exporter prints as structure, never as question content. */
const STRUCTURE =
  /^(Question Number|Question Id|Correct Marks|Question Label|Options|Possible Answers|Answers Type|Response Type|Text Areas|Evaluation Required|Show Word Count|Answers Case Sensitive|Question Numbers|Sub-Section|Section |Mandatory|Number of Questions|Display Number|Group |Enable Mark|Clear Response|Maximum Instruction|Minimum Instruction|Question Shuffling|Allowed\s*:|Sub questions)/;

const squash = (s: string) => s.normalize("NFKC").replace(/[^A-Za-z0-9]/g, "").toLowerCase();

/**
 * Every content line of the PDF that does not reach the parsed output.
 *
 * Catches text lost at page breaks, swallowed by a misclassified row, or
 * dropped because a block ended early. Declarations (zero-mark items other
 * than shared reference material) and the document header are out of scope.
 */
function uncoveredLines(paper: TcsIonPaper, extract: PdfExtract): string[] {
  const produced = squash(
    paper.courses
      .flatMap((c) => [
        c.name,
        ...c.questions.flatMap((q) => [
          q.stem,
          q.passage,
          ...q.options,
          q.numericalAnswer,
          ...q.issues,
          ...q.subQuestions.flatMap((s) => [s.stem, ...s.options, s.numericalAnswer]),
        ]),
      ])
      .join(" ")
  );
  const out: string[] = [];
  let declaration = false;
  let started = false;
  for (const line of extract.lines) {
    const t = line.text.replace(/[\u00a0\ufffd]/g, " ").replace(/\s+/g, " ").trim();
    if (/Question Id\s*:/.test(t)) {
      started = true;
      declaration = false;
    }
    if (/^THIS IS QUESTION PAPER FOR THE SUBJECT/.test(t)) declaration = true;
    if (/^Section Id\s*:/.test(t)) declaration = false;
    if (!started || !t || declaration || STRUCTURE.test(t)) continue;
    const body = t.replace(/^\d{10,}\.\s*/, "");
    if (/has been mentioned above|just for a reference/i.test(body)) continue;
    const key = squash(body);
    if (key && !produced.includes(key)) out.push(`p${line.page + 1}: ${t}`);
  }
  return out;
}

describe.skipIf(!hasPdf)("audit of the real QIV4 26 Oct 2025 paper", () => {
  it("parses every question of every course cleanly", async () => {
    const extract = await loadExtract();
    const paper = parseTcsIonPaper(extract, path.basename(PDF));
    const rows = report(paper);
    const lost = uncoveredLines(paper, extract);
    const unmapped = paper.courses
      .map((c) => normaliseCourseHeading(c.name))
      .filter((h) => !SEEDED_ALIASES.has(h));

    const summary = {
      pages: extract.pageCount,
      courses: paper.courses.map((c) => ({
        name: c.name,
        normalised: normaliseCourseHeading(c.name),
        startPage: c.startPage,
        questions: c.questions.length,
        subQuestions: c.questions.reduce((n, q) => n + q.subQuestions.length, 0),
      })),
      stats: paper.stats,
      rows: rows.length,
      flaggedRows: rows.filter((r) => r.issues.length).map((r) => r.id),
      auditFailures: rows.filter((r) => r.audit.length).length,
      notes: rows.filter((r) => r.notes.length).map((r) => `${r.id}: ${r.notes.join("; ")}`),
      lostLines: lost,
      headingsWithoutSeededAlias: unmapped,
    };
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));

    expect(paper.courses).toHaveLength(15);
    expect(paper.contentPaperName).toBe("IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025");
    expect(rows.filter((r) => r.audit.length).map((r) => `${r.id}: ${r.audit.join("; ")}`)).toEqual([]);
    expect(lost).toEqual([]);

    // Shared reference material reaches the questions that depend on it.
    expect(paper.stats.references).toBe(4);
    const ct = paper.courses.find((c) => c.name === "CT")!;
    for (const q of ct.questions) expect(figuresIn(q.passage).length).toBeGreaterThan(0);

    // Only the pen-and-paper attestations are flagged.
    expect(paper.stats.flagged).toBe(3);
    for (const id of summary.flaggedRows) {
      expect(rows.find((r) => r.id === id)!.issues.join(" ")).toMatch(/pen-and-paper/);
    }

    // Scripts survive extraction (A squared, n sub 1).
    const all = JSON.stringify(rows);
    expect(all).toContain("A² = 0.");
  }, 600_000);
});
