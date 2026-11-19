# Handoff

## Run it
1. `pnpm install`
2. `.env` holds `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
3. `pnpm exec vite --port 8080`, open http://localhost:8080
4. Checks: `pnpm exec tsc -p tsconfig.app.json --noEmit`, `pnpm exec eslint .`, `pnpm exec vitest run`, `pnpm exec vite build`

Try the exam screen without data: open any course exam URL with `?preview=1` after using "Preview paper" in
`/admin/create`, or sit a published paper. Dev-only extractor lab: `/dev/pyq`.

## Git branches (stacked, merge in this order)
Work is split into one branch per feature, each based on the previous one. Open each PR against the branch
before it (the first against `master`) and merge top-down in order:
1. `chore/pnpm-ci-deploy`: pnpm only (npm and bun locks removed), CI on pnpm, Vercel/Netlify headers and CSP
2. `feat/db-production-hardening`: answer key hidden, grading in the database, admin aggregates
3. `feat/pyq-import-parser`: PDF parser audit fixes, publish queue, course aliases
4. `feat/app-shell-redesign`: loader, error boundary, lazy routes, real admin data, theme tokens
5. `feat/contributor-workflow`: contributor portal, review inbox, video solutions
6. `feat/exam-ui-rebuild`: new exam/practice screen, attempts graded by `submit_attempt`
7. `test/e2e-playwright`: Playwright suite against local Supabase
8. `feat/theme-transition`: circular light/dark reveal from the top-right corner

`PYQ pdf/` is git-ignored (real exam papers stay local).

## Testing
- Unit tests: `pnpm exec vitest run` (210 tests). `src/test/pyq-real-paper.audit.test.ts` checks every question of the
  real PDF in `PYQ pdf/` and is skipped when the PDF is absent.
- End to end: `pnpm exec supabase start` (local Supabase in Docker, applies every migration; never touches the live
  project), then `pnpm run test:e2e`. Playwright uses the installed Edge, builds the app and serves the production
  build on port 5180. Global setup creates admin, contributor and student test accounts in the local database.
  Specs: `e2e/01-admin-import` (imports and publishes the real 145-page PDF), `02-student`, `03-contributor`,
  `04-admin-panels`. 28 tests.
- Stop the local stack with `pnpm exec supabase stop`.

## Live database is behind
The live Supabase project has not had the newer migrations applied. Signed-out visitors currently get
`permission denied for function has_role` when listing papers (fixed by `20260906000000_...`). Apply every file in
`supabase/migrations/` in order (`supabase db push`), see `docs/DEPLOYMENT.md`.

## Roadmap (approved plan)
Phase 1 exam/practice UI: done. Phase 2 video solution links: done. Next: Phase 3 multi-degree catalog, Phase 4
coding practice (Python / SQL / Linux shell in the browser), Phase 5 growth features. Full plan:
`D:\.claude-accounts\pritam\plans\pasted-content-id-d20a-keep-working-merry-gosling.md`.

## Changed this session
- Theme switch: light/dark now reveals as a circle growing from the top-right corner (View Transitions API,
  `src/hooks/use-theme-transition.ts`, drop-in for next-themes' `useTheme`). Instant switch when the browser lacks
  the API or the user prefers reduced motion. Element colour transitions are paused during the switch.
- Loader: `src/components/QuizzoLoader.tsx` plus a boot loader inline in `index.html` (animates before any JS loads).
  Replaces the spinners on route, auth, paper and report loads. Reduced-motion users get a pulse.
- Exam and practice screen rebuilt from components in `src/components/exam/`: isolated timer with 15/5/1 minute
  warnings, five-state palette grouped by question type, 48px option rows, numeric pad (typing works too), own
  scientific calculator (`src/lib/calc.ts`, no eval), review-before-submit dialog, resume after refresh and notes per
  paper (`src/lib/exam-persist.ts`), keyboard shortcuts, offline badge, practice "Check answer" with per-option
  verdicts. Theme tokens only. Responsive from 360px phones to 2560px monitors.
- Fixed: blank options no longer shift option letters (grading is index based).
- Report page moved to theme tokens.
- Contributor video solutions: paste a YouTube or Drive link (`src/lib/video-link.ts`), shown with a click-to-load
  player (`src/components/VideoFacade.tsx`) to contributors, admins (Review Inbox) and students. Migration
  `20261113000000_solution_video_links.sql`. CSP allows only those two players and YouTube thumbnails.

## Verified
tsc clean, eslint 0 errors, 185 tests pass, build ok. Exam route chunk 23 KB gzip. Playwright with installed Edge
drove the exam at 360, 768, 1366, 1920 and 2560 px in light and dark (answer, keyboard, palette, numeric, passage,
submit dialog): no console errors, no horizontal scroll. An independent design review was run; its fixes are applied
except toning down the neon dark-mode green (`--success` in `.dark`), which is a site-wide theme choice.

## Bugs found and fixed by the full test pass
- `get_answer_key` used `position` (a reserved word) as a column name: the migration failed to apply at all.
- Publishing several papers quickly ran them in parallel and timed out the database: publishes are now queued.
- Papers with flagged questions (e.g. pen-and-paper attestations worth 24-35 marks) could be published with a fake key:
  Publish now refuses them.
- A button nested inside a button in the paper builder (invalid HTML).
- Keyboard: "C" both chose option C and cleared the answer. Clear is now X / Delete.
- Camera screenshot came out in the wrong theme and without lazy images.
- PDF import (parser audit over all 290 blocks): figures moved out of place, superscripts/subscripts flattened,
  pen-and-paper items imported as MCQs, shared reference data dropped, paper name missing.
- Course aliases for DLGenAI and LSM headings (migration `20261113000100_course_aliases.sql`).

## Not verified / left
- `src/lib/calc.ts` and its test are unused since the TCS iON calculator came back; delete when confirmed.
- `src/test/pdf-extract.integration.test.ts` (skipped) still expects the old flagged count.
- pnpm 12 warns that the `"pnpm"` field in package.json is no longer read, so `pnpm.overrides` (katex,
  @types/three) is ignored. Move those overrides to `pnpm-workspace.yaml` (`overrides:`) and re-lock.
- CI pins pnpm 12 in `.github/workflows/ci.yml`; first CI run on GitHub not yet observed.
