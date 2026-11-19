import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { notedQuestions, notesToText, type ExamNotes } from "@/lib/exam-persist";

type Tab = "question" | "all" | "general";

/** One-tap starters for the most common kinds of rough work. */
const STARTERS = ["Formula:", "Doubt:", "Trick:", "Revisit:", "Mistake:"];

/** Plain text of a question for previews (drops markdown, maths markers and image tags). */
export function plainSnippet(text: string, max = 90): string {
  const t = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[figure]")
    .replace(/\$+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Rough-work notes, one per question plus a general one. The "This question"
 * tab follows the question on screen, so moving through the paper brings each
 * question's own note along. "All notes" lists every noted question and jumps
 * to it. Everything saves as you type, on this device only.
 */
export function NotesPanel({
  notes,
  onChange,
  current,
  total,
  questionText,
  title,
  onGo,
}: {
  notes: ExamNotes;
  onChange: (n: ExamNotes) => void;
  current: number;
  total: number;
  /** Plain text of every question, for previews. */
  questionText: (i: number) => string;
  title: string;
  onGo: (i: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("question");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const noted = useMemo(() => [...notedQuestions(notes)].sort((a, b) => a - b), [notes]);
  const value = tab === "general" ? notes.general : notes.byQuestion[current] ?? "";

  // Focus the box when the panel opens or the question changes.
  useEffect(() => {
    if (tab !== "all") areaRef.current?.focus({ preventScroll: true });
  }, [tab, current]);

  const write = (text: string) => {
    if (tab === "general") onChange({ ...notes, general: text });
    else onChange({ ...notes, byQuestion: { ...notes.byQuestion, [current]: text } });
  };

  const insert = (starter: string) => {
    const el = areaRef.current;
    const prefix = value && !value.endsWith("\n") ? "\n" : "";
    const add = `${prefix}${starter} `;
    if (!el) return write(value + add);
    const at = el.selectionEnd ?? value.length;
    const next = value.slice(0, at) + add + value.slice(at);
    write(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at + add.length, at + add.length);
    });
  };

  const text = () => notesToText(notes, title);
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text());
      toast.success("Notes copied");
    } catch {
      toast.error("Clipboard not available");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, "_").slice(0, 60) || "notes"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tabs: [Tab, string][] = [
    ["question", `Q${current + 1}`],
    ["all", `All notes${noted.length ? ` (${noted.length})` : ""}`],
    ["general", "General"],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Notes" className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-8 truncate rounded-md px-2 text-[12px] font-medium transition-colors",
              tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "all" ? (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {noted.length === 0 && !notes.general.trim() ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-muted-foreground">
              <StickyNote className="h-6 w-6" />
              No notes yet. Open a question and write in the Q tab.
            </div>
          ) : (
            <ul className="space-y-2">
              {noted.map((i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      onGo(i);
                      setTab("question");
                    }}
                    className={cn(
                      "w-full rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted",
                      i === current ? "border-primary" : "border-border"
                    )}
                  >
                    <p className="text-[12px] font-semibold">Question {i + 1}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{plainSnippet(questionText(i), 60)}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px]">{notes.byQuestion[i]}</p>
                  </button>
                </li>
              ))}
              {notes.general.trim() && (
                <li>
                  <button type="button" onClick={() => setTab("general")} className="w-full rounded-lg border border-border bg-card p-2.5 text-left hover:bg-muted">
                    <p className="text-[12px] font-semibold">General</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px]">{notes.general}</p>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          {tab === "question" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onGo(current - 1)}
                disabled={current === 0}
                aria-label="Previous question"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground" title={plainSnippet(questionText(current), 300)}>
                <span className="font-semibold text-foreground">Q{current + 1}</span> · {plainSnippet(questionText(current), 70)}
              </p>
              <button
                type="button"
                onClick={() => onGo(current + 1)}
                disabled={current >= total - 1}
                aria-label="Next question"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => insert(s)}
                className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:border-input hover:text-foreground"
              >
                {s.replace(":", "")}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="exam-note">
            {tab === "general" ? "General note" : `Note for question ${current + 1}`}
          </label>
          <textarea
            id="exam-note"
            ref={areaRef}
            value={value}
            onChange={(e) => write(e.target.value)}
            maxLength={5000}
            placeholder={tab === "general" ? "Anything for the whole paper…" : `Working for question ${current + 1}…`}
            className="min-h-[160px] flex-1 resize-none rounded-lg border border-border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">Saved on this device · {value.length}/5000</p>
        </div>
      )}

      <div className="mt-3 flex shrink-0 gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => void copyAll()}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted"
        >
          <Copy className="h-3.5 w-3.5" /> Copy all
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
    </div>
  );
}
