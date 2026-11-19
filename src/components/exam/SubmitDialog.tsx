import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { StatusCounts, QStatus } from "@/lib/exam-session";
import { StatusSwatch, STATUS_LABEL } from "./QuestionPalette";

const ROWS: QStatus[] = ["answered", "answeredMarked", "marked", "notAnswered", "notVisited"];

/**
 * Review before submitting (the Pearson "review screen" idea): counts per state,
 * a warning when anything is open, and shortcuts back to the first unanswered
 * or marked question. Auto-submit at 0:00 skips this dialog.
 */
export function SubmitDialog({
  open,
  onOpenChange,
  counts,
  practice,
  submitting,
  onReviewUnanswered,
  onReviewMarked,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  counts: StatusCounts;
  practice: boolean;
  submitting: boolean;
  onReviewUnanswered: () => void;
  onReviewMarked: () => void;
  onSubmit: () => void;
}) {
  const unanswered = counts.notAnswered + counts.notVisited + counts.marked;
  const marked = counts.marked + counts.answeredMarked;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{practice ? "End this practice session?" : "Submit your exam?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {practice ? "Your answers will be scored and saved to your history." : "You cannot change any answer after submitting."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="divide-y divide-border rounded-md border border-border">
          {ROWS.map((s) => {
            const review =
              counts[s] > 0 && (s === "notAnswered" || s === "notVisited")
                ? onReviewUnanswered
                : counts[s] > 0 && (s === "marked" || s === "answeredMarked")
                  ? onReviewMarked
                  : null;
            return (
              <li key={s} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <StatusSwatch status={s} small className="h-4 w-4" />
                <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                {review && (
                  <button type="button" onClick={review} className="text-[12px] font-medium text-primary underline-offset-2 hover:underline">
                    Review
                  </button>
                )}
                <span className="ml-auto font-semibold tabular-nums">{counts[s]}</span>
              </li>
            );
          })}
        </ul>

        {(unanswered > 0 || marked > 0) && (
          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {unanswered > 0 && `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered`}
              {unanswered > 0 && marked > 0 && " and "}
              {marked > 0 && `${marked} ${marked === 1 ? "is" : "are"} marked for review`}.
            </span>
          </p>
        )}

        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <AlertDialogCancel className="mt-0">Keep going</AlertDialogCancel>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="bg-submit font-semibold text-submit-foreground hover:bg-submit/90"
          >
            {submitting ? "Submitting…" : practice ? "End & score" : "Submit now"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
