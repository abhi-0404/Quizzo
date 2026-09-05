import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the publish path against a stand-in Supabase client.
 *
 * There is no database to point at, so this asserts the things that would
 * otherwise only be discovered in production: that comprehension groups become
 * one row per sub-question, that a figure shared by a group uploads once, that a
 * paper is only flipped to published after its questions exist, and that the
 * upsert keys match the migration's unique constraints.
 */

interface Recorded {
  table: string;
  op: string;
  payload: unknown;
  options?: unknown;
}

const recorded: Recorded[] = [];
const uploads: { path: string; type: string }[] = [];
let questionIdSeq = 0;

function tableApi(table: string) {
  const api: Record<string, unknown> = {};
  const self = () => api;

  api.select = () => api;
  api.eq = () => api;
  api.in = () => api;
  api.order = () => api;
  api.limit = () => api;

  api.insert = (payload: unknown) => {
    recorded.push({ table, op: "insert", payload });
    if (table === "questions") {
      const rows = payload as { position: number }[];
      // `.insert(...).select("id, position")` awaits directly.
      return {
        select: () =>
          Promise.resolve({
            data: rows.map((r) => ({ id: `q${++questionIdSeq}`, position: r.position })),
            error: null,
          }),
      };
    }
    return api;
  };

  api.upsert = (payload: unknown, options?: unknown) => {
    recorded.push({ table, op: "upsert", payload, options });
    return api;
  };

  api.update = (payload: unknown) => {
    recorded.push({ table, op: "update", payload });
    return api;
  };

  api.delete = () => {
    recorded.push({ table, op: "delete", payload: null });
    return api;
  };

  api.single = () =>
    Promise.resolve({
      data: { id: table === "papers" ? "paper-1" : `${table}-1` },
      error: null,
    });
  api.maybeSingle = api.single;

  // A bare await on the builder (update/delete) resolves to no error.
  (api as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: null, error: null });

  void self;
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => tableApi(table),
    storage: {
      from: () => ({
        upload: (path: string, _blob: Blob, opts: { contentType: string }) => {
          uploads.push({ path, type: opts.contentType });
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  },
}));

const { publishSitting } = await import("@/lib/pyq-publish");
const { hashCoursePaper } = await import("@/lib/pyq-ingest");
const { blankDraft, blankSubQuestion } = await import("@/data/questions");
import type { Question } from "@/data/questions";
import type { MergedSitting } from "@/lib/pyq-ingest";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function mcq(stem: string): Question {
  return {
    ...blankDraft(),
    id: "tcs-1001",
    type: "single",
    stem,
    options: ["a", "b", "c", "d"],
    correct: [1],
    marks: 4,
    isValid: true,
    issues: [],
  };
}

function comprehension(): Question {
  const a = blankSubQuestion("s1");
  const b = blankSubQuestion("s2");
  a.stem = "child one";
  a.marks = 3;
  a.correct = [0];
  b.stem = "child two";
  b.marks = 3;
  b.correct = [2];
  return {
    ...blankDraft(),
    id: "tcs-2002",
    type: "comprehension",
    passage: "shared passage ![Question figure](asset-f9)",
    subQuestions: [a, b],
    // The passage figure belongs to the group, so it hangs off the parent.
    assets: [{ id: "f9", src: PNG, alt: "Question figure" }],
    marks: 0,
    isValid: true,
    issues: [],
  };
}

function sittingWith(questions: Question[]): MergedSitting {
  return {
    date: "2025-08-31",
    papers: [
      {
        sourceHeading: "AI",
        normalisedHeading: "ai",
        programme: "degree",
        slot: "fn",
        contentHash: hashCoursePaper(questions),
        sourceCodes: ["QDB1", "QDB2"],
        variantLabel: "",
        questions,
        totalMarks: 10,
        questionCount: questions.length,
        flagged: 0,
        sourceFileIndex: 0,
      },
    ],
    stats: { files: 2, duplicates: 1, variants: 0 },
  };
}

const run = (questions: Question[]) =>
  publishSitting({
    sitting: sittingWith(questions),
    examType: "end_term",
    courseByHeading: new Map([["ai", "course-1"]]),
    selected: new Set(["ai"]),
  });

beforeEach(() => {
  recorded.length = 0;
  uploads.length = 0;
  questionIdSeq = 0;
});

describe("publishSitting", () => {
  it("keys the paper upsert on the migration's unique constraint", async () => {
    await run([mcq("one")]);
    const paper = recorded.find((r) => r.table === "papers" && r.op === "upsert");
    expect(paper?.options).toEqual({ onConflict: "sitting_id,course_id,programme,content_hash" });
    const payload = paper?.payload as Record<string, unknown>;
    expect(payload.programme).toBe("degree");
    expect(payload.source_codes).toEqual(["QDB1", "QDB2"]);
    // End term is 90 minutes per course, a rule that is not in the PDF.
    expect(payload.duration_minutes).toBe(90);
    // It must start unpublished.
    expect(payload.published).toBe(false);
  });

  it("publishes only after the questions are written", async () => {
    await run([mcq("one")]);
    const questionInsert = recorded.findIndex((r) => r.table === "questions" && r.op === "insert");
    const publishFlip = recorded.findIndex(
      (r) => r.table === "papers" && r.op === "update" && (r.payload as { published?: boolean }).published
    );
    expect(questionInsert).toBeGreaterThanOrEqual(0);
    expect(publishFlip).toBeGreaterThan(questionInsert);
  });

  it("replaces the previous question set so a re-import is not additive", async () => {
    await run([mcq("one")]);
    const del = recorded.findIndex((r) => r.table === "questions" && r.op === "delete");
    const ins = recorded.findIndex((r) => r.table === "questions" && r.op === "insert");
    expect(del).toBeGreaterThanOrEqual(0);
    expect(del).toBeLessThan(ins);
  });

  it("expands a comprehension group into one row per sub-question", async () => {
    await run([mcq("one"), comprehension()]);
    const rows = recorded.find((r) => r.table === "questions" && r.op === "insert")
      ?.payload as Record<string, unknown>[];

    // 1 plain question + 2 children, and no comprehension container row.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.kind)).toEqual(["single", "single", "single"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);

    // Each child keeps the group's passage so the runner can show it.
    expect(rows[1].passage).toContain("shared passage");
    expect(rows[2].passage).toContain("shared passage");
    expect(rows[1].stem).toBe("child one");
    expect(rows[2].correct).toEqual([2]);
  });

  it("uploads a figure shared by a group only once", async () => {
    await run([comprehension()]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe("paper-1/f9.png");
    expect(uploads[0].type).toBe("image/png");

    // But both children reference it, so both can render it.
    const assetRows = recorded.find((r) => r.table === "question_assets")
      ?.payload as Record<string, unknown>[];
    expect(assetRows).toHaveLength(2);
    expect(new Set(assetRows.map((r) => r.storage_path))).toEqual(new Set(["paper-1/f9.png"]));
    expect(new Set(assetRows.map((r) => r.question_id)).size).toBe(2);
  });

  it("skips a course nobody mapped rather than guessing", async () => {
    const result = await publishSitting({
      sitting: sittingWith([mcq("one")]),
      examType: "quiz_1",
      courseByHeading: new Map(),
      selected: new Set(["ai"]),
    });
    expect(result.publishedCourses).toBe(0);
    expect(result.skipped).toEqual(["AI"]);
    expect(recorded.some((r) => r.table === "questions")).toBe(false);
  });

  it("uses the quiz duration for a quiz", async () => {
    await publishSitting({
      sitting: sittingWith([mcq("one")]),
      examType: "quiz_2",
      courseByHeading: new Map([["ai", "course-1"]]),
      selected: new Set(["ai"]),
    });
    const paper = recorded.find((r) => r.table === "papers" && r.op === "upsert");
    expect((paper?.payload as { duration_minutes: number }).duration_minutes).toBe(60);
  });
});
