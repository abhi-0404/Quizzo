> **Status (Nov 2026):** steps 1-11 are implemented in `src/pages/Exam.tsx` and `src/components/exam/*`, and step 12 is done (`src/lib/calc.ts`, `Calculator.tsx`; the tcsion iframe and its CSP entry are gone). This file is kept as the design rationale.

# Exam screen: research and implementation guide

Open [exam-ui-mock.html](exam-ui-mock.html) in a browser first. It shows the recommended screen using your real theme colours, in light and dark, with the timer warning states. Everything below explains it and how to build it in `src/pages/Exam.tsx`.

## 1. What the research says

I searched for how the major exam platforms and the research literature lay out a computer-based test. Source quality varies, so each finding says how solid it is.

| Finding | Basis | Confidence |
|---|---|---|
| A countdown timer is the preferred time display. Students also wanted a sound or visual alert at the **15-minute and 5-minute** marks. Students preferred questions grouped **by topic, then by type**. | [Journal study of 119 students on online exam interface design](https://datalearner.com/academic/journal-papers/0747-5632/volumes-and-issues/176/paper-detail/36255) | High (peer-reviewed), but one sample of students |
| Timer sits **top-right**. The question palette sits on the **right**, can be **collapsed**, and reopened from the side. Clicking a palette number jumps to that question **without saving** the current answer. | [NTA CBT guidelines (CUET UG 2025 copy)](https://assets.collegedunia.com/public/image/CUET_UG_2025_CBT_Guidelines_d56f5fd7786f3ac86475a8e3da67c03b.pdf) | High for the content, though this is a coaching site's copy of the NTA document |
| Five palette states: Answered, Not Answered, Not Visited, Marked for Review, **Answered & Marked for Review** (the last one **is evaluated**). | Same NTA document, and a [practice page that lists the same five](https://www.vedantu.com/contents/public/test/attempt/63258a8b5cd2a06c505392f0) | High on the categories. I could not confirm NTA's exact colours. |
| Pearson VUE-style tests have a **flag** toggle on the question, a **navigator** grid, and a **review screen** with Review All / Incomplete / Flagged filters before final submit. | Candidate accounts, e.g. [a PMP candidate write-up](https://www.project-management-prepcast.com/kunena/pmp-exam-lessons-learned/8685-passed-pmp-1st-attempt-9-5-19-part-3-of-4-exam-interface-answering-questions/reply/18506), and a [CBT tutorial from The IIA](https://www.theiia.org/globalassets/documents/certifications/cbt-exam-tutorial/tutorial-for-cbt-exams-english.pdf) | Medium (secondhand, not official docs) |
| A timed test needs a **warning before time runs out**. The time limit can be fixed when it is essential to the exam, but the rule expects warnings and a way for a third party to grant extra time. | [W3C WCAG 2.2: SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), [Pearson accessibility guidelines on time limits](https://ux.pearson.com/prototypes/accessibility-guidelines/patterns/pag/g2) | High (standards) |

**One thing the search could not give me:** the exact look of the TCS iON / NTA screen. Your PYQs come from TCS iON papers, so your students will sit that interface in the real exam. That is a design argument in itself: **keep the vocabulary and layout familiar** (palette on the right, "Save & Next", "Mark for Review & Next", "Clear Response", the same five states) and modernise only the visuals. The mock does exactly that.

## 2. The recommended screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Statistics for DS I           [ ⏱ 42:17 ]   ▦ calc  ✎ notes  ◐   [Submit exam]│  header, 56px
│ Quiz 1 · May 2025 · Exam                                                      │
├──[██████████░░░░░░░░░░░░░░░░░░░░░░]  answered 12 / 30 ───────────────────────┤  progress, 3px
│                                                              │ Question palette│
│  Question 7 of 30  [Single correct] [+4 marks]  [⚑ Mark]     │ ■ Answered   12 │
│                                                              │ ■ Not answered 4│
│  Question text, 17px, line-height 1.6, max width ~760px      │ ● Marked      2 │
│                                                              │ ●· Ans&marked  1│
│  ┌────────────────────────────────────────────────────────┐ │ ■ Not visited 11│
│  │ A   Variance                                            │ │                 │
│  └────────────────────────────────────────────────────────┘ │ SINGLE · Q1–10  │
│  ┌────────────────────────────────────────────────────────┐ │ [1][2][3][4][5][6]
│  │▌B   Median                (selected)                    │ │ [7][8][9][10]   │
│  └────────────────────────────────────────────────────────┘ │ MULTI · Q11–20  │
│  ┌ C   Range ──────────────────────────────────────────────┐ │ …               │
│                                                              │                 │
├──────────────────────────────────────────────────────────────┤ [Review & submit]
│ [← Previous] [Clear response]      [Mark & next] [Save & next]│  palette 320px  │
└──────────────────────────────────────────────────────────────┴─────────────────┘
```

**Why each part is where it is**

- **Header:** course, paper and mode on the left, timer on the right of centre, tools and Submit at the far right. The timer is the one number a student checks constantly, so it never moves and never shares a row with anything that changes.
- **Progress bar (3px):** the cheapest possible "how far am I" signal. It reads answered / total.
- **Question area:** one column, about 760px wide. Long lines hurt reading speed; a fixed measure also keeps figures and KaTeX stable. Comprehension questions use a two-column split (passage left, question right), which you already have.
- **Option rows:** whole row is the click target, at least 48px tall, with an A/B/C/D badge. Your current rows are 16px radios with `text-sm`, which is small on a laptop and awkward on a phone.
- **Mark for review** is a toggle on the question (like Pearson's flag), while "Mark for Review & Next" stays in the action bar for TCS iON familiarity.
- **Palette (320px, fixed width):** legend and counts are the same element, so there is no separate summary. Cells are 38–44px, grouped by question type with a small heading. Your grid uses a 3:1 column ratio, so the palette width changes with the window; a fixed width is more predictable.
- **Action bar:** Previous / Clear on the left, the forward actions on the right, Save & Next in the primary colour because it is the action taken ~90% of the time.

**Palette states: colour and shape together** (so it works for colour-blind students and in both themes)

| State | Look | Token classes |
|---|---|---|
| Not visited | grey square, 1px border | `bg-muted text-muted-foreground border border-border` |
| Not answered | red square | `bg-destructive text-destructive-foreground` |
| Answered | green square | `bg-success text-success-foreground` |
| Marked for review | indigo **circle** | `bg-primary text-primary-foreground rounded-full` |
| Answered & marked | indigo **circle** with a green dot | as above, plus a 10px `bg-success` dot, top-right |
| Current question | any of the above plus a ring | `ring-2 ring-foreground ring-offset-2 ring-offset-card` |

Every cell also gets an `aria-label` such as "Question 7, answered and marked", so screen readers get the state too.

**Timer states**

| Time left | Look | Also |
|---|---|---|
| more than 15 min | normal text | none |
| 15 min | `text-warning`, warning border | one toast, one screen-reader announcement |
| 5 min | `text-destructive`, destructive border | one toast, one announcement |
| 1 min | same as 5 min | one toast |
| 0 | n/a | auto-submit (already implemented) |

No flashing or fast pulsing. Announce only at the thresholds, never every second.

## 3. Where your screen stands today

What I found in `src/pages/Exam.tsx` before this pass, so you know what the steps change:

**Fixed in this pass (data correctness, no layout change)**
- Removed the 30 invented sample questions and the canned "hint" text. With no paper selected, the page now says to choose one.
- Per-question time was hardcoded to `0`, so the report's time chart was empty. It is now measured.
- The countdown was a tick counter, which drifts in background tabs, and it never submitted at 00:00. It now uses wall-clock time and auto-submits once.
- A failed save used to dump the student on an empty report. Their answers are now kept and the Submit button retries.
- "Report Error" did nothing. It now saves to `question_reports` and shows up on the admin Overview.
- The pure clock logic is in `src/lib/exam-timing.ts` with tests.

**Still to do (this is the UI work below)**
1. Colours are hardcoded (`bg-gray-50 dark:bg-[#0B0B0F]`, `#16161D`, `indigo-600`) instead of your theme tokens, so the exam screen will not follow future theme changes.
2. Four palette states, no "Answered & Marked". Pressing "Mark for Review & Next" on an answered question turns its cell into plain "marked" (the answer is still saved and scored, but the palette no longer shows it).
3. No confirmation or summary before **Submit**. One click ends the exam.
4. No time warnings.
5. No keyboard shortcuts.
6. A refresh loses the whole session.
7. The whole page re-renders every second because `seconds` lives in the top-level component.
8. The mobile "View Question Palette" bar is `fixed` and can cover the action bar.
9. The calculator is a third-party iframe (`tcsion.com`). It works, and I added it to the CSP, but it is outside your control.

## 4. Step by step

Do these in order. Each step leaves the app working, so you can commit after each.

### Step 0. Apply the database changes first

The exam screen now depends on two migrations. Without them, submitting an exam fails.

```bash
supabase db push
```

This applies `20261107000000_production_hardening.sql` and `20261107000100_real_data.sql`. Then follow the checks in [DEPLOYMENT.md](DEPLOYMENT.md).

### Step 1. Swap hardcoded colours for theme tokens

Do this first because it is mechanical and makes every later step look right in both themes.

In `Exam.tsx`, use find-and-replace:

| Find | Replace with |
|---|---|
| `bg-gray-50 dark:bg-[#0B0B0F]` | `bg-background` |
| `bg-white dark:bg-[#16161D]` | `bg-card` |
| `border-gray-200 dark:border-gray-800` | `border-border` |
| `text-gray-900 dark:text-white` | `text-foreground` |
| `text-gray-500 dark:text-gray-400`, `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |
| `bg-gray-100 dark:bg-[#27272A]`, `bg-gray-200 dark:bg-[#27272A]` | `bg-muted` |
| `bg-emerald-600` | `bg-success text-success-foreground` |
| `bg-rose-600` | `bg-destructive text-destructive-foreground` |
| `bg-indigo-600` | `bg-primary text-primary-foreground` |

Check the result in light and dark. The same replacements apply to `ExamReport.tsx`.

### Step 2. Move the session logic into one tested module

Create `src/lib/exam-session.ts`. This replaces the scattered `statuses` array logic and adds the fifth state.

```ts
export type QStatus = "notVisited" | "notAnswered" | "answered" | "marked" | "answeredMarked";

export type Answer = number | number[] | string | null | undefined;

export function hasAnswer(a: Answer): boolean {
  if (a == null) return false;
  if (Array.isArray(a)) return a.length > 0;
  if (typeof a === "string") return a.trim().length > 0;
  return true;
}

/** Status after "Save & Next" (or after leaving a question you answered). */
export const afterSave = (a: Answer): QStatus => (hasAnswer(a) ? "answered" : "notAnswered");

/** Status after marking for review. An answered question stays visibly answered. */
export const afterMark = (a: Answer): QStatus => (hasAnswer(a) ? "answeredMarked" : "marked");

/** Flag toggle: marked states go back to their plain state, otherwise they become marked. */
export function toggleMark(current: QStatus, a: Answer): QStatus {
  return current === "marked" || current === "answeredMarked" ? afterSave(a) : afterMark(a);
}

export function counts(statuses: QStatus[]) {
  const c: Record<QStatus, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
  for (const s of statuses) c[s] += 1;
  return c;
}
```

Write `src/test/exam-session.test.ts` with a handful of cases (answered then marked gives `answeredMarked`; toggling twice returns to `answered`; empty string counts as unanswered). Then change `Exam.tsx` to import `QStatus` and these helpers, and replace the local `Status` type, `saveAndNext`, `markAndNext` and `clearResponse` bodies. **Scoring is not affected:** the submit step reads `answers`, not `statuses`.

### Step 3. Build the palette as its own component

Create `src/components/exam/QuestionPalette.tsx`. Keep it a pure presentational component so a timer tick does not redraw it.

```tsx
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { QStatus } from "@/lib/exam-session";

const LOOK: Record<QStatus, string> = {
  notVisited: "bg-muted text-muted-foreground border border-border",
  notAnswered: "bg-destructive text-destructive-foreground",
  answered: "bg-success text-success-foreground",
  marked: "bg-primary text-primary-foreground rounded-full",
  answeredMarked: "bg-primary text-primary-foreground rounded-full",
};
const LABEL: Record<QStatus, string> = {
  notVisited: "not visited", notAnswered: "not answered", answered: "answered",
  marked: "marked for review", answeredMarked: "answered and marked for review",
};

export const PaletteCell = memo(function PaletteCell(
  { index, status, current, onGo }: { index: number; status: QStatus; current: boolean; onGo: (i: number) => void }
) {
  return (
    <button
      onClick={() => onGo(index)}
      aria-label={`Question ${index + 1}, ${LABEL[status]}`}
      aria-current={current ? "true" : undefined}
      className={cn(
        "relative aspect-square min-h-[38px] rounded-md text-[13px] font-medium tabular-nums",
        LOOK[status],
        current && "ring-2 ring-foreground ring-offset-2 ring-offset-card"
      )}
    >
      {index + 1}
      {status === "answeredMarked" && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
      )}
    </button>
  );
});
```

Then a `QuestionPalette` that renders the legend with counts (use `counts()` from Step 2), then the cells in `grid grid-cols-6 gap-2`. **Grouping:** if the paper has more than one question type, render a small uppercase heading before each run of the same type ("Single correct · Q1–10"). You already have `q.type` on every question, and the research found students prefer grouping by topic then type. Width: `w-80` on desktop, replacing `lg:grid-cols-4`.

### Step 4. Isolate the timer so it stops re-rendering the page

Today `seconds` is state in `Exam`, so everything under it can re-render every second. Move the ticking into a small component:

```tsx
// src/components/exam/ExamTimer.tsx
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { elapsedSeconds, remainingSeconds } from "@/lib/exam-timing";

const WARN_AT = [15 * 60, 5 * 60, 60]; // seconds left

export function ExamTimer({ startedAt, totalSeconds, practice, onExpire }: {
  startedAt: number; totalSeconds: number; practice: boolean; onExpire: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const warned = useRef(new Set<number>());
  const expired = useRef(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);

  const secs = practice ? elapsedSeconds(startedAt, now) : remainingSeconds(startedAt, totalSeconds, now);

  useEffect(() => {
    if (practice) return;
    for (const t of WARN_AT) {
      if (secs <= t && !warned.current.has(t) && secs > 0) {
        warned.current.add(t);
        const msg = `${Math.round(t / 60)} minute${t === 60 ? "" : "s"} left`;
        toast.warning(msg);
        setAnnounce(msg);
      }
    }
    if (secs === 0 && !expired.current) { expired.current = true; onExpire(); }
  }, [secs, practice, onExpire]);

  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const text = (h ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const low = !practice && secs <= 5 * 60;
  const warn = !practice && secs <= 15 * 60 && !low;

  return (
    <>
      <span role="timer" aria-label={practice ? "Time elapsed" : "Time remaining"}
        className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
          low ? "border-destructive text-destructive" : warn ? "border-warning text-warning" : "border-border")}>
        <Clock className="h-4 w-4" aria-hidden /> {text}
      </span>
      <span className="sr-only" aria-live="polite">{announce}</span>
    </>
  );
}
```

In `Exam.tsx`, delete the `seconds` state, the `tick` effect and the auto-submit effect I added, keep `startedAtRef`, render `<ExamTimer startedAt={startedAtRef.current!} … onExpire={finishSession} />`, and pass `onExpire` a stable callback (`useCallback`) that calls `finishSession`. `finishSession` reads `startedAtRef` itself, so nothing else changes.

### Step 5. Rebuild the option rows

```tsx
function OptionRow({ letter, checked, multi, onToggle, children }: {
  letter: string; checked: boolean; multi: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={checked} onClick={onToggle}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-md border bg-card px-3.5 py-2.5 text-left transition-colors",
        checked ? "border-primary bg-muted shadow-[inset_3px_0_0_hsl(var(--primary))]" : "border-border hover:border-input hover:bg-muted"
      )}>
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center border text-xs font-semibold",
        multi ? "rounded-md" : "rounded-full",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
        {letter}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}
```

Wrap the rows in `<div role="radiogroup">` (or `role="group"` for multi) with an `aria-label`. For multi-correct questions add the line "Select all that apply" above the options. Use it for `single`, `multi` and `comprehension`. Keep the integer keypad as it is, but also let the student type digits on a physical keyboard (an `onKeyDown` on the page that calls your existing `pressKey` for `0-9`, `.` and Backspace when no input is focused).

### Step 6. Rework the header and action bar

- **Header (`h-14`):** left = `courseTitle` + a second line with `examLabel` and the mode; centre-right = `<ExamTimer>`; right = calculator, notes, theme, then Submit. Hide calculator and notes below `md`.
- **Progress bar:** under the header, `h-[3px] bg-border` with an inner `bg-success` whose width is `answered / total`.
- **Question header:** "Question 7 of 30", the type chip, the marks chip, and a **flag toggle** button (`aria-pressed`) that calls `toggleMark` from Step 2. Keep the screenshot icon.
- **Action bar:** `[Previous] [Clear response]` left; `[Mark for review & next] [Save & next]` right, Save & Next is the only filled primary button. "Previous" should call `goTo(current - 1)` without changing the status.
- **Question column:** wrap the content in `mx-auto max-w-3xl`. Leave the comprehension two-column layout alone.

### Step 7. Add the review-and-submit dialog

Right now Submit is final. Use your existing `AlertDialog`:

1. Both "Submit exam" buttons (header and palette footer) open the dialog instead of calling `finishSession`.
2. The dialog shows the five counts from `counts(statuses)`, with a warning line if anything is unanswered or marked: "5 questions are unanswered and 2 are marked for review."
3. Add buttons "Review unanswered" and "Review marked". Each closes the dialog and calls `goTo` with the first matching index. (This is the Pearson "Review Incomplete / Flagged" idea.)
4. Primary action "Submit now" calls `finishSession`. The auto-submit at 0:00 skips the dialog.

### Step 8. Keyboard shortcuts

Add one `useEffect` on `keydown`. Ignore the event when the target is an input, textarea or select.

| Key | Action |
|---|---|
| `A`–`D` or `1`–`4` | choose / toggle that option |
| `N` | Save & Next |
| `P` | Previous |
| `M` | Toggle mark for review |
| `C` | Clear response |

Show the letters as small `<kbd>` hints on the buttons (the mock does this on Save & Next). Do not bind plain arrow keys: students expect them to scroll the passage.

### Step 9. Resume after a refresh

A student who refreshes by accident should not lose an hour of work. Save the session on every change and offer to resume.

```ts
// src/lib/exam-persist.ts
const key = (paperId: string, mode: string) => `quizzo_session:${paperId}:${mode}`;

export interface SavedSession {
  startedAt: number;
  answers: Record<number, unknown>;
  statuses: string[];
  questionMs: Record<number, number>;
  current: number;
  notes: string;
}

export const saveSession = (paperId: string, mode: string, s: SavedSession) => {
  try { localStorage.setItem(key(paperId, mode), JSON.stringify(s)); } catch { /* storage unavailable */ }
};
export const loadSession = (paperId: string, mode: string): SavedSession | null => {
  try { const r = localStorage.getItem(key(paperId, mode)); return r ? (JSON.parse(r) as SavedSession) : null; } catch { return null; }
};
export const clearSession = (paperId: string, mode: string) => {
  try { localStorage.removeItem(key(paperId, mode)); } catch { /* ignore */ }
};
```

- Save in an effect that depends on `answers`, `statuses`, `current`, debounced about 500ms.
- On the instruction screen, if a saved session exists **and** (practice mode, or `startedAt + duration` is still in the future), show "Resume your session?" with Resume and Start over. Resume restores the state and sets `startedAtRef.current = saved.startedAt`, so the clock keeps running from the original start. That matches a real exam: the time does not pause.
- Call `clearSession` after a successful submit.
- While `started`, add a `beforeunload` listener that calls `event.preventDefault()`.
- Show a small "Offline" badge in the header from `navigator.onLine` (listen to `online` / `offline`), with the text "answers are saved on this device".

### Step 10. Mobile layout

- Header: course name hidden under `sm`, timer stays, Submit moves into the palette sheet.
- Replace the full-width fixed "View Question Palette" bar. Make the action bar itself the bottom bar, `sticky bottom-0` with `pb-[env(safe-area-inset-bottom)]`, and put a **Palette** button (showing "12/30") in it. Give the scroll area matching bottom padding so nothing is hidden.
- Palette opens in your existing bottom sheet, with cells at least 44px.
- Comprehension: stack the passage above the question and put the passage in a collapsible "Passage" section so the options stay in view.
- Make sure no tap target is under 44px.

### Step 11. Accessibility pass

- Every icon-only button has an `aria-label` (most already do).
- Visible focus rings (`focus-visible:ring-2 ring-ring`) on options, palette cells and action buttons.
- Timer uses `role="timer"`; announcements use a separate `aria-live="polite"` region, only at 15, 5 and 1 minutes (Step 4).
- Check contrast of the status colours in **both** themes. Use a colour-blindness simulator on the palette to confirm the shapes carry the meaning on their own.
- Respect `prefers-reduced-motion`: keep transitions to colour only.
- Optional: A− / A+ font-size buttons in the header, stored in `localStorage`, applied as a class on the question column.

### Step 12. Optional: your own calculator

The current calculator is an iframe from `tcsion.com`. If that site changes or blocks embedding, the button breaks with no warning. A small in-house calculator (a dialog with a keypad, `Math` functions, and a degrees/radians switch) removes the dependency. Do this last; it does not affect anything else. If you build it, remove `frame-src https://www.tcsion.com` from `public/_headers` and `vercel.json`.

## 5. Check it before you ship it

Run `npm run typecheck && npm run lint && npm test && npm run build`, then walk through this by hand, in light and dark, desktop and a phone-width window:

1. Start an exam, answer a few questions, mark one, skip one. The palette shows all five states correctly.
2. Press Save & Next on an answered question that is marked: it stays "answered & marked".
3. Open another tab for two minutes and come back. The timer reflects the real time.
4. Change the paper's duration to 2 minutes in the database and run it: warnings fire once each, and the exam auto-submits at 0:00.
5. Refresh mid-exam: the resume prompt appears and the clock continues.
6. Turn the network off, press Submit: you stay on the page, the error says answers are kept, and pressing Submit again after reconnecting works.
7. Open the report: the time-per-question chart has real values.
8. Report a question as a signed-in student, then open `/admin/overview` as an admin: it appears under "Open question reports".
9. Use only the keyboard for one whole question (options, next, mark).
10. Open it on a real phone: nothing is covered by the bottom bar.

## 6. Limits to know about

- I could not open the real TCS iON or NTA screens. The layout combines their published guidance, secondhand candidate accounts, the journal study and general accessibility standards. The five palette colours are my choice mapped onto your tokens, not NTA's.
- The timer-hiding option some platforms offer is not in this plan. If you want it, make it a header toggle that hides the digits but still shows the 15- and 5-minute warnings.
- Extra time for students with accommodations (WCAG's "third party grants more time") is not built. It would need a per-user time multiplier on the server.
