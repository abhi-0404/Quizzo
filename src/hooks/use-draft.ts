/**
 * Draft handling for the BugCreate (paper builder) page.
 *
 * Nothing is saved to disk any more. The imported PDF, the page images and the
 * cropped figures stay in memory while the admin works and are written to
 * Supabase only when the paper is published. A refresh therefore starts clean.
 * Leftovers written by an earlier version (localStorage draft and the IndexedDB
 * PDF store) are deleted on first load.
 *
 * While there is unpublished work, the browser asks before the tab is closed.
 */

import { useCallback, useEffect } from "react";
import type { Question } from "@/data/questions";
import { clearAllPdfBlobs } from "@/lib/draft-store";

export interface DraftGroupUniversal {
  degree: string;
  term: string;
  exam: string;
  shift: "FN" | "AN" | "";
  examDate: string;
  examCode: string;
}

export interface DraftSectionState {
  id: string;
  subject: string;
  level: string;
  initialQuestions?: Question[];
  initialPdfBlob?: Blob;
  initialPdfName?: string;
  initialPdfStartPage?: number;
  initialQuestionPages?: (number | undefined)[];
  collapsed: boolean;
}

export interface DraftGroupState {
  id: string;
  universal: DraftGroupUniversal;
  contextOpen: boolean;
  sections: DraftSectionState[];
}

export interface UseDraftReturn {
  /** Always true: there is nothing asynchronous to restore. */
  restoreChecked: boolean;
  /** Always false: no draft is kept on disk. */
  hasDraft: boolean;
  savedAt: string | null;
  /** Remove any leftover data from an earlier version. */
  clearDraft: () => Promise<void>;
}

const LEGACY_LS_KEY = "quizzo:create-draft";

async function purgeLegacy(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    await clearAllPdfBlobs();
  } catch {
    /* IndexedDB unavailable */
  }
}

export function useDraft(
  groups: DraftGroupState[],
  _setGroups: (g: DraftGroupState[]) => void
): UseDraftReturn {
  useEffect(() => {
    void purgeLegacy();
  }, []);

  const hasWork = groups.length > 0;
  useEffect(() => {
    if (!hasWork) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWork]);

  const clearDraft = useCallback(() => purgeLegacy(), []);

  return { restoreChecked: true, hasDraft: false, savedAt: null, clearDraft };
}
