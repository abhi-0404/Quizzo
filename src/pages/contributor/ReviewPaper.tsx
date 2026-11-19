import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { Button } from "@/components/ui/button";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import { QuestionReviewForm } from "@/components/contributor/QuestionReviewForm";
import { SolutionUploader } from "@/components/contributor/SolutionUploader";
import { cn } from "@/lib/utils";
import { examTypeLabel, loadPaper, type LoadedQuestion } from "@/lib/pyq-read";
import {
  contributorKeys,
  formatKey,
  listMyReviews,
  listMySolutions,
  loadAnswerKey,
  progressPct,
  reviewState,
  type KeyKind,
  type MyReview,
  type MySolution,
  type QuestionReviewState,
} from "@/lib/contributor";

const RAIL_LOOK: Record<QuestionReviewState, string> = {
  unreviewed: "bg-muted text-muted-foreground border border-border",
  confirmed: "bg-success text-success-foreground",
  flagged: "bg-destructive text-destructive-foreground",
};
const STATE_LABEL: Record<QuestionReviewState, string> = {
  unreviewed: "not reviewed",
  confirmed: "confirmed correct",
  flagged: "flagged as wrong",
};

const kindOf = (q: LoadedQuestion): KeyKind => (q.type === "integer" ? "numerical" : q.type === "multi" ? "multi" : "single");
const KIND_LABEL: Record<KeyKind, string> = { single: "Single correct", multi: "Multi correct", numerical: "Numerical" };
const letter = (i: number) => String.fromCharCode(65 + i);

export default function ContributorReviewPaper() {
  const { paperId = "" } = useParams();
  const [sel, setSel] = useState<number | "paper">(0);

  const paperQ = useQuery({
    queryKey: contributorKeys.paper(paperId),
    queryFn: () => loadPaper(paperId),
    enabled: !!paperId,
  });
  const loaded = paperQ.data;

  const keyQ = useQuery({
    queryKey: contributorKeys.key(paperId),
    queryFn: () => loadAnswerKey(paperId),
    enabled: !!loaded,
  });

  const questionIds = useMemo(() => loaded?.questions.map((q) => q.questionId) ?? [], [loaded]);
  const reviewsQ = useQuery({
    queryKey: contributorKeys.reviews(paperId),
    queryFn: () => listMyReviews(questionIds),
    enabled: !!loaded,
  });
  const solutionsQ = useQuery({
    queryKey: contributorKeys.solutions(paperId),
    queryFn: () => listMySolutions(paperId),
    enabled: !!paperId,
  });

  const keyById = useMemo(() => new Map((keyQ.data ?? []).map((k) => [k.questionId, k])), [keyQ.data]);
  const reviewById = useMemo(() => new Map<string, MyReview>((reviewsQ.data ?? []).map((r) => [r.question_id, r])), [reviewsQ.data]);
  const mySolutions = solutionsQ.data;
  const solutionsByQuestion = useMemo(() => {
    const m = new Map<string | null, MySolution[]>();
    for (const s of mySolutions ?? []) {
      const list = m.get(s.question_id) ?? [];
      list.push(s);
      m.set(s.question_id, list);
    }
    return m;
  }, [mySolutions]);

  const error = paperQ.error ?? keyQ.error ?? reviewsQ.error ?? solutionsQ.error;
  const loading = paperQ.isLoading || keyQ.isLoading || reviewsQ.isLoading || solutionsQ.isLoading;

  const refetchAll = () => {
    void paperQ.refetch();
    void keyQ.refetch();
    void reviewsQ.refetch();
    void solutionsQ.refetch();
  };

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 min-h-11 py-1.5 border-b border-border shrink-0">
      <Link to="/contributor/papers" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Papers
      </Link>
      {loaded && (
        <>
          <h1 className="text-[13px] font-medium">{loaded.paper.courseName}</h1>
          <span className="text-[12px] text-muted-foreground">
            {examTypeLabel(loaded.paper.examType)} · {loaded.paper.term} {loaded.paper.year} · {loaded.paper.programme}
            {loaded.paper.slot ? ` · ${loaded.paper.slot.toUpperCase()}` : ""}
            {loaded.paper.variantLabel ? ` · ${loaded.paper.variantLabel}` : ""}
          </span>
        </>
      )}
      {loaded && reviewsQ.data && (
        <div className="ml-auto flex items-center gap-2" aria-label="Review progress">
          <div className="h-1.5 w-28 rounded-full bg-border">
            <div className="h-full rounded-full bg-success" style={{ width: `${progressPct(reviewsQ.data.length, loaded.questions.length)}%` }} />
          </div>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {reviewsQ.data.length}/{loaded.questions.length} reviewed
          </span>
        </div>
      )}
    </div>
  );

  if (!paperId || (!loading && !error && !loaded)) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full">
          {header}
          <div className="p-6 text-[13px] text-muted-foreground">
            That paper is not available. Only published papers can be reviewed.{" "}
            <Link to="/contributor/papers" className="underline underline-offset-2">
              Back to the list
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full">
          {header}
          <AdminError message={error instanceof Error ? error.message : "Unknown error"} onRetry={refetchAll} />
        </div>
      </AppLayout>
    );
  }

  if (loading || !loaded) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full">
          {header}
          <AdminLoading />
        </div>
      </AppLayout>
    );
  }

  const questions = loaded.questions;
  const index = sel === "paper" ? -1 : Math.min(sel, questions.length - 1);
  const q = index >= 0 ? questions[index] : null;
  const kind = q ? kindOf(q) : "single";
  const keyRow = q ? keyById.get(q.questionId) : undefined;
  const review = q ? reviewById.get(q.questionId) : undefined;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {header}

        <div className="flex-1 overflow-auto">
          <div className="flex flex-col md:flex-row md:items-start">
            {/* Question rail */}
            <nav
              aria-label="Questions"
              className="shrink-0 border-b border-border p-3 md:sticky md:top-0 md:w-60 md:max-h-[calc(100vh-2.75rem)] md:overflow-auto md:border-b-0 md:border-r"
            >
              <button
                type="button"
                onClick={() => setSel("paper")}
                aria-current={sel === "paper" ? "true" : undefined}
                className={cn(
                  "mb-3 flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors",
                  sel === "paper" ? "border-primary bg-muted font-medium" : "border-border hover:bg-muted"
                )}
              >
                <FileUp className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">Whole-paper solution</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{solutionsByQuestion.get(null)?.length ?? 0}</span>
              </button>

              <div className="grid grid-cols-7 gap-1.5 md:grid-cols-5">
                {questions.map((item, i) => {
                  const state = reviewState(reviewById.get(item.questionId) as { verdict: "correct" | "incorrect" } | undefined);
                  const mine = solutionsByQuestion.get(item.questionId)?.length ?? 0;
                  return (
                    <button
                      key={item.questionId}
                      type="button"
                      onClick={() => setSel(i)}
                      aria-current={sel === i ? "true" : undefined}
                      aria-label={`Question ${i + 1}, ${STATE_LABEL[state]}${mine ? `, ${mine} solution${mine > 1 ? "s" : ""}` : ""}`}
                      className={cn(
                        "relative aspect-square min-h-[34px] rounded-md text-[12px] font-medium tabular-nums transition-colors",
                        RAIL_LOOK[state],
                        sel === i && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      )}
                    >
                      {i + 1}
                      {mine > 0 && <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                    </button>
                  );
                })}
              </div>

              <dl className="mt-4 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-muted border border-border" />Not reviewed</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-success" />Confirmed correct</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-destructive" />Flagged as wrong</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Has my solution</div>
              </dl>
            </nav>

            {/* Detail pane */}
            <div className="min-w-0 flex-1 p-4 md:p-6">
              {sel === "paper" || !q ? (
                <div className="max-w-3xl space-y-3">
                  <h2 className="text-[15px] font-medium">Whole-paper solution</h2>
                  <p className="text-[13px] text-muted-foreground">
                    Upload one PDF or image that works through the whole paper. For a single question, choose that question on the left.
                  </p>
                  <SolutionUploader
                    paperId={paperId}
                    questionId={null}
                    solutions={solutionsByQuestion.get(null) ?? []}
                    label="Solution for the whole paper"
                  />
                </div>
              ) : (
                <div className="max-w-3xl space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-medium">Question {index + 1}</h2>
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px]">{KIND_LABEL[kind]}</span>
                    <span className="text-[12px] text-muted-foreground">[+{q.marks} marks]</span>
                  </div>

                  {q.passage && (
                    <div className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted p-3 text-[13px]">
                      <UniversalRenderer content={q.passage} assets={q.assets} />
                    </div>
                  )}

                  <div className="text-[15px] leading-relaxed">
                    <UniversalRenderer content={q.text} assets={q.assets} />
                  </div>

                  {kind === "numerical" ? (
                    <div className="rounded-md border border-success/50 bg-card px-3 py-2 text-[13px]">
                      <span className="text-muted-foreground">Current key: </span>
                      <span className="font-medium tabular-nums">{formatKey([], keyRow?.numericalAnswer ?? "", "numerical")}</span>
                    </div>
                  ) : (
                    <ul className="space-y-1.5" aria-label="Options">
                      {q.options.map((opt, i) => {
                        const isKey = keyRow?.correct.includes(i) ?? false;
                        return (
                          <li
                            key={i}
                            className={cn(
                              "flex items-start gap-3 rounded-md border bg-card px-3 py-2 text-[13px]",
                              isKey ? "border-success/60" : "border-border"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-semibold",
                                isKey ? "bg-success text-success-foreground" : "border border-border text-muted-foreground"
                              )}
                            >
                              {letter(i)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <UniversalRenderer content={opt} assets={q.assets} />
                            </span>
                            {isKey && <span className="shrink-0 text-[11px] font-medium text-success">Current key</span>}
                          </li>
                        );
                      })}
                      {keyRow && keyRow.correct.length === 0 && (
                        <li className="text-[12px] text-muted-foreground">This question has no answer key yet.</li>
                      )}
                    </ul>
                  )}

                  <QuestionReviewForm
                    key={`${q.questionId}:${review?.updated_at ?? "new"}`}
                    paperId={paperId}
                    questionId={q.questionId}
                    kind={kind}
                    optionCount={q.options.length}
                    review={review}
                  />

                  <SolutionUploader
                    paperId={paperId}
                    questionId={q.questionId}
                    solutions={solutionsByQuestion.get(q.questionId) ?? []}
                    label={`Solution for question ${index + 1}`}
                  />

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[12px]" disabled={index === 0} onClick={() => setSel(index - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </Button>
                    <span className="text-[12px] text-muted-foreground tabular-nums">
                      {index + 1} / {questions.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-[12px]"
                      disabled={index === questions.length - 1}
                      onClick={() => setSel(index + 1)}
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
