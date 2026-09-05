# PYQ Ingestion Pipeline — TCS iON Exam PDFs

> Implements [issue #1](https://github.com/abhi-0404/Quizzo/issues/1), ported from the
> proposed Colab/Python pipeline to the app's own stack: extraction runs **in the
> browser**, inside the admin Paper Builder, and the results are stored in
> Supabase and served to students. No Python, no server, no OCR service, no API key.

---

## Why the issue's design changed

The issue proposes four Colab scripts (split → images → OCR/LaTeX → push to an admin
API). Three things made a direct port wrong:

1. **There is no Quizzo API.** `api.quizzo.com` does not exist, `publishPaper()` in
   the Paper Builder is a mock, and the Supabase schema has no exam tables. Phase 4
   was descoped to "pipeline only" by the maintainer.
2. **No OCR or LLM is needed.** TCS iON papers are structured, text-layer PDFs. Every
   field the platform needs — including the answer key — is recoverable
   deterministically. That removes a paid dependency and makes the whole thing testable.
3. **The target LaTeX dialect is the repo's own.** `parseBulkPaper()` accepts a
   specific macro set; generic Mathpix `pdf-to-latex` output would be unusable.

## How the answer key is recovered

The cover page of every paper states:

> Notations : 1.Options shown in green color and with icon are correct.
> 2.Options shown in red color and with icon are incorrect.

The key is encoded as **fill colour**, which `getTextContent()` does not expose.
It is recovered from the page's operator list instead:

```
getOperatorList() → track OPS.setFillRGBColor → accumulate OPS.showText glyphs
                  → colour-tagged text runs → match /(\d{10,})\./ → optionId → colour
```

Option ids are globally unique 10+ digit tokens, so ids map to colours directly and no
positional alignment between the two pdf.js streams is required.

`#008000` = correct, `#ff0000` = incorrect.

Measured on `samples/IIT M DEGREE AN EXAM QDB2 26 Oct 2025.pdf`: **798/798 options
classified, 0 disagreements** against an independent PyMuPDF extraction, 143 pages in
~850 ms.

## Document structure

```
<Course Name>
Section Id : <id>            ← course boundary; the name is the line above
  Sub-Section Number : n
    Question Number : N Question Id : X Question Type : MCQ|MSQ|SA|COMPREHENSION
    Correct Marks : M
    Question Label : ...
    <stem lines, or an image region>
    Options :                 ← MCQ/MSQ
    <optionId>. <icon> <text> ← colour carries the key
    Possible Answers :        ← SA
    <answer lines>
```

| TCS iON type | count¹ | repo `QType` | bulk token |
|---|---|---|---|
| MCQ | 178 | `single` | `MCQ` |
| SA | 70 | `numerical` | `NUM` |
| MSQ | 31 | `multi` | `MSQ` |
| COMPREHENSION | 23 | `comprehension` | — |

¹ counts from the sample paper.

Comprehension parents carry no `Question Number`; they declare
`Question Numbers : (49 to 52)` and own the questions numbered in that range. 23/23
groups resolve correctly on the sample.

## Traps

- **Every section opens with a declaration item** — `Correct Marks : 0`, stem
  "THIS IS QUESTION…", options YES/NO. It is not content and is filtered on marks = 0
  (15 of them in the sample).
- **Many questions are rasterised.** Maths-heavy stems and options are drawn as images,
  so text extraction returns empty for them — 106 of the sample's 211 questions carry at
  least one figure, 282 regions in total. Regions are found by *text-gap inference* (the
  vertical band between the text line above and the one below), not by tracking image
  XObject placements. That also captures diagrams drawn as vector paths, which have no
  image object to track, and it was checked to contain every one of the 258 image
  objects PyMuPDF reports for the sample.
- **A line's recorded bottom is its baseline.** Cropping a band from there slices the
  descenders off the line above and bakes them into the figure, so bands start a few
  units lower.
- **`Answers Type` is not always `Equal`.** `Range` (`-2.72 to -2.64`) and `Set`
  (multiple accepted strings) also occur. `\answer{}` holds one value, so the first is
  emitted and the alternates are pushed to the block's `issues[]` so Bulk Import
  surfaces them for review rather than silently dropping them.
- **4 `Set` answers are `Response Type : Alphanumeric`** (e.g. `A,B,E,D,C`). The repo
  maps `numerical` → the exam runner's `integer` type → an on-screen *numeric* keypad,
  so those answers cannot be typed by a student. Out of scope for the pipeline; flagged
  on import.
- **Options wrap.** Option text can continue on the following line, and an option's id
  and text can straddle a page break.
- `getTextContent()` returns items, not lines, in PDF (bottom-left origin) space.
  Everything is normalised to top-left device space at the extraction boundary.

## Modules

| File | Role |
|---|---|
| `src/lib/pdf-extract.ts` | pdf.js access: items → lines, colour runs, image bands, page rendering |
| `src/lib/parse-tcs-ion.ts` | line stream → courses → `Question[]` in the repo's model |
| `src/components/PyqImport.tsx` | the import dialog: pick file → pick course → append |
| `src/data/questions.ts` | `assets` added to `QuestionDraft` / `SubQuestion` |
| `src/components/UniversalRenderer.tsx` | resolves `asset-<id>` references to `<img>` |
| `src/pages/BugCreate.tsx` | "Import PYQ PDF" button and the append handler |
| `src/pages/Exam.tsx`, `src/components/PaperPreview.tsx`, `src/data/preview-paper.ts` | carry assets to the render surfaces |

## Images

Extracted regions are cropped from a rendered page canvas and emitted as
`data:image/png` so no storage bucket is needed. Backgrounds are made **transparent**
(alpha keyed off luminance) rather than the 1-bit black-and-white the issue asks for:
a hard white background renders as a glaring white box in the app's dark theme, and
the issue separately requires theme-agnostic output. Transparency alone is only half
of it — dark ink on a dark page is still invisible — so the renderer pairs it with
`dark:invert dark:hue-rotate-180`, which lightens the ink and rotates coloured plots
back to their own hues.

**Why the text references assets instead of embedding them.** `UniversalRenderer`
sanitises with `rehype-sanitize`'s `defaultSchema`, which permits only `http`/`https`
in `img[src]` — an inlined `data:` URL would be stripped. Rather than widen the
sanitiser, a question carries an `assets: QuestionAsset[]` list and its text refers to
a figure as `![alt](asset-<id>)`. That is protocol-less, so the sanitiser passes it
through untouched, and the renderer resolves the id against the question's own asset
list. A reference that matches nothing renders as nothing. No `data:` protocol is ever
whitelisted, which is a smaller hole than the alternative.

## Verification

`src/test/parse-tcs-ion.test.ts` runs the parser over a recorded line stream for the
sample paper and pins every number in this document — 15 courses, 302 blocks, 15
declarations dropped, 211 top-level questions, 76 sub-questions, 0 missing answer keys.

`src/test/pdf-extract.integration.test.ts` runs the *real* `extractPdf` against the
PDF itself and asserts it reproduces that fixture, so the fixture cannot drift from
what the shipped module actually produces. It skips when `samples/` is absent.

The browser path — worker, canvas cropping, alpha keying, dark-theme rendering — was
exercised against the sample paper in Chromium: importing "Deep Learning" produced 11
questions and 37 figures with no console errors, and ~92% of a cropped figure's pixels
came back fully transparent.

---

# Part 2 — Platform integration

Extraction alone left the work in a dead end: an import lived in React state,
`publishPaper()` was a mock, and a refresh threw it away. This part stores what
was extracted and puts it in front of students.

## What the source data forced

Two measurements decided the schema.

**Exam codes of one cohort are duplicates.** QDB2 vs QDB3 (Quiz 1): 15/15 courses
byte-identical. QDB1 vs QDB2 (End Term): 12/12. So re-importing another code must
not create a second paper.

**Cohorts are not duplicates of each other.** On the same date, in the same slot,
Degree and Diploma "AI" share only 29 questions; Diploma and Foundation "MLF"
share 13. Deduping across cohorts would have destroyed real papers.

Hence `papers` is unique on **(sitting, course, programme, content_hash)** —
programme in the key, the hash making a repeat import idempotent.

A third measurement removed a feature: exam type cannot be read from the PDF.
`Group Minimum Duration` is 90 on quizzes as well as end terms, and `Duration`
varies 90/120/180 between two codes of the same sitting. The admin picks it, with
the date pre-filling from the academic calendar.

## Data model

| Table | Holds |
|---|---|
| `courses` / `course_aliases` | the catalog, and the abbreviations papers use for it |
| `sittings` | one exam date and type |
| `papers` | one course × cohort × content, with `source_codes[]` |
| `questions` | the flattened question list, options and key in `jsonb` |
| `question_assets` | figures, pointing into the `question-figures` bucket |
| `attempts` / `attempt_answers` | what a student did, per question |

Comprehension groups are **expanded into one question row per sub-question** at
publish time, each carrying the shared passage. `attempt_answers` is unique on
(attempt, question), so nested children sharing their parent's row id would have
allowed only one recorded answer per group.

Read policies include `anon` — the degree browser, course pages and the runner are
all reachable signed out. Paper, question and asset reads are
`published = true OR has_role(admin)`, so an admin can read back rows it has
inserted but not yet published.

## Modules added

| File | Role |
|---|---|
| `src/lib/pyq-ingest.ts` | pure: filename parsing, heading normalisation, content hash, merging PDFs into a sitting |
| `src/lib/pyq-publish.ts` | Supabase writes: courses, aliases, sittings, papers, questions, figures |
| `src/lib/pyq-read.ts` | every student-facing query, plus attempts |
| `src/lib/grade.ts` | scoring, kept free of the Supabase import so it stays testable |
| `src/data/course-icons.ts` | slug → icon, since an icon cannot live in the database |

## Verification

- **100 tests.** The two that matter most run against real extractions: two exam
  codes of one cohort collapse to a single paper, and two cohorts of the same
  course do not.
- **Publish path** is exercised against a stand-in Supabase client — upsert keys,
  publish-after-questions ordering, comprehension expansion, figure dedup.
- **Browser run** against the dev server: every student page degrades to an
  honest empty state with no database, and all five `/admin/*` routes redirect a
  signed-out visitor to `/auth`.

Not verifiable here: anything requiring a real database. The migration, the RLS
policies and the live publish are written but unrun until the schema is applied.

## Deploying this

1. **Apply the migrations** (Supabase SQL editor, or `supabase db push`):
   `supabase/migrations/20260731000000_*.sql` then `20260731000100_*.sql`.
2. **Create the admin account** in Supabase Auth, then grant it the role:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<the new user uuid>', 'admin');
   ```
   The old `admin@quizzo` / `123` bypass is gone — it never created a session, so
   `auth.uid()` was null and admin-only RLS could never have worked.
3. **Set real credentials** in `.env` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`).
4. **Import a sitting**: `/admin/create` → *Import PYQ PDF* → select every PDF for
   one exam date → confirm the exam type → map any unrecognised course headings →
   Publish.
5. **Check it as a student**: the degree browser should show real paper counts,
   and a paper should open, score and appear in Profile history.

## Known gaps

- Per-question timing is not recorded; the report shows session length instead.
- 17 alphanumeric answers (for example `A,B,E,D,C`) map to the runner's numeric
  keypad and cannot be typed. Flagged on import, not fixed.
- Courses created during an import land `confirmed = false` with a guessed level;
  they need naming and levelling in the catalog.
- `src/test/pdf-extract.integration.test.ts` skips unless the original sample PDF
  is present in `samples/`.
