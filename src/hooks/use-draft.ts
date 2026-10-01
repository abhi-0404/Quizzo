/**
 * Auto-save / restore hook for the BugCreate page.
 *
 * Persistence split:
 *   localStorage  — everything JSON-serializable (groups minus Blob fields)
 *   IndexedDB     — PDF blobs, keyed by sectionId (via draft-store.ts)
 *
 * Lifecycle:
 *   • On mount: reads localStorage; if a draft exists, loads all blobs from
 *     IndexedDB and re-hydrates SectionState.initialPdfBlob, then returns
 *     the restored groups and sets `hasDraft = true`.
 *   • On every `groups` change (debounced 800ms): serializes groups to
 *     localStorage and flushes any new/changed blobs to IndexedDB.
 *   • `clearDraft()`: wipes both stores and resets hasDraft.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "@/data/questions";
import {
  savePdfBlob,
  loadAllPdfBlobs,
  clearAllPdfBlobs,
  deletePdfBlob,
} from "@/lib/draft-store";

/* ── Serializable subset of BugCreate's state ───────────────────────────── */

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
  /** Omitted from JSON — re-hydrated from IndexedDB on restore. */
  initialPdfBlob?: Blob;
  initialPdfName?: string;
  initialPdfStartPage?: number;
  /** undefined entries become null in JSON; restored as undefined. */
  initialQuestionPages?: (number | undefined)[];
  collapsed: boolean;
}

export interface DraftGroupState {
  id: string;
  universal: DraftGroupUniversal;
  contextOpen: boolean;
  sections: DraftSectionState[];
}

/* ── JSON shape (blobs omitted) ─────────────────────────────────────────── */

interface SerializedSection {
  id: string;
  subject: string;
  level: string;
  initialQuestions?: Question[];
  initialPdfName?: string;
  initialPdfStartPage?: number;
  initialQuestionPages?: (number | null)[];   // undefined → null in JSON
  collapsed: boolean;
}

interface SerializedGroup {
  id: string;
  universal: DraftGroupUniversal;
  contextOpen: boolean;
  sections: SerializedSection[];
}

interface DraftPayload {
  v: 1;
  savedAt: string;
  groups: SerializedGroup[];
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const LS_KEY   = "quizzo:create-draft";
const DEBOUNCE = 800;

/* ── Serialization helpers ──────────────────────────────────────────────── */

function serializeGroups(groups: DraftGroupState[]): SerializedGroup[] {
  return groups.map((g) => ({
    id: g.id,
    universal: g.universal,
    contextOpen: g.contextOpen,
    sections: g.sections.map((s) => ({
      id: s.id,
      subject: s.subject,
      level: s.level,
      initialQuestions: s.initialQuestions,
      initialPdfName: s.initialPdfName,
      initialPdfStartPage: s.initialPdfStartPage,
      // undefined entries become null in JSON.stringify — keep them as null
      // here and reverse the mapping on restore.
      initialQuestionPages: s.initialQuestionPages?.map((n) => n ?? null),
      collapsed: s.collapsed,
    })),
  }));
}

function deserializeGroups(serialized: SerializedGroup[]): DraftGroupState[] {
  return serialized.map((g) => ({
    id: g.id,
    universal: g.universal,
    contextOpen: g.contextOpen,
    sections: g.sections.map((s) => ({
      id: s.id,
      subject: s.subject,
      level: s.level,
      initialQuestions: s.initialQuestions,
      initialPdfName: s.initialPdfName,
      initialPdfStartPage: s.initialPdfStartPage,
      // null → undefined to match the original type
      initialQuestionPages: s.initialQuestionPages?.map((n) => n ?? undefined),
      collapsed: s.collapsed,
      initialPdfBlob: undefined,   // filled in later from IndexedDB
    })),
  }));
}

/* ── Hook ───────────────────────────────────────────────────────────────── */

export interface UseDraftReturn {
  /** True once the async restore check has completed. */
  restoreChecked: boolean;
  /** True when a non-empty draft was found and loaded on mount. */
  hasDraft: boolean;
  /** ISO timestamp of when the draft was last saved. */
  savedAt: string | null;
  /** Wipe both stores and reset hasDraft. Call when the admin discards. */
  clearDraft: () => Promise<void>;
}

export function useDraft(
  groups: DraftGroupState[],
  setGroups: (g: DraftGroupState[]) => void
): UseDraftReturn {
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [hasDraft, setHasDraft]             = useState(false);
  const [savedAt, setSavedAt]               = useState<string | null>(null);

  /** Track which section IDs currently have a blob so we can delete orphans. */
  const knownBlobIds = useRef<Set<string>>(new Set());

  /* ── Restore on mount ──────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) { setRestoreChecked(true); return; }

        const payload = JSON.parse(raw) as DraftPayload;
        if (payload.v !== 1 || !Array.isArray(payload.groups) || payload.groups.length === 0) {
          setRestoreChecked(true);
          return;
        }

        const groups = deserializeGroups(payload.groups);

        // Re-hydrate blobs from IndexedDB
        const allBlobs = await loadAllPdfBlobs();
        const blobById = new Map(allBlobs.map((b) => [b.id, b]));

        for (const g of groups) {
          for (const s of g.sections) {
            const stored = blobById.get(s.id);
            if (stored) {
              s.initialPdfBlob = stored.blob;
              knownBlobIds.current.add(s.id);
            }
          }
        }

        if (!cancelled) {
          setGroups(groups);
          setHasDraft(true);
          setSavedAt(payload.savedAt);
          setRestoreChecked(true);
        }
      } catch {
        // Corrupt draft — ignore and start fresh
        setRestoreChecked(true);
      }
    }

    void restore();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // run once on mount only

  /* ── Auto-save on every groups change (debounced) ─────────────────── */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't save before the restore check has completed — that would
    // immediately overwrite a valid draft with an empty array.
    if (!restoreChecked) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        if (groups.length === 0) {
          // Nothing left — wipe the draft entirely
          localStorage.removeItem(LS_KEY);
          await clearAllPdfBlobs();
          knownBlobIds.current.clear();
          setHasDraft(false);
          setSavedAt(null);
          return;
        }

        const now = new Date().toISOString();
        const payload: DraftPayload = {
          v: 1,
          savedAt: now,
          groups: serializeGroups(groups),
        };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
        setSavedAt(now);
        setHasDraft(true);

        // Sync blobs: save new ones, delete orphaned ones
        const currentIds = new Set(
          groups.flatMap((g) => g.sections.map((s) => s.id))
        );

        // Delete blobs for sections that no longer exist
        for (const id of knownBlobIds.current) {
          if (!currentIds.has(id)) {
            await deletePdfBlob(id);
            knownBlobIds.current.delete(id);
          }
        }

        // Save blobs for sections that have one
        for (const g of groups) {
          for (const s of g.sections) {
            if (s.initialPdfBlob && !knownBlobIds.current.has(s.id)) {
              await savePdfBlob(s.id, s.initialPdfBlob, s.initialPdfName ?? "");
              knownBlobIds.current.add(s.id);
            }
          }
        }
      } catch {
        // Storage quota exceeded or private-browsing block — fail silently
      }
    }, DEBOUNCE);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [groups, restoreChecked]);

  /* ── clearDraft ────────────────────────────────────────────────────── */

  const clearDraft = useCallback(async () => {
    localStorage.removeItem(LS_KEY);
    await clearAllPdfBlobs();
    knownBlobIds.current.clear();
    setHasDraft(false);
    setSavedAt(null);
  }, []);

  return { restoreChecked, hasDraft, savedAt, clearDraft };
}
