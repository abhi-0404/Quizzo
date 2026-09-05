# PYQ Ingestion Pipeline — TCS iON Exam PDFs

> Implements [issue #1](https://github.com/abhi-0404/Quizzo/issues/1), ported from the
> proposed Colab/Python pipeline to the app's own stack: everything runs **in the
> browser**, inside the admin Paper Builder. No Python, no server, no API key.

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
