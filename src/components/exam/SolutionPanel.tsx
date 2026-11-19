import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { revealAnswer, type RevealedAnswer } from "@/lib/pyq-read";
import { listApprovedSolutions } from "@/lib/solutions";
import { matchesNumeric } from "@/lib/grade";
import { hasAnswer, type Answer } from "@/lib/exam-session";
import { lettersFor, type OptionVerdict } from "./OptionList";
import { VideoFacade } from "@/components/VideoFacade";

type Kind = "single" | "multi" | "comprehension" | "integer";

const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

/**
 * The answer key for one question, fetched only when a student asks (practice
 * mode, signed in). The server throttles new reveals per hour, so a throttled
 * request is not retried.
 */
export function useRevealedAnswer(questionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["answer", questionId],
    queryFn: () => revealAnswer(questionId!),
    enabled: !!questionId && enabled,
    staleTime: Infinity,
    retry: (count, e) => errCode(e) !== "54000" && count < 1,
  });
}

/** Per-option verdicts once the key is known: right picks, wrong picks, and correct options left unpicked. */
export function verdictsFor(kind: Kind, optionCount: number, key: RevealedAnswer | null | undefined, picked: Answer): OptionVerdict[] {
  if (!key || kind === "integer") return [];
  const correct = new Set(key.correct);
  const chosen = new Set(Array.isArray(picked) ? picked : typeof picked === "number" ? [picked] : []);
  return Array.from({ length: optionCount }, (_, i) =>
    chosen.has(i) ? (correct.has(i) ? "correct" : "wrong") : correct.has(i) ? "missed" : null
  );
}

/** Whether the student's answer matches the key (same rules as the server grader). */
export function isCorrect(kind: Kind, key: RevealedAnswer, picked: Answer): boolean {
  if (!hasAnswer(picked)) return false;
  if (kind === "integer") return matchesNumeric(String(picked), key.numericalAnswer);
  const want = [...key.correct].sort((a, b) => a - b).join(",");
  const got = (Array.isArray(picked) ? [...picked] : [picked as number]).sort((a, b) => a - b).join(",");
  return kind === "multi" ? want === got : key.correct.includes(picked as number);
}

/**
 * Practice mode's solution area: verdict, the key, and any approved worked
 * solutions (PDF or image). Shown under the question after "Check answer".
 */
export function SolutionPanel({
  questionId,
  paperId,
  kind,
  options,
  picked,
  signedIn,
}: {
  questionId?: string;
  paperId?: string;
  kind: Kind;
  options: string[];
  picked: Answer;
  signedIn: boolean;
}) {
  const { data, isLoading, isError, error } = useRevealedAnswer(questionId, signedIn);
  const { data: worked = [] } = useQuery({
    queryKey: ["worked-solutions", paperId, questionId],
    queryFn: () => listApprovedSolutions({ paperId: paperId!, questionId: questionId! }),
    enabled: !!questionId && !!paperId && signedIn,
    staleTime: 30 * 60 * 1000,
  });

  const hasKey = !!data && (data.correct.length > 0 || !!data.numericalAnswer);
  const answered = hasAnswer(picked);
  const right = hasKey && answered && isCorrect(kind, data!, picked);
  const keyLabel = !data ? "" : kind === "integer" ? data.numericalAnswer : lettersFor(options, data.correct);

  let body: React.ReactNode;
  if (!questionId) body = <p className="text-[13px] text-muted-foreground">This paper has no answer key.</p>;
  else if (!signedIn) body = <p className="text-[13px] text-muted-foreground">Sign in to check answers and see solutions.</p>;
  else if (isLoading) body = <p className="text-[13px] text-muted-foreground">Checking…</p>;
  else if (isError)
    body = (
      <p className="text-[13px] text-destructive">
        {errCode(error) === "54000"
          ? "You have opened a lot of answers this hour. Please try again a little later."
          : "Could not load the answer. Try again."}
      </p>
    );
  else if (!hasKey) body = <p className="text-[13px] text-muted-foreground">This question has no answer key yet.</p>;
  else
    body = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {answered ? (
          <span className={cn("inline-flex items-center gap-1.5 text-[14px] font-semibold", right ? "text-success" : "text-destructive")}>
            {right ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {right ? "Correct" : "Not quite"}
          </span>
        ) : (
          <span className="text-[13px] text-muted-foreground">You have not answered yet.</span>
        )}
        <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[13px] font-semibold text-foreground">
          Answer: {keyLabel}
        </span>
      </div>
    );

  const tone = hasKey && answered ? (right ? "border-success/50" : "border-destructive/50") : "border-border";

  return (
    <section aria-label="Solution" className={cn("mt-5 rounded-lg border bg-card p-4", tone)}>
      {body}
      {worked.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Worked solution</p>
          <div className="space-y-3">
            {worked.map((s) => (
              <div key={s.id}>
                {s.scope === "paper" && <p className="mb-1 text-[12px] text-muted-foreground">Full paper solution</p>}
                {s.kind === "video" ? (
                  <VideoFacade url={s.url} title={s.fileName} className="max-w-2xl" />
                ) : s.mime === "application/pdf" ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
                  >
                    <FileText className="h-4 w-4 shrink-0" /> Open PDF
                    <span className="truncate text-[12px] text-muted-foreground">{s.fileName}</span>
                  </a>
                ) : (
                  <img
                    src={s.url}
                    alt={s.note || `Worked solution: ${s.fileName}`}
                    loading="lazy"
                    className="max-h-[70vh] max-w-full rounded-md border border-border bg-white"
                  />
                )}
                {s.note && <p className="mt-1 text-[12px] text-muted-foreground">{s.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
