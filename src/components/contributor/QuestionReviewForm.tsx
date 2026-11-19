import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import {
  MAX_NOTE_LENGTH,
  contributorKeys,
  deleteMyReview,
  formatKey,
  saveReview,
  validateReview,
  type KeyKind,
  type MyReview,
} from "@/lib/contributor";

const letter = (i: number) => String.fromCharCode(65 + i);

function suggestionOf(r: MyReview): number[] {
  return Array.isArray(r.suggested_correct)
    ? (r.suggested_correct as unknown[]).filter((n): n is number => typeof n === "number")
    : [];
}

/**
 * "Is the answer key right?" for one question.
 *
 * Confirming is one click. Flagging asks what the correct answer should be.
 * A review can be changed while it is pending; once an admin has decided it, it
 * is read-only.
 */
export function QuestionReviewForm({
  paperId,
  questionId,
  kind,
  optionCount,
  review,
}: {
  paperId: string;
  questionId: string;
  kind: KeyKind;
  optionCount: number;
  review: MyReview | undefined;
}) {
  const queryClient = useQueryClient();
  const decided = !!review && review.status !== "pending";

  const [flagging, setFlagging] = useState(review?.verdict === "incorrect");
  const [picks, setPicks] = useState<number[]>(review ? suggestionOf(review) : []);
  const [numeric, setNumeric] = useState(review?.suggested_numerical ?? "");
  const [note, setNote] = useState(review?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: contributorKeys.reviews(paperId) });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.myReviews });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.papers });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.stats });
  };

  const save = useMutation({
    mutationFn: (verdict: "correct" | "incorrect") =>
      saveReview({
        questionId,
        verdict,
        suggestedCorrect: picks,
        suggestedNumerical: numeric,
        note: verdict === "incorrect" ? note : "",
        kind,
        optionCount,
      }),
    onSuccess: (r) => {
      toast.success(r.verdict === "correct" ? "Marked as correct" : "Flagged for the admin");
      setError(null);
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save"),
  });

  const remove = useMutation({
    mutationFn: () => deleteMyReview((review as MyReview).id),
    onSuccess: () => {
      toast.success("Review removed");
      setFlagging(false);
      setPicks([]);
      setNumeric("");
      setNote("");
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not remove"),
  });

  const togglePick = (i: number) => {
    setError(null);
    setPicks((prev) => (kind === "single" ? [i] : prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  };

  const saveFlag = () => {
    const problem = validateReview({
      verdict: "incorrect",
      suggestedCorrect: picks,
      suggestedNumerical: numeric,
      note,
      kind,
      optionCount,
    });
    if (problem) {
      setError(problem);
      return;
    }
    save.mutate("incorrect");
  };

  /* A decided review is read-only. */
  if (decided && review) {
    return (
      <section aria-label="Your review" className="rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-medium">Your review</h3>
          <StatusBadge status={review.status as "accepted" | "rejected"} />
        </div>
        <p className="mt-1.5 text-[13px]">
          {review.verdict === "correct"
            ? "You confirmed the key is correct."
            : `You said the key should be ${formatKey(suggestionOf(review), review.suggested_numerical ?? "", kind)}.`}
        </p>
        {review.note && <p className="mt-1 text-[12px] text-muted-foreground">{review.note}</p>}
        {review.status === "rejected" ? (
          <>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              An admin rejected this flag. If you still disagree, withdraw it and flag the question again with more detail.
            </p>
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="mt-2 text-[12px] underline underline-offset-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {remove.isPending ? "Withdrawing…" : "Withdraw this flag"}
            </button>
          </>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">An admin has decided this review, so it can no longer be changed.</p>
        )}
      </section>
    );
  }

  const busy = save.isPending || remove.isPending;

  return (
    <section aria-label="Check the answer key" className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="text-[13px] font-medium">Is the answer key right?</h3>
        {review && <StatusBadge status="pending" />}
        {review && (
          <span className="text-[11px] text-muted-foreground">
            Saved: {review.verdict === "correct" ? "confirmed correct" : "flagged as wrong"}
          </span>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={review?.verdict === "correct" && !flagging ? "default" : "outline"}
            aria-pressed={review?.verdict === "correct" && !flagging}
            className="h-8 gap-1.5 text-[12px]"
            disabled={busy}
            onClick={() => {
              setFlagging(false);
              setError(null);
              save.mutate("correct");
            }}
          >
            <Check className="h-3.5 w-3.5" /> Key is correct
          </Button>
          <Button
            type="button"
            size="sm"
            variant={flagging ? "default" : "outline"}
            aria-pressed={flagging}
            className="h-8 gap-1.5 text-[12px]"
            disabled={busy}
            onClick={() => {
              setFlagging(true);
              setError(null);
            }}
          >
            <X className="h-3.5 w-3.5" /> Key is wrong
          </Button>
          {review && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-[12px] text-muted-foreground" disabled={busy} onClick={() => remove.mutate()}>
              Remove my review
            </Button>
          )}
        </div>

        {flagging && (
          <div className="space-y-3 rounded-md border border-border bg-background p-3">
            {kind === "numerical" ? (
              <div className="space-y-1">
                <label htmlFor={`num-${questionId}`} className="text-[12px] font-medium">
                  What should the answer be?
                </label>
                <Input
                  id={`num-${questionId}`}
                  value={numeric}
                  onChange={(e) => {
                    setNumeric(e.target.value);
                    setError(null);
                  }}
                  inputMode="decimal"
                  placeholder="e.g. 12 or 80 to 81"
                  maxLength={60}
                  className="h-8 max-w-[220px] text-[13px]"
                />
              </div>
            ) : (
              <fieldset className="space-y-1.5">
                <legend className="text-[12px] font-medium">
                  {kind === "multi" ? "Which options are correct? (pick all that apply)" : "Which option is correct?"}
                </legend>
                <div className="flex flex-wrap gap-2" role={kind === "multi" ? "group" : "radiogroup"}>
                  {Array.from({ length: optionCount }, (_, i) => {
                    const on = picks.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        role={kind === "multi" ? "checkbox" : "radio"}
                        aria-checked={on}
                        aria-label={`Option ${letter(i)}`}
                        onClick={() => togglePick(i)}
                        className={cn(
                          "h-8 min-w-[2rem] rounded-md border px-2.5 text-[13px] font-medium transition-colors",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
                        )}
                      >
                        {letter(i)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="space-y-1">
              <label htmlFor={`note-${questionId}`} className="text-[12px] font-medium">
                Why? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id={`note-${questionId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                rows={3}
                placeholder="A short working or reference helps the admin decide."
                className="resize-none text-[13px]"
              />
              <p className="text-right text-[11px] text-muted-foreground tabular-nums">
                {note.length}/{MAX_NOTE_LENGTH}
              </p>
            </div>

            <Button type="button" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={busy} onClick={saveFlag}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save flag
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
