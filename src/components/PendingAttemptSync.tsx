import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { saveAttempt } from "@/lib/pyq-read";
import { loadPendingAttempt, clearPendingAttempt } from "@/lib/pending-attempt";

/**
 * Mounted once, at the root. Whenever a session appears — right after sign-in
 * on /auth, or later via a delayed email confirmation landing on any page —
 * this saves whatever exam attempt was held by savePendingAttempt() and sends
 * the student to its real, scored report instead of wherever they landed.
 */
export function PendingAttemptSync() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const flushedRef = useRef(false);

  useEffect(() => {
    if (!user || flushedRef.current) return;
    const pending = loadPendingAttempt();
    if (!pending) return;
    flushedRef.current = true;

    (async () => {
      try {
        const attemptId = await saveAttempt({
          paperId: pending.paperId,
          mode: pending.mode,
          durationSeconds: pending.durationSeconds,
          answers: pending.answers as never,
        });
        clearPendingAttempt();
        toast.success("Your score has been saved");
        navigate(
          `/${pending.slug}/${pending.courseSlug}/report?attempt=${attemptId}&mode=${pending.mode}`,
          { replace: true }
        );
      } catch (e) {
        // A paper that no longer exists or a malformed payload will never
        // succeed, so drop it. Anything else (network, rate limit) is kept and
        // retried on the next load rather than throwing the student's work away.
        const code = (e as { code?: string } | null)?.code;
        if (code === "P0002" || code === "22023") clearPendingAttempt();
        toast.error(
          (e instanceof Error ? e.message : "Could not save your attempt") +
            (code === "P0002" || code === "22023" ? "" : ". Your answers are kept and will be retried.")
        );
      }
    })();
  }, [user, navigate]);

  return null;
}
