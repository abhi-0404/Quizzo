/**
 * Shared question model for the paper builder.
 *
 * Lives outside the page component so the bulk LaTeX parser
 * (`@/lib/parse-bulk-paper`) can produce the exact same shapes the editor
 * consumes, without a circular import.
 */

export type QType = "numerical" | "single" | "multi" | "comprehension";
export type InputMode = "form" | "latex";

/** Sub-question types use the backend's explicit vocabulary. */
export type SubQType = "numerical" | "single_correct" | "multi_correct";

export const TYPES: { key: QType; label: string }[] = [
  { key: "numerical", label: "Numerical" },
  { key: "single", label: "Single Correct" },
  { key: "multi", label: "Multi Correct" },
  { key: "comprehension", label: "Comprehension" },
];

export const SUB_TYPES: { key: SubQType; label: string }[] = [
  { key: "numerical", label: "Numerical" },
  { key: "single_correct", label: "Single Correct" },
  { key: "multi_correct", label: "Multi Correct" },
];

export const DEFAULT_MARKS = 4;

/**
 * A figure belonging to a question — a diagram, plot, or a formula the source
 * PDF rasterised instead of setting as text.
 *
 * Stems, options and passages reference an asset by id, as `![alt](asset-<id>)`.
 * That is a protocol-less URL, so it survives `rehype-sanitize` untouched and
 * the renderer resolves it against this list; the `src` data URL never has to
 * pass through the sanitiser, and no `data:` protocol has to be whitelisted.
 */
export interface QuestionAsset {
  /** Unique within its question. Referenced as `asset-<id>`. */
  id: string;
  /** `data:image/png;base64,…` — self-contained, so no storage bucket is needed. */
  src: string;
  alt: string;
}

/** A comprehension parent holds these; each carries its own marks. */
export interface SubQuestion {
  id: string;
  type: SubQType;
  marks: number;
  stem: string;
  options: string[];
  correct: number[];
  numericalAnswer: string;
  assets: QuestionAsset[];
}

export interface QuestionDraft {
  type: QType;
  /** Which editor produced this block. LaTeX blocks store raw source only. */
  inputMode: InputMode;
  latex: string;
  passage: string;
  /** Populated only when `type === "comprehension"` in form mode. */
  subQuestions: SubQuestion[];
  stem: string;
  options: string[];
  correct: number[];
  numericalAnswer: string;
  marks: number;
  /** Figures referenced from `stem`, `options` or `passage`. Usually empty. */
  assets: QuestionAsset[];
}

export interface Question extends QuestionDraft {
  id: string;
  /** False when bulk parsing produced an incomplete/ambiguous block. */
  isValid: boolean;
  /** Human-readable reasons shown when the block is opened for repair. */
  issues: string[];
}

export const blankDraft = (): QuestionDraft => ({
  type: "single",
  inputMode: "form",
  latex: "",
  passage: "",
  subQuestions: [],
  stem: "",
  options: ["", "", "", ""],
  correct: [],
  numericalAnswer: "",
  marks: DEFAULT_MARKS,
  assets: [],
});

export const blankSubQuestion = (id: string): SubQuestion => ({
  id,
  type: "single_correct",
  marks: DEFAULT_MARKS,
  stem: "",
  options: ["", "", "", ""],
  correct: [],
  numericalAnswer: "",
  assets: [],
});

/** Top-level choice types (comprehension is a container, not a question). */
export const isChoiceType = (t: QType) => t === "single" || t === "multi";
export const isSingleAnswer = (t: QType) => t === "single";
export const isSubChoice = (t: SubQType) => t === "single_correct" || t === "multi_correct";
export const isSubSingle = (t: SubQType) => t === "single_correct";
export const typeLabel = (t: QType) => TYPES.find((x) => x.key === t)?.label ?? t;

/** A comprehension block contributes its sub-questions to the paper counts. */
export const countsAsQuestions = (q: QuestionDraft) =>
  q.inputMode === "form" && q.type === "comprehension" ? q.subQuestions.length : 1;

export const marksOf = (q: QuestionDraft) =>
  q.inputMode === "form" && q.type === "comprehension"
    ? q.subQuestions.reduce((s, sq) => s + (Number(sq.marks) || 0), 0)
    : Number(q.marks) || 0;
