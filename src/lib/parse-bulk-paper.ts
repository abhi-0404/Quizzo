import {
  DEFAULT_MARKS,
  blankDraft,
  isSubChoice,
  type Question,
  type QuestionDraft,
  type QType,
  type SubQType,
  type SubQuestion,
} from "@/data/questions";

/**
 * Bulk LaTeX-ish paper parser.
 *
 * Supported syntax
 * ----------------
 *   \begin{question}{MCQ|MSQ|NUM}
 *     \marks{4}
 *     \stem
 *     Text, may span lines and contain $math$.
 *     \options          (MCQ / MSQ only)
 *     - wrong option
 *     + correct option
 *     \answer{3.14}     (NUM only)
 *   \end{question}
 *
 *   \begin{comprehension}
 *     \passage
 *     Shared passage text…
 *     \begin{subquestion}{MCQ}
 *       \marks{3}
 *       \stem …
 *       \options
 *       + right
 *       - wrong
 *     \end{subquestion}
 *   \end{comprehension}
 *
 * Every block is returned even when malformed — `isValid: false` plus a list of
 * `issues` so the admin can repair it in the Form View rather than losing work.
 */

/** Blocks come back without an id; the caller assigns paper-scoped ids. */
export type ParsedBlock = Omit<Question, "id">;

export interface ParseResult {
  blocks: ParsedBlock[];
  /** Document-level problems (unclosed blocks, stray content, empty input). */
  errors: string[];
}

const TYPE_MAP: Record<string, QType> = { MCQ: "single", MSQ: "multi", NUM: "numerical" };
const SUB_TYPE_MAP: Record<string, SubQType> = {
  MCQ: "single_correct",
  MSQ: "multi_correct",
  NUM: "numerical",
};

interface Body {
  marks: number | null;
  stem: string;
  options: string[];
  correct: number[];
  numericalAnswer: string;
}

/** Directive scanner shared by questions and sub-questions. */
function parseBody(lines: string[]): Body {
  let marks: number | null = null;
  const stemLines: string[] = [];
  const options: string[] = [];
  const correct: number[] = [];
  let numericalAnswer = "";
  let mode: "none" | "stem" | "options" = "none";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      // Preserve paragraph breaks inside a stem, ignore blank lines elsewhere.
      if (mode === "stem" && stemLines.length) stemLines.push("");
      continue;
    }

    const marksMatch = line.match(/^\\marks\s*\{\s*(\d+(?:\.\d+)?)\s*\}\s*$/);
    if (marksMatch) {
      marks = Number(marksMatch[1]);
      mode = "none";
      continue;
    }

    const answerMatch = line.match(/^\\answer\s*\{(.*)\}\s*$/);
    if (answerMatch) {
      numericalAnswer = answerMatch[1].trim();
      mode = "none";
      continue;
    }

    if (/^\\stem\b/.test(line)) {
      mode = "stem";
      const inline = line.replace(/^\\stem\b/, "").trim();
      if (inline) stemLines.push(inline);
      continue;
    }

    if (/^\\options\b/.test(line)) {
      mode = "options";
      continue;
    }

    if (mode === "options") {
      const opt = line.match(/^([+-])\s+(.*)$/);
      if (opt) {
        if (opt[1] === "+") correct.push(options.length);
        options.push(opt[2].trim());
      } else if (options.length) {
        // Wrapped option text continues the previous entry.
        options[options.length - 1] += ` ${line}`;
      }
      continue;
    }

    // Anything else is stem prose (covers `\stem` on its own line and text
    // written before any directive).
    stemLines.push(line);
  }

  return {
    marks,
    stem: stemLines.join("\n").trim(),
    options,
    correct,
    numericalAnswer,
  };
}

function validateBody(body: Body, type: QType | SubQType, label: string): string[] {
  const issues: string[] = [];
  const isChoice = type === "single" || type === "multi" || type === "single_correct" || type === "multi_correct";
  const isSingle = type === "single" || type === "single_correct";

  if (body.marks === null) issues.push(`${label}missing \\marks{}`);
  else if (body.marks <= 0) issues.push(`${label}marks must be greater than zero`);

  if (!body.stem) issues.push(`${label}missing \\stem`);

  if (isChoice) {
    if (body.options.length < 2) issues.push(`${label}needs at least two options`);
    if (body.correct.length === 0) issues.push(`${label}no correct option marked with "+"`);
    if (isSingle && body.correct.length > 1) issues.push(`${label}single-correct has more than one "+"`);
  } else if (!body.numericalAnswer) {
    issues.push(`${label}missing \\answer{}`);
  }

  return issues;
}

/** Options are padded to four so the Form View renders a familiar A–D grid. */
function padOptions(options: string[]): string[] {
  const out = [...options];
  while (out.length < 4) out.push("");
  return out;
}

/* ── Serialisation: structured block → LaTeX source ───────────────────────── */

const TYPE_TOKEN: Record<Exclude<QType, "comprehension">, string> = {
  single: "MCQ",
  multi: "MSQ",
  numerical: "NUM",
};
const SUB_TYPE_TOKEN: Record<SubQType, string> = {
  single_correct: "MCQ",
  multi_correct: "MSQ",
  numerical: "NUM",
};

function serializeAnswers(
  isChoice: boolean,
  options: string[],
  correct: number[],
  numericalAnswer: string
): string[] {
  if (!isChoice) return [`\\answer{${numericalAnswer.trim()}}`];
  const rows = options
    .map((o, i) => ({ text: o.trim(), correct: correct.includes(i) }))
    .filter((o) => o.text.length > 0)
    .map((o) => `${o.correct ? "+" : "-"} ${o.text}`);
  return rows.length ? ["\\options", ...rows] : [];
}

/**
 * Inverse of `parseBulkPaper` for a single block. Keeps the LaTeX View in step
 * with edits made in the Form View, so neither direction is authoritative.
 */
export function serializeBlock(q: QuestionDraft): string {
  if (q.type === "comprehension") {
    const lines = ["\\begin{comprehension}", "\\passage", q.passage.trim()];
    for (const sq of q.subQuestions) {
      lines.push(
        `\\begin{subquestion}{${SUB_TYPE_TOKEN[sq.type]}}`,
        `\\marks{${sq.marks}}`,
        "\\stem",
        sq.stem.trim(),
        ...serializeAnswers(isSubChoice(sq.type), sq.options, sq.correct, sq.numericalAnswer),
        "\\end{subquestion}"
      );
    }
    lines.push("\\end{comprehension}");
    return lines.join("\n");
  }

  const token = TYPE_TOKEN[q.type];
  return [
    `\\begin{question}{${token}}`,
    `\\marks{${q.marks}}`,
    "\\stem",
    q.stem.trim(),
    ...serializeAnswers(q.type !== "numerical", q.options, q.correct, q.numericalAnswer),
    "\\end{question}",
  ].join("\n");
}

export function parseBulkPaper(rawText: string): ParseResult {
  const errors: string[] = [];
  const blocks: ParsedBlock[] = [];

  const text = rawText.replace(/\r\n?/g, "\n");
  if (!text.trim()) return { blocks, errors: ["Nothing to parse — the input is empty."] };

  const lines = text.split("\n");
  let i = 0;
  let subSeq = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    const qOpen = line.match(/^\\begin\s*\{question\}\s*\{?\s*([A-Za-z]+)?\s*\}?/);
    const cOpen = /^\\begin\s*\{comprehension\}/.test(line);

    if (!qOpen && !cOpen) {
      i++;
      continue;
    }

    if (qOpen) {
      const startIdx = i; // keep the block's own source for its LaTeX View
      const rawType = (qOpen[1] || "").toUpperCase();
      const type = TYPE_MAP[rawType];
      const bodyLines: string[] = [];
      let closed = false;
      i++;
      while (i < lines.length) {
        if (/^\\end\s*\{question\}/.test(lines[i].trim())) { closed = true; i++; break; }
        // A new block starting before \end means the previous one was left open.
        if (/^\\begin\s*\{(question|comprehension)\}/.test(lines[i].trim())) break;
        bodyLines.push(lines[i]);
        i++;
      }

      const body = parseBody(bodyLines);
      const resolvedType: QType = type ?? "single";
      const issues: string[] = [];
      if (!rawType) issues.push("missing type — expected {MCQ}, {MSQ} or {NUM}");
      else if (!type) issues.push(`unknown type "${rawType}" — expected MCQ, MSQ or NUM`);
      if (!closed) issues.push("unclosed block — missing \\end{question}");
      issues.push(...validateBody(body, resolvedType, ""));

      blocks.push({
        ...blankDraft(),
        type: resolvedType,
        // Stays in Form View by default; `latex` backs its LaTeX View tab.
        latex: lines.slice(startIdx, i).join("\n").trim(),
        marks: body.marks ?? DEFAULT_MARKS,
        stem: body.stem,
        options: padOptions(body.options),
        correct: body.correct,
        numericalAnswer: body.numericalAnswer,
        isValid: issues.length === 0,
        issues,
      });
      continue;
    }

    // ── Comprehension parent ──────────────────────────────────────────────
    const cStartIdx = i; // keep the whole comprehension source, subquestions included
    const passageLines: string[] = [];
    const subQuestions: SubQuestion[] = [];
    const issues: string[] = [];
    let closed = false;
    let sawPassage = false;
    i++;

    while (i < lines.length) {
      const cur = lines[i].trim();

      if (/^\\end\s*\{comprehension\}/.test(cur)) { closed = true; i++; break; }
      if (/^\\begin\s*\{(question|comprehension)\}/.test(cur)) break; // unclosed

      if (/^\\passage\b/.test(cur)) {
        sawPassage = true;
        const inline = cur.replace(/^\\passage\b/, "").trim();
        if (inline) passageLines.push(inline);
        i++;
        continue;
      }

      const sOpen = cur.match(/^\\begin\s*\{subquestion\}\s*\{?\s*([A-Za-z]+)?\s*\}?/);
      if (sOpen) {
        const rawType = (sOpen[1] || "").toUpperCase();
        const subType = SUB_TYPE_MAP[rawType];
        const subLines: string[] = [];
        let subClosed = false;
        i++;
        while (i < lines.length) {
          const s = lines[i].trim();
          if (/^\\end\s*\{subquestion\}/.test(s)) { subClosed = true; i++; break; }
          if (/^\\begin\s*\{subquestion\}/.test(s) || /^\\end\s*\{comprehension\}/.test(s)) break;
          subLines.push(lines[i]);
          i++;
        }

        const body = parseBody(subLines);
        const resolved: SubQType = subType ?? "single_correct";
        const n = subQuestions.length + 1;
        const label = `Sub-question ${n}: `;
        if (!rawType) issues.push(`${label}missing type — expected {MCQ}, {MSQ} or {NUM}`);
        else if (!subType) issues.push(`${label}unknown type "${rawType}"`);
        if (!subClosed) issues.push(`${label}unclosed — missing \\end{subquestion}`);
        issues.push(...validateBody(body, resolved, label));

        subQuestions.push({
          id: `bsq-${++subSeq}`,
          type: resolved,
          marks: body.marks ?? DEFAULT_MARKS,
          stem: body.stem,
          options: padOptions(body.options),
          correct: body.correct,
          numericalAnswer: body.numericalAnswer,
        });
        continue;
      }

      // Plain prose inside the parent belongs to the passage.
      if (cur) passageLines.push(cur);
      else if (passageLines.length) passageLines.push("");
      i++;
    }

    const passage = passageLines.join("\n").trim();
    if (!closed) issues.unshift("unclosed block — missing \\end{comprehension}");
    if (!passage) issues.unshift(sawPassage ? "\\passage is empty" : "missing \\passage");
    if (subQuestions.length === 0) issues.unshift("no \\begin{subquestion} blocks found");

    blocks.push({
      ...blankDraft(),
      type: "comprehension",
      latex: lines.slice(cStartIdx, i).join("\n").trim(),
      passage,
      subQuestions,
      isValid: issues.length === 0,
      issues,
    });
  }

  if (blocks.length === 0) {
    errors.push("No \\begin{question} or \\begin{comprehension} blocks found.");
  }

  return { blocks, errors };
}
