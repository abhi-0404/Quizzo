# QUIZZO — Project Plan

> Last updated: July 2026
> Status: Active development — core platform shipped, admin tooling complete, live exam data integration pending.

---

## What is QUIZZO?

QUIZZO is an academic exam practice and management platform built for **IIT Madras Online Degree** students and content administrators.

**Students** can browse past-year papers (PYQs) across four degree programs, attempt them in timed Exam Mode or unlimited Practice Mode, and review a detailed post-session report covering score, accuracy, time per question, and cumulative progress.

**Admins** can author and publish exam papers (form-based or raw LaTeX), manage a question bank, maintain the academic schedule, and monitor platform-wide performance analytics.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| Styling | TailwindCSS 3 + shadcn/ui (Radix UI) |
| Routing | React Router 6 |
| Backend / Auth | Supabase (PostgreSQL 14.5 + Auth) |
| Server state | TanStack React Query 5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts 2 |
| 3D | Three.js + React Three Fiber |
| Math | KaTeX |
| Screenshots | html2canvas |
| Notifications | Sonner |
| Theme | next-themes |
| Testing | Vitest + @testing-library |

---

## Completed Work

### Phase 1 — Project Scaffold
- Vite 5 project with `@vitejs/plugin-react-swc`
- TypeScript 5 strict config (split app + node tsconfig)
- TailwindCSS 3 with CSS variable token system for light/dark themes
- ESLint 9 with react-hooks and react-refresh plugins
- Vitest 3 with jsdom environment for unit testing
- `.gitignore` covering `node_modules`, `dist`, `.env`, OS artefacts, editor folders, Supabase local dev dirs
- `.env.example` documenting all required environment variables

### Phase 2 — Supabase Integration & Authentication
- Supabase browser client configured via env vars
- Full auto-generated TypeScript types for all DB tables, enums, views, and RPCs
- `AuthContext` exposing: `user`, `session`, `profile`, `loading`, `signUp`, `signIn`, `signOut`, `refreshProfile`
  - Session restored on mount via `getSession()`
  - Realtime sync via `onAuthStateChange`
  - Profile auto-fetched from `public.profiles` on login
  - Admin bypass: `admin@quizzo` / `123` sets `localStorage.quizzo_admin = "1"`
- Google OAuth via Lovable Cloud Auth (`@lovable.dev/cloud-auth-js`)

### Phase 3 — Database Schema (9 Migrations)
Tables:
- `profiles` — user display info; auto-created by `handle_new_user()` trigger
- `bugs` — core issue entity (reused for exam paper tracking)
- `projects` — grouping container
- `comments` — threaded comments per issue
- `attachments` — file uploads linked to issues
- `activity_log` — audit trail of every state change
- `user_roles` — role assignments (`admin` / `moderator` / `user`)
- `invitations` — pending team invitations
- `company_settings` — platform-level config per user
- `notification_preferences` — per-user email toggle flags

Enums: `bug_severity`, `bug_status`, `app_role`

RPC functions:
- `get_team_members()` — returns profile + role for all users (security definer)
- `has_role(_user_id, _role)` — boolean role check

Security hardening (migration 2026-07-19):
- `company_settings SELECT` tightened to `auth.uid() = user_id`
- `invitations SELECT` restricted to inviter or admin
- `user_roles` redundant broad policy dropped; admin-only SELECT added
- `get_team_members()` created as security definer so Team tab never directly queries `profiles + user_roles`
- Leaked password protection enabled via auth config

### Phase 4 — UI Component Library
49 shadcn/ui primitives wrapping Radix UI, all using CSS variable tokens:
- Forms: button, input, label, textarea, checkbox, radio-group, switch, slider, input-otp, select, form
- Layout: card, separator, resizable, scroll-area, collapsible, accordion, tabs, sidebar
- Overlays: dialog, alert-dialog, sheet, drawer, popover, tooltip, toast, toaster, sonner, alert, progress, skeleton
- Navigation: breadcrumb, navigation-menu, menubar, pagination, dropdown-menu, context-menu, command
- Display: avatar, badge, calendar, carousel, chart, toggle, toggle-group, aspect-ratio

### Phase 5 — App Shell & Layout System
- `AppLayout` — admin page shell with `AppSidebar` (desktop) + Sheet drawer (mobile)
- `AppSidebar` — sticky left rail with pin/unpin toggle; hover expands without reflowing main column
- `ProtectedRoute` — auth guard checking `AuthContext.user` and `localStorage.quizzo_admin`
- `NavAuthArea` — top-right auth widget (Sign In link / avatar dropdown)
- `Logo3D` — Three.js animated wireframe cube for landing hero
- `StackedLogo` — SVG "Q" brand mark
- `NeonPatternDefs` — SVG defs for diagonal-hatch Recharts fills
- `MathText` / `MathField` — KaTeX-aware text renderer and controlled input
- Custom hooks: `use-ghost-scrollbar`, `use-mobile`, `use-neon-charts`, `use-toast`

### Phase 6 — Public Pages
- **Landing** (`/`) — hero with 3D cube, degree navigation buttons, admin UI mock preview, features section, student testimonial, CTA. All copy written for QUIZZO exam platform (not bug tracker).
- **Auth** (`/auth`) — Google OAuth + email/password sign-in/sign-up; admin bypass
- **Degree Browser** (`/:slug`) — 4 degree programs; segmented level + exam type filters; 27 courses with subject icons; deterministic paper/question counts
- **Course Detail** (`/:slug/:courseSlug`) — past-paper list with term/year filters; Exam Mode & Practice Mode launch; WhatsApp share
- **Profile** (`/profile`) — edit name/track, view PYQ history, change password, log out
- **404 Not Found** (`*`)

### Phase 7 — Exam Engine
- **Instruction view** — mode display, status legend, checkbox agreement
- **Question types** — Single Correct, Multi Correct, Comprehension (scrollable passage), Integer (on-screen keypad)
- **Question palette** — colour-coded grid (green/red/indigo/grey); collapsible on desktop
- **Exam mode** — 60-minute countdown, strict
- **Practice mode** — stopwatch, hints, Show Solution reveal
- **Action bar** — Save & Next, Mark for Review & Next, Clear Response
- **Toolbar** — screenshot (html2canvas → clipboard), report issue dialog, calculator, notes panel, theme toggle, submit/end

### Phase 8 — Exam Report
- Summary metrics: Total Score, Accuracy %, Time Taken, Questions Attempted
- Charts: status bar chart, section donut, time-per-question line, cumulative score area
- Question log: searchable table or grid view, list/grid toggle, marks (+/-) and time per row

### Phase 9 — Question Model & LaTeX Parser
- Shared `QuestionDraft` / `Question` / `SubQuestion` TypeScript model (`src/data/questions.ts`)
- `ScheduleEntry` / `Assessment` academic calendar model (`src/data/schedule.ts`)
- `parseBulkPaper()` — LaTeX bulk import parser producing `Question[]` with `isValid` flags and `issues[]` for invalid blocks
- `PaperPreview` — full-paper preview dialog
- `UniversalRenderer` — read-only question formatter
- Unit tests: `parse-bulk-paper.test.ts`

### Phase 10 — Admin Panel
- **Dashboard** (`/admin/overview`) — 4 stat cards, bar chart (14-day exam volume), donut chart (attempts by subject), recent exams table
- **Paper Builder** (`/admin/create`) — academic context dropdowns → optional PDF upload → question stream with inline editor (Form View + LaTeX View) → bulk import → publish
- **Question Bank** (`/admin/bank`) — searchable/filterable table by subject and difficulty
- **Academic Schedule** (`/admin/schedule`) — year × term grid with Quiz 1 / Quiz 2 / End Term date pickers; dates consumed by paper builder
- **Performance Analytics** (`/admin/performance`) — pass rate, avg score, subject bar chart, pass/fail donut, semester trend area chart, subject × difficulty accuracy heatmap
- **Settings** (`/settings`) — 5 tabs: Profile, Institution, Team (Supabase RPC), Notifications (broadcast composer), General (theme, defaults, danger zone)

### Phase 11 — Landing Page Copy Rewrite
Replaced all residual bug-tracker / issue-tracking language with QUIZZO exam platform copy:
- Hero heading and subtext updated
- UI mock IDs changed from `TRG-###` to `QZ-####`
- Detail panel labels: Status/Priority/Assignee/Due → Subject/Term/Attempts/Score
- Features: "Priority triage / Team workflows / Real-time analytics" → "Real exam pattern / Exam and practice modes / Performance analytics"
- Testimonial: Engineering Lead at Acme Corp → BS Data Science student
- CTA: bug-tracking copy → exam practice copy
- Auth page subtitle updated

### Phase 12 — Documentation & GitHub
- Complete `README.md` covering: project overview, tech stack, annotated directory tree, every page and its features, all components, auth flow, full DB schema, TypeScript data models, routing table, state management, getting started, env vars, scripts, and key integrations
- `.gitignore` updated: added `.env`/`.env.*`, Supabase local dev dirs, TypeScript build info, coverage output, Vite timestamp files
- `.env.example` added for contributor onboarding
- Pushed to GitHub (`abhi-0404/Quizzo`) as 11 structured commits, each covering a distinct feature layer

---

## Pending / Planned Work

### Near-term
- [ ] Connect live Supabase questions table — replace static seed data in Question Bank and Dashboard with real DB queries
- [ ] Persist exam attempts — save each session (answers, time per question, score) to a new `attempts` table
- [ ] Real PYQ content — import actual IIT Madras past papers into the question bank via the bulk LaTeX importer
- [ ] Attempt history — surface real attempt records on Profile page (currently static mock data)

### Features
- [ ] Search across all papers globally (not just per-course)
- [ ] Leaderboard / cohort comparison for students
- [ ] PDF export of exam report
- [ ] Email notifications when new papers are published (Notifications tab is wired but delivery provider not connected)
- [ ] Mobile-optimised exam view (current layout works but palette UX can be improved on small screens)
- [ ] Admin role enforcement on protected routes (currently any authenticated user can access `/admin/*`)
- [ ] Delete account flow (Settings → General → Danger Zone — currently shows "Coming Soon")

### Infrastructure
- [ ] CI/CD pipeline (GitHub Actions: lint → test → build on every push)
- [ ] Staging environment on Supabase
- [ ] Row-level security audit for any newly added tables

---

## Commit History

| # | Commit | What shipped |
|---|---|---|
| 1 | `chore: project scaffold` | Vite + React + TypeScript + Tailwind configs, lockfiles, .gitignore, .env.example |
| 2 | `feat: Supabase integration and authentication` | Supabase client, DB types, AuthContext, Lovable OAuth |
| 3 | `feat: UI component library` | 49 shadcn/ui primitives |
| 4 | `feat: app shell, layout, and shared component system` | AppLayout, AppSidebar, NavAuthArea, ProtectedRoute, Logo3D, hooks |
| 5 | `feat: public pages` | Landing, Auth, Degree browser, Course detail, Profile, 404 |
| 6 | `feat: exam engine` | Timed exam + practice mode, palette, 4 question types, toolbar |
| 7 | `feat: exam report` | Post-session charts and question log |
| 8 | `feat: question data model, LaTeX bulk import parser, and math rendering` | QuestionDraft model, parseBulkPaper, MathText, tests |
| 9 | `feat: admin panel` | Dashboard, Paper Builder, Question Bank, Schedule, Analytics, Settings |
| 10 | `feat: app router, Supabase migrations, and complete README` | App.tsx route tree, 9 SQL migrations, README.md |
| 11 | `content: rewrite landing and auth page copy for QUIZZO exam platform` | All bug-tracker copy replaced with exam platform content |
