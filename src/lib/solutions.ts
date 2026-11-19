import { supabase } from "@/integrations/supabase/client";

/**
 * Approved worked solutions, as students see them in practice mode.
 *
 * Files live in the private `solutions` bucket. RLS lets any signed-in user
 * read an approved row and its file, and the file is only reachable through a
 * short-lived signed URL.
 */

export interface ApprovedSolution {
  id: string;
  /** "question" is attached to one question; "paper" covers the whole paper. */
  scope: "question" | "paper";
  kind: "file" | "video";
  fileName: string;
  /** Files only. */
  mime: string;
  sizeBytes: number;
  note: string;
  /** Signed file URL, or the canonical video link. */
  url: string;
}

const SIGNED_URL_SECONDS = 3600;

/** Question-specific solutions first, then whole-paper ones. Order within a group is kept. */
export function orderSolutions<T extends { scope: "question" | "paper" }>(items: T[]): T[] {
  return [
    ...items.filter((s) => s.scope === "question"),
    ...items.filter((s) => s.scope === "paper"),
  ];
}

export async function listApprovedSolutions({
  paperId,
  questionId,
}: {
  paperId: string;
  questionId: string;
}): Promise<ApprovedSolution[]> {
  const { data, error } = await supabase
    .from("paper_solutions")
    .select("id, question_id, kind, video_url, file_name, mime, size_bytes, note, storage_path, created_at")
    .eq("paper_id", paperId)
    .eq("status", "approved")
    .or(`question_id.eq.${questionId},question_id.is.null`)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map(async (row): Promise<ApprovedSolution | null> => {
      const scope = row.question_id ? "question" : "paper";
      if (row.kind === "video") {
        return row.video_url
          ? { id: row.id, scope, kind: "video", fileName: row.file_name, mime: "", sizeBytes: 0, note: row.note, url: row.video_url }
          : null;
      }
      if (!row.storage_path) return null;
      const { data: link, error: signError } = await supabase.storage
        .from("solutions")
        .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
      // One unreadable file must not hide the others.
      if (signError || !link?.signedUrl) return null;
      return {
        id: row.id,
        scope,
        kind: "file",
        fileName: row.file_name,
        mime: row.mime ?? "",
        sizeBytes: row.size_bytes ?? 0,
        note: row.note,
        url: link.signedUrl,
      };
    })
  );

  return orderSolutions(signed.filter((s): s is ApprovedSolution => s !== null));
}
