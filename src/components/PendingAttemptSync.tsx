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
          userId: user.id,
          paperId: pending.paperId,
          mode: pending.mode,
          durationSeconds: pending.durationSeconds,
          totalMarks: pending.totalMarks,
          answers: pending.answers as never,
        });
        clearPendingAttempt();
        toast.success("Your score has been saved");
        navigate(
          `/${pending.slug}/${pending.courseSlug}/report?attempt=${attemptId}&mode=${pending.mode}`,
          { replace: true }
        );
      } catch (e) {
        clearPendingAttempt();
        toast.error(e instanceof Error ? e.message : "Could not save your attempt");
      }
    })();
  }, [user, navigate]);

  return null;
}
