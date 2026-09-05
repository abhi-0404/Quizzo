import {
  DEFAULT_MARKS,
  blankDraft,
  blankSubQuestion,
  type Question,
  type QuestionAsset,
  type QType,
  type SubQType,
  type SubQuestion,
} from "@/data/questions";
import { CORRECT_COLOUR, type PdfExtract, type PdfLine } from "./pdf-extract";

/**
 * TCS iON exam-paper parser.
 *
 * Turns the line stream from `@/lib/pdf-extract` into the same `Question[]`
 * shapes the paper builder and the bulk LaTeX importer already produce, grouped
 * by course.
 *
 * The source format is rigid and fully machine readable, so no OCR or LLM is
 * involved:
 *
 *   <Course Name>
 *   Section Id : …                    ← course boundary
 *     Question Number : N Question Id : X Question Type : MCQ|MSQ|SA|COMPREHENSION
 *     Correct Marks : M
 *     Question Label : …
 *     <stem lines, or a figure>
 *     Options :                       ← MCQ / MSQ
 *     <optionId>. <tick> <text>       ← the *colour* of optionId is the answer key
 *     Possible Answers :              ← SA
 *     <answer lines>
 *
 * Figures are not read from the PDF's image objects. They are located as the
 * vertical gaps between text lines and cropped off a rendered page, which also
 * captures diagrams drawn as vector paths — those have no image object at all.
 * This module only records *where* to crop; `attachAssets` does the cropping.
 */

/* ── Public shapes ────────────────────────────────────────────────────────── */

export interface AssetRegion {
  page: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export interface ImportedCourse {
  name: string;
  sectionId: string;
  questions: Question[];
}

export interface TcsIonPaper {
  paperName: string;
  courses: ImportedCourse[];
  /** Asset id → the page region to crop for it. Consumed by `attachAssets`. */
  regions: Record<string, AssetRegion>;
  stats: {
    /** Blocks seen, including the per-section declaration items. */
    blocks: number;
    /** Declaration items dropped (`Correct Marks : 0`). */
    declarations: number;
    questions: number;
    byType: Record<string, number>;
    figures: number;
    flagged: number;
  };
}

/* ── Layout constants ─────────────────────────────────────────────────────── */

/**
 * An option row reads `<id>.<tick icon><content>`. The id run always ends at the
 * same x and the 16px tick sits in the gap that follows, so a figure belonging to
 * the option has to be cropped from just past the icon or the tick is baked into
 * the image — and the tick is the answer key, not part of the question.
 */
const OPTION_ICON_GUTTER = 18;

/** Page margin used when cropping a full-width figure. */
const PAGE_MARGIN = 18;

/**
 * A line's recorded bottom is its *baseline*, and descenders hang below it. A
 * crop starting exactly there shaves the tails off the line above and carries
 * them into the figure, so the band starts just under them.
 */
const DESCENDER_PAD = 5;

/**
 * Vertical gap between consecutive text lines that implies something was drawn
 * between them. Body text runs at ~16–20 units of leading, so this clears normal
 * spacing comfortably. False positives are harmless: a crop that turns out to be
 * blank is discarded.
 */
const FIGURE_GAP = 28;

/* ── Line classification ──────────────────────────────────────────────────── */

const RE_QUESTION_HEAD =
  /^(?:Question Number\s*:\s*(\d+)\s+)?Question Id\s*:\s*(\d+)\s+Question Type\s*:\s*([A-Z]+)/;
const RE_SECTION = /^Section Id\s*:/;
const RE_OPTION_ID = /^(\d{10,})\.\s*$/;
const RE_MARKS = /^Correct Marks\s*:\s*([\d.]+)/;
const RE_LABEL = /^Question Label\s*:\s*(.*)$/;
const RE_OPTIONS = /^Options\s*:/;
const RE_POSSIBLE = /^Possible Answers\s*:/;
const RE_ANSWERS_TYPE = /^Answers Type\s*:\s*(\w+)/;
const RE_RESPONSE_TYPE = /^Response Type\s*:\s*(\w+)/;
const RE_QUESTION_NUMBERS = /^Question Numbers\s*:\s*\((\d+)\s*to\s*(\d+)\)/;
const RE_BLOCK_END = /^(Sub-Section Number|Sub questions)\s*:?/;

/** Metadata rows that are never content. */
const RE_META =
  /^(Sub-Section Number|Sub-Section Id|Question Shuffling Allowed|Response Type|Evaluation Required For SA|Show Word Count|Answers Type|Text Areas|Answers Case Sensitive|Section Id|Section Number|Section type|Mandatory or Optional|Number of Questions|Number of Questions to be attempted|Section Marks|Display Number Panel|Section Negative Marks|Group All Questions|Clear Response|Section Maximum Duration|Section Minimum Duration|Section Time In|Maximum Instruction Time|Minimum Instruction Time|Group Number|Group Id|Group Maximum Duration|Group Minimum Duration|Allowed|Correct Marks|Question Label|Options|Question Numbers|Possible Answers)\s*:/;

const TYPE_MAP: Record<string, QType> = {
  MCQ: "single",
  MSQ: "multi",
  SA: "numerical",
  COMPREHENSION: "comprehension",
};
const SUB_TYPE_MAP: Record<string, SubQType> = {
  MCQ: "single_correct",
  MSQ: "multi_correct",
  SA: "numerical",
};

/**
 * Normalise a row for matching.
 *
 * The exporter separates blocks with rows made only of U+00A0 and U+FFFD, which
 * collapse to nothing here — that is what makes a separator row detectable as an
 * empty string.
 */
const clean = (s: string) => s.replace(/[\u00a0\ufffd]/g, " ").replace(/\s+/g, " ").trim();

/* ── Parsing ──────────────────────────────────────────────────────────────── */

interface RawBlock {
  start: number;
  end: number;
  num: number | null;
  id: string;
  type: string;
}

interface ParsedOption {
  id: string;
  text: string;
  correct: boolean;
  /** Set when the option's content is a figure rather than text. */
  region: AssetRegion | null;
}

export function parseTcsIonPaper(extract: PdfExtract, paperName = ""): TcsIonPaper {
  const { lines, optionColour, pageWidth } = extract;

  /* Locate course boundaries. The course name is the last ordinary line before
     the `Section Id :` row — the exporter prints it as a bare heading. */
  const sectionAt = new Map<number, { name: string; id: string }>();
  /** Line index of each course heading — also where the previous course stops. */
  const headingIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = clean(lines[i].text);
    if (!RE_SECTION.test(t)) continue;
    const id = t.match(/^Section Id\s*:\s*(\d+)/)?.[1] ?? "";
    let name = "";
    let at = i;
    for (let j = i - 1; j >= 0 && j > i - 8; j--) {
      const p = clean(lines[j].text);
      if (!p || RE_META.test(p) || /^[\d,.]+$/.test(p)) continue;
      name = p;
      at = j;
      break;
    }
    sectionAt.set(i, { name: name || `Section ${sectionAt.size + 1}`, id });
    headingIdx.push(at);
  }

  /* Locate question blocks. */
  const blocks: RawBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = clean(lines[i].text).match(RE_QUESTION_HEAD);
    if (m) blocks.push({ start: i, end: 0, num: m[1] ? Number(m[1]) : null, id: m[2], type: m[3] });
  }
  /* A block runs to the next question — or to the heading of the next course,
     whichever comes first. Without the second bound, the last question of a
     section would keep reading through the section footer and swallow the next
     course's name as an extra option or possible answer. */
  for (let b = 0; b < blocks.length; b++) {
    const nextBlock = b + 1 < blocks.length ? blocks[b + 1].start : lines.length;
    const nextHeading = headingIdx.find((h) => h > blocks[b].start) ?? lines.length;
    blocks[b].end = Math.min(nextBlock, nextHeading);
  }

  let assetSeq = 0;
  const regions: Record<string, AssetRegion> = {};
  const nextAssetId = () => `f${++assetSeq}`;

  /** Record a crop and return the asset stub that references it. */
  const addAsset = (region: AssetRegion, alt: string): QuestionAsset => {
    const id = nextAssetId();
    regions[id] = region;
    return { id, src: "", alt };
  };

  interface Parsed {
    block: RawBlock;
    marks: number | null;
    stem: string;
    stemAssets: QuestionAsset[];
    options: ParsedOption[];
    answers: string[];
    answersType: string | null;
    responseType: string | null;
    range: [number, number] | null;
  }

  const parseBlock = (block: RawBlock): Parsed => {
    const out: Parsed = {
      block,
      marks: null,
      stem: "",
      stemAssets: [],
      options: [],
      answers: [],
      answersType: null,
      responseType: null,
      range: null,
    };

    const stemLines: string[] = [];
    let mode: "head" | "stem" | "options" | "answers" | "tail" = "head";
    let cur: ParsedOption | null = null;
    let prev: PdfLine | null = null;

    /**
     * Record any figure drawn between two text lines.
     *
     * When the pair straddles a page break the figure can be at the foot of the
     * first page, the head of the second, or split across both, so a region is
     * emitted for each page involved. Regions that turn out to be blank are
     * dropped later by `attachAssets`, which makes over-capturing free.
     */
    const captureFigure = (from: PdfLine | null, to: PdfLine, alt: string) => {
      if (!from) return;
      const wide = (page: number, y: number, y2: number) => {
        if (y2 - y <= FIGURE_GAP) return;
        out.stemAssets.push(
          addAsset({ page, x: PAGE_MARGIN, y, x2: pageWidth[page] - PAGE_MARGIN, y2 }, alt)
        );
      };
      if (from.page === to.page) {
        wide(from.page, from.y2 + DESCENDER_PAD, to.y);
        return;
      }
      wide(from.page, from.y2 + DESCENDER_PAD, extract.pageHeight[from.page] - PAGE_MARGIN);
      for (let p = from.page + 1; p < to.page; p++) {
        wide(p, PAGE_MARGIN, extract.pageHeight[p] - PAGE_MARGIN);
      }
      wide(to.page, PAGE_MARGIN, to.y);
    };

    for (let i = block.start; i < block.end; i++) {
      const line = lines[i];
      const t = clean(line.text);
      if (!t) {
        /* A blank row is the exporter's separator glyph. Option lists and answer
           lists never contain one, but a section footer always starts with a run
           of them — and the next question head can be a long way past that, on
           the far side of the next course heading. Stopping here is what keeps a
           course name from being read as the last option or a possible answer. */
        if (mode === "options" || mode === "answers") mode = "tail";
        prev = line;
        continue;
      }

      let m: RegExpMatchArray | null;
      if ((m = t.match(RE_MARKS))) {
        out.marks = Number(m[1]);
        prev = line;
        continue;
      }
      if ((m = t.match(RE_QUESTION_NUMBERS))) {
        out.range = [Number(m[1]), Number(m[2])];
        prev = line;
        continue;
      }
      if ((m = t.match(RE_ANSWERS_TYPE))) {
        out.answersType = m[1];
        if (mode === "stem") captureFigure(prev, line, "Question figure");
        mode = "tail";
        prev = line;
        continue;
      }
      if ((m = t.match(RE_RESPONSE_TYPE))) {
        // For a short-answer question this row ends the stem, the way
        // `Options :` does for a choice question — so a figure drawn above it is
        // the last thing the stem contains.
        out.responseType = m[1];
        if (mode === "stem") captureFigure(prev, line, "Question figure");
        mode = "tail";
        prev = line;
        continue;
      }
      if ((m = t.match(RE_LABEL))) {
        mode = "stem";
        if (m[1].trim() && !/^(Multiple Choice|Multiple Select|Short Answer|Comprehension)/.test(m[1].trim())) {
          stemLines.push(m[1].trim());
        }
        prev = line;
        continue;
      }
      if (RE_OPTIONS.test(t)) {
        // A figure sitting between the stem and the options belongs to the stem.
        captureFigure(prev, line, "Question figure");
        mode = "options";
        prev = line;
        continue;
      }
      if (RE_POSSIBLE.test(t)) {
        if (mode === "stem") captureFigure(prev, line, "Question figure");
        mode = "answers";
        prev = line;
        continue;
      }
      if (RE_BLOCK_END.test(t)) {
        if (mode === "stem") captureFigure(prev, line, "Question figure");
        mode = "tail";
        prev = line;
        continue;
      }
      if (RE_META.test(t)) {
        prev = line;
        continue;
      }

      if (mode === "stem") {
        captureFigure(prev, line, "Question figure");
        stemLines.push(line.text.trim());
      } else if (mode === "options") {
        const idPiece = line.pieces[0];
        const isOptionRow = idPiece && RE_OPTION_ID.test(idPiece.text.trim());

        if (isOptionRow) {
          const id = idPiece.text.trim().replace(/\.$/, "");
          const rest = line.pieces
            .slice(1)
            .map((p) => p.text)
            .join("")
            .trim();

          cur = {
            id,
            text: rest,
            correct: optionColour[id] === CORRECT_COLOUR,
            region: null,
          };

          /* No text on the row means the option itself is a figure. It is drawn
             in the band ending at this row's baseline, starting past the tick. */
          if (!rest && prev) {
            cur.region = {
              page: line.page,
              x: idPiece.x2 + OPTION_ICON_GUTTER,
              y: prev.page === line.page ? prev.y2 + DESCENDER_PAD : 0,
              x2: pageWidth[line.page] - PAGE_MARGIN,
              y2: line.y2 + 2,
            };
          }
          out.options.push(cur);
        } else if (cur) {
          // Wrapped option text continues the previous entry.
          cur.text = `${cur.text} ${t}`.trim();
        }
      } else if (mode === "answers") {
        out.answers.push(t);
      }

      prev = line;
    }

    out.stem = stemLines.join("\n").trim();
    return out;
  };

  const parsed = blocks.map(parseBlock);

  /* ── Assemble into the repo's question model, grouped by course ─────────── */

  const courses: ImportedCourse[] = [];
  const stats: TcsIonPaper["stats"] = {
    blocks: parsed.length,
    declarations: 0,
    questions: 0,
    byType: {},
    figures: 0,
    flagged: 0,
  };

  const courseFor = (lineIdx: number) => {
    let found: { name: string; id: string } | null = null;
    for (const [at, info] of sectionAt) {
      if (at <= lineIdx) found = info;
      else break;
    }
    return found;
  };

  /** Children of a comprehension parent, by the range it declares. */
  const childrenOf = (p: Parsed): Parsed[] =>
    p.range
      ? parsed.filter(
          (q) =>
            q.block.num !== null &&
            q.block.start > p.block.start &&
            q.block.num >= p.range![0] &&
            q.block.num <= p.range![1]
        )
      : [];

  const consumed = new Set<Parsed>();
  for (const p of parsed) {
    if (p.block.type === "COMPREHENSION") childrenOf(p).forEach((c) => consumed.add(c));
  }

  let seq = 0;
  const byCourse = new Map<string, ImportedCourse>();

  const courseOf = (p: Parsed): ImportedCourse => {
    const info = courseFor(p.block.start) ?? { name: "Uncategorised", id: "" };
    let c = byCourse.get(info.id || info.name);
    if (!c) {
      c = { name: info.name, sectionId: info.id, questions: [] };
      byCourse.set(info.id || info.name, c);
      courses.push(c);
    }
    return c;
  };

  /** `![alt](asset-id)` — protocol-less, so the sanitiser leaves it alone. */
  const ref = (a: QuestionAsset) => `![${a.alt}](asset-${a.id})`;

  const withFigures = (text: string, assets: QuestionAsset[]) =>
    [text, ...assets.map(ref)].filter(Boolean).join("\n\n");

  /** Options carry their figure inline; the reference lives in the option text. */
  const optionText = (o: ParsedOption, bag: QuestionAsset[]) => {
    if (o.text) return o.text;
    if (!o.region) return "";
    const a = addAsset(o.region, "Option figure");
    bag.push(a);
    return ref(a);
  };

  const answerOf = (p: Parsed, issues: string[]): string => {
    if (!p.answers.length) {
      issues.push("no \\answer{} — the source lists no possible answers");
      return "";
    }
    if (p.answersType === "Range" && p.answers.length === 1) return p.answers[0];
    if (p.answers.length > 1) {
      issues.push(
        `source accepts ${p.answers.length} answers (${p.answersType ?? "Set"}): ${p.answers.join(
          ", "
        )} — only the first is stored`
      );
    }
    if (p.responseType && p.responseType !== "Numeric") {
      issues.push(
        `answer is ${p.responseType}, not numeric — the exam runner shows a numeric keypad for this type`
      );
    }
    return p.answers[0];
  };

  /** Sub-question problems surface on the parent — nothing else renders them. */
  const buildSub = (p: Parsed, idx: number, parentIssues: string[]): SubQuestion => {
    const sub = blankSubQuestion(`tcs-sub-${p.block.id}-${idx}`);
    const type = SUB_TYPE_MAP[p.block.type] ?? "single_correct";
    const label = `Sub-question ${idx + 1}: `;
    const own: string[] = [];
    sub.type = type;
    sub.marks = p.marks ?? DEFAULT_MARKS;
    sub.assets = [...p.stemAssets];
    sub.stem = withFigures(p.stem, p.stemAssets);
    if (type === "numerical") {
      sub.numericalAnswer = answerOf(p, own);
      sub.options = ["", "", "", ""];
    } else {
      const bag: QuestionAsset[] = [];
      sub.options = p.options.map((o) => optionText(o, bag));
      sub.correct = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      sub.assets = [...sub.assets, ...bag];
      while (sub.options.length < 4) sub.options.push("");

      if (p.options.length < 2) own.push("fewer than two options found");
      if (sub.correct.length === 0) own.push("no option is marked correct in the source");
      if (type === "single_correct" && sub.correct.length > 1) {
        own.push(`single-correct sub-question has ${sub.correct.length} correct options`);
      }
    }
    if (!sub.stem) own.push("no question text or figure found");
    parentIssues.push(...own.map((i) => label + i));
    return sub;
  };

  for (const p of parsed) {
    if (consumed.has(p)) continue;
    // The first item of every section is a consent/declaration prompt worth no
    // marks ("THIS IS QUESTION…", options YES/NO). Not content.
    if (p.marks === 0) {
      stats.declarations++;
      continue;
    }

    const course = courseOf(p);
    const issues: string[] = [];
    // Keyed by the source Question Id so a flagged block can be traced straight
    // back to the paper it came from.
    const q: Question = {
      ...blankDraft(),
      id: `tcs-${p.block.id}`,
      isValid: true,
      issues,
    };
    seq++;
    q.marks = p.marks ?? DEFAULT_MARKS;

    if (p.block.type === "COMPREHENSION") {
      q.type = "comprehension";
      q.assets = [...p.stemAssets];
      q.passage = withFigures(p.stem, p.stemAssets);
      const kids = childrenOf(p);
      q.subQuestions = kids.map((c, i) => buildSub(c, i, issues));
      // The parent has no marks of its own; its children carry them.
      q.marks = 0;
      if (!kids.length) issues.push("comprehension has no sub-questions");
      if (!q.passage) issues.push("comprehension has no passage");
      for (const k of kids) {
        if (k.marks === null) issues.push(`sub-question ${k.block.num} has no marks`);
      }
    } else {
      q.type = TYPE_MAP[p.block.type] ?? "single";
      const bag: QuestionAsset[] = [];
      q.assets = [...p.stemAssets];
      q.stem = withFigures(p.stem, p.stemAssets);

      if (q.type === "numerical") {
        q.numericalAnswer = answerOf(p, issues);
      } else {
        q.options = p.options.map((o) => optionText(o, bag));
        q.correct = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
        q.assets = [...q.assets, ...bag];
        while (q.options.length < 4) q.options.push("");

        if (p.options.length < 2) issues.push("fewer than two options found");
        if (q.correct.length === 0) issues.push("no option is marked correct in the source");
        if (q.type === "single" && q.correct.length > 1) {
          issues.push(`single-correct question has ${q.correct.length} correct options`);
        }
      }
      if (!q.stem) issues.push("no question text or figure found");
    }

    q.isValid = issues.length === 0;
    stats.questions++;
    stats.byType[p.block.type] = (stats.byType[p.block.type] ?? 0) + 1;
    if (!q.isValid) stats.flagged++;
    course.questions.push(q);
  }

  stats.figures = Object.keys(regions).length;

  return { paperName, courses, regions, stats };
}

/**
 * Narrow a parsed paper to one course, keeping only the crop regions that
 * course actually references.
 *
 * A full paper can carry a few hundred figures spread over ~140 pages, and
 * cropping one means rendering the page it sits on. Importing a single course
 * should only pay for that course's pages.
 */
export function narrowToCourse(paper: TcsIonPaper, courseIndex: number): TcsIonPaper {
  const course = paper.courses[courseIndex];
  if (!course) return { ...paper, courses: [], regions: {} };

  const used = new Set<string>();
  for (const q of course.questions) {
    for (const a of q.assets) used.add(a.id);
    for (const sq of q.subQuestions) for (const a of sq.assets) used.add(a.id);
  }

  const regions: Record<string, AssetRegion> = {};
  for (const id of used) if (paper.regions[id]) regions[id] = paper.regions[id];

  /* Questions are copied rather than aliased. `attachAssets` rewrites them in
     place, so sharing them with the parent paper would leave half-stripped text
     behind if a first attempt failed and the same course were imported again. */
  const copy: ImportedCourse = {
    ...course,
    questions: course.questions.map((q) => ({
      ...q,
      issues: [...q.issues],
      options: [...q.options],
      correct: [...q.correct],
      assets: q.assets.map((a) => ({ ...a })),
      subQuestions: q.subQuestions.map((sq) => ({
        ...sq,
        options: [...sq.options],
        correct: [...sq.correct],
        assets: sq.assets.map((a) => ({ ...a })),
      })),
    })),
  };

  return { ...paper, courses: [copy], regions };
}

/* ── Figure attachment ────────────────────────────────────────────────────── */

/** Anything able to turn a page region into a PNG data URL. */
export interface RegionCropper {
  cropRegion(page: number, rect: AssetRegion): Promise<string | null>;
}

/**
 * Fill in every asset's `src` by cropping its region, and drop the ones whose
 * region turned out to be blank — a gap the parser suspected held a figure but
 * which was only whitespace. Their `![…](asset-…)` references go with them so no
 * broken image is ever rendered.
 */
export async function attachAssets(
  paper: TcsIonPaper,
  cropper: RegionCropper,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const ids = Object.keys(paper.regions);
  const src = new Map<string, string>();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const url = await cropper.cropRegion(paper.regions[id].page, paper.regions[id]);
      if (url) src.set(id, url);
    } catch {
      /* a page that will not render should not sink the whole import */
    }
    onProgress?.(i + 1, ids.length);
  }

  const strip = (text: string, keep: Set<string>) =>
    text
      .replace(/!\[[^\]]*\]\(asset-([A-Za-z0-9]+)\)/g, (full, id) => (keep.has(id) ? full : ""))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const fix = (assets: QuestionAsset[]) => {
    const kept = assets.filter((a) => src.has(a.id));
    kept.forEach((a) => (a.src = src.get(a.id)!));
    return kept;
  };

  for (const course of paper.courses) {
    for (const q of course.questions) {
      const kept = fix(q.assets);
      const keep = new Set(kept.map((a) => a.id));
      q.assets = kept;
      q.stem = strip(q.stem, keep);
      q.passage = strip(q.passage, keep);
      q.options = q.options.map((o) => strip(o, keep));
      for (const sq of q.subQuestions) {
        const subKept = fix(sq.assets);
        const subKeep = new Set(subKept.map((a) => a.id));
        sq.assets = subKept;
        sq.stem = strip(sq.stem, subKeep);
        sq.options = sq.options.map((o) => strip(o, subKeep));
      }
    }
  }

  return src.size;
}
