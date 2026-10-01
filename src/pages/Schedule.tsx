import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type Assessment, type ScheduleEntry, type TermKey,
  TERMS, TERM_ORDER, DEFAULT_ASSESSMENT_NAMES,
  SCHEDULE_SEED, entryId, formatDate,
} from "@/data/schedule";

/* ──────────────────────────────────────────────────────────────────────────
   The data model lives in `@/data/schedule` so /admin/create can resolve
   assessment dates from the same source. `ScheduleEntry` is the exact shape
   a POST /api/schedule body should take.
   ────────────────────────────────────────────────────────────────────────── */

/** Options offered by the name dropdown (plus "Other" for a custom label). */
const PRESET_NAMES = DEFAULT_ASSESSMENT_NAMES;
const OTHER = "__other__";

const START_YEAR = 2021;
const CURRENT_YEAR = new Date().getFullYear();
const FUTURE_YEARS = 3;
/** 2021 → current year + 3, newest first. */
const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR + FUTURE_YEARS - START_YEAR + 1 },
  (_, i) => CURRENT_YEAR + FUTURE_YEARS - i
);

type YearFilter = number | "all";

/* ── Shared flat control styles (solid only — no alpha, no shadows) ───────── */
const controlClass =
  "h-8 rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors " +
  "[color-scheme:light] dark:[color-scheme:dark]";
const inputClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 " +
  "dark:focus:border-gray-600 transition-colors";
const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors " +
  "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-black dark:hover:bg-white";

/** UI-only row shape — `isOther` drives the custom-name input, then is dropped. */
interface DraftRow extends Assessment {
  isOther: boolean;
}

const defaultRows = (): DraftRow[] =>
  DEFAULT_ASSESSMENT_NAMES.map((name) => ({ name, date: "", isOther: false }));

const toDraftRows = (assessments: Assessment[]): DraftRow[] =>
  assessments.map((a) => ({ ...a, isOther: a.name !== "" && !PRESET_NAMES.includes(a.name) }));

export default function Schedule() {
  const { toast } = useToast();

  const [entries, setEntries] = useState<ScheduleEntry[]>(SCHEDULE_SEED);
  const [yearFilter, setYearFilter] = useState<YearFilter>(CURRENT_YEAR);

  // Modal / draft state
  const [open, setOpen] = useState(false);
  const [draftYear, setDraftYear] = useState<number>(CURRENT_YEAR);
  const [draftTerm, setDraftTerm] = useState<TermKey>("jan");
  const [rows, setRows] = useState<DraftRow[]>(defaultRows());

  /** year → term → entry, for O(1) card lookup. */
  const byYear = useMemo(() => {
    const map = new Map<number, Map<TermKey, ScheduleEntry>>();
    entries.forEach((e) => {
      if (!map.has(e.year)) map.set(e.year, new Map());
      map.get(e.year)!.set(e.term, e);
    });
    return map;
  }, [entries]);

  /** Years rendered in the timeline: one, or every year holding data (newest first). */
  const visibleYears = useMemo(() => {
    if (yearFilter === "all") return [...byYear.keys()].sort((a, b) => b - a);
    return [yearFilter];
  }, [yearFilter, byYear]);

  const isOverwrite = entries.some((e) => e.id === entryId(draftYear, draftTerm));

  const openAdd = () => {
    const year = yearFilter === "all" ? CURRENT_YEAR : yearFilter;
    const terms = byYear.get(year);
    const firstFree = TERMS.find((t) => !terms?.has(t.key))?.key ?? "jan";
    setDraftYear(year);
    setDraftTerm(firstFree);
    setRows(defaultRows());
    setOpen(true);
  };

  const openEdit = (year: number, term: TermKey) => {
    const existing = byYear.get(year)?.get(term);
    setDraftYear(year);
    setDraftTerm(term);
    setRows(existing ? toDraftRows(existing.assessments) : defaultRows());
    setOpen(true);
  };

  /* ── Dynamic row helpers ────────────────────────────────────────────────── */
  const updateRow = (index: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const onNameSelect = (index: number, value: string) => {
    if (value === OTHER) updateRow(index, { isOther: true, name: "" });
    else updateRow(index, { isOther: false, name: value });
  };

  const addRow = () => setRows((prev) => [...prev, { name: "", date: "", isOther: false }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const selectValueFor = (row: DraftRow) =>
    row.isOther ? OTHER : PRESET_NAMES.includes(row.name) ? row.name : "";

  const handleSave = () => {
    if (rows.length === 0) {
      toast({ title: "No assessments", description: "Add at least one assessment row.", variant: "destructive" });
      return;
    }
    if (rows.some((r) => !r.name.trim())) {
      toast({ title: "Missing name", description: "Every assessment row needs a name.", variant: "destructive" });
      return;
    }
    if (rows.every((r) => !r.date)) {
      toast({ title: "No dates set", description: "Add at least one assessment date before saving.", variant: "destructive" });
      return;
    }

    // This object is the POST payload — send as-is once the endpoint exists.
    const payload: ScheduleEntry = {
      id: entryId(draftYear, draftTerm),
      year: draftYear,
      term: draftTerm,
      assessments: rows.map(({ name, date }) => ({ name: name.trim(), date })),
    };

    // Upsert by year+term. Every other entry (including past years) is preserved.
    setEntries((prev) =>
      [...prev.filter((e) => e.id !== payload.id), payload].sort(
        (a, b) => a.year - b.year || TERM_ORDER[a.term] - TERM_ORDER[b.term]
      )
    );

    if (yearFilter !== "all") setYearFilter(draftYear);
    setOpen(false);
    toast({
      title: isOverwrite ? "Schedule updated" : "Schedule added",
      description: `${TERMS.find((t) => t.key === draftTerm)?.label} · ${draftYear}`,
    });
  };

  const headerSummary =
    yearFilter === "all"
      ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"} across ${byYear.size} ${byYear.size === 1 ? "year" : "years"}`
      : `${byYear.get(yearFilter)?.size ?? 0}/3 terms scheduled`;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Academic Master Schedule</h1>
          <span className="text-[12px] text-muted-foreground">{headerSummary}</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="year-filter" className="text-[12px] text-muted-foreground">Year</label>
            <select
              id="year-filter"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className={controlClass}
            >
              <option value="all">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button onClick={openAdd} className={primaryBtnClass}>
            <Plus className="h-3.5 w-3.5" /> Add Schedule Entry
          </button>
        </div>

        {/* Timeline view */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 max-w-[1400px] space-y-8">
            {visibleYears.length === 0 ? (
              <div className="border border-border bg-card rounded-md px-4 py-12 text-center">
                <p className="text-[13px] text-muted-foreground">No schedule data recorded yet</p>
                <button onClick={openAdd} className={`${primaryBtnClass} mt-3`}>
                  <Plus className="h-3.5 w-3.5" /> Add Schedule Entry
                </button>
              </div>
            ) : (
              visibleYears.map((year) => {
                const terms = byYear.get(year);
                return (
                  <section key={year}>
                    {/* Year heading — only meaningful when stacking multiple years */}
                    {yearFilter === "all" && (
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[13px] font-medium">{year}</h2>
                        <span className="text-[12px] text-muted-foreground">
                          {terms?.size ?? 0}/3 terms scheduled
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {TERMS.map((term) => {
                        const entry = terms?.get(term.key);
                        return (
                          <div key={term.key} className="border border-border bg-card rounded-md overflow-hidden">
                            {/* Card header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                              <div className="flex items-center gap-2 min-w-0">
                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <p className="text-[13px] font-medium truncate">{term.label}</p>
                                <span className="text-[12px] text-muted-foreground">{year}</span>
                              </div>
                              <button
                                onClick={() => openEdit(year, term.key)}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            </div>

                            {/* Assessment list */}
                            {entry && entry.assessments.length > 0 ? (
                              <div>
                                {entry.assessments.map((a, i) => (
                                  <div
                                    key={`${a.name}-${i}`}
                                    className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted transition-colors"
                                  >
                                    <span className="text-[13px] truncate">{a.name}</span>
                                    <span
                                      className={`text-[12px] whitespace-nowrap tabular-nums ${
                                        a.date ? "text-foreground" : "text-muted-foreground"
                                      }`}
                                    >
                                      {formatDate(a.date)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-4 py-8 text-center">
                                <p className="text-[12px] text-muted-foreground">No schedule recorded</p>
                                <button
                                  onClick={() => openEdit(year, term.key)}
                                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Plus className="h-3 w-3" /> Add dates
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              {isOverwrite ? "Edit Schedule Entry" : "Add Schedule Entry"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Year + Term */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="draft-year" className="block text-[12px] text-muted-foreground">Year</label>
                <select
                  id="draft-year"
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                  className={`${controlClass} w-full`}
                >
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="draft-term" className="block text-[12px] text-muted-foreground">Term</label>
                <select
                  id="draft-term"
                  value={draftTerm}
                  onChange={(e) => setDraftTerm(e.target.value as TermKey)}
                  className={`${controlClass} w-full`}
                >
                  {TERMS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {isOverwrite && (
              <div className="border border-border bg-muted rounded-md px-3 py-2">
                <p className="text-[12px] text-muted-foreground">
                  A schedule already exists for this year and term — saving will update it.
                </p>
              </div>
            )}

            {/* Dynamic assessment rows */}
            <div>
              <p className="text-[12px] text-muted-foreground mb-2">Assessments</p>
              <div className="border border-border rounded-md overflow-hidden">
                {rows.length === 0 ? (
                  <div className="bg-card px-3 py-6 text-center">
                    <p className="text-[12px] text-muted-foreground">No assessment rows — add one below.</p>
                  </div>
                ) : (
                  rows.map((row, i) => (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 border-b border-border last:border-0 bg-card"
                    >
                      <select
                        value={selectValueFor(row)}
                        onChange={(e) => onNameSelect(i, e.target.value)}
                        aria-label={`Assessment ${i + 1} name`}
                        className={`${controlClass} sm:w-[160px]`}
                      >
                        <option value="" disabled>Select assessment</option>
                        {PRESET_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                        <option value={OTHER}>Other</option>
                      </select>

                      {row.isOther && (
                        <input
                          value={row.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                          placeholder="Custom name"
                          aria-label={`Assessment ${i + 1} custom name`}
                          className={`${inputClass} sm:flex-1`}
                        />
                      )}

                      <div className="flex items-center gap-2 sm:ml-auto">
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(i, { date: e.target.value })}
                          aria-label={`Assessment ${i + 1} date`}
                          className={`${controlClass} w-full sm:w-[170px]`}
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove assessment ${i + 1}`}
                          title="Remove row"
                          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-secondary transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={addRow}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Exam
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 text-[12px]">
              Cancel
            </Button>
            <button onClick={handleSave} className={primaryBtnClass}>
              Save Schedule
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
