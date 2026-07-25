# QUIZZO

An academic exam platform and question bank management system for IIT Madras Online Degree programs. Students can browse past-year papers, take timed exams or practice sessions, and review their performance. Admins manage the full content lifecycle — from authoring questions to publishing papers and tracking analytics.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages & Functionality](#pages--functionality)
- [Components](#components)
- [Authentication](#authentication)
- [Database Schema](#database-schema)
- [Data Models](#data-models)
- [Routing](#routing)
- [State Management](#state-management)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Key Integrations](#key-integrations)

---

## Overview

QUIZZO is a dual-audience platform:

**Students** browse four degree programs across Foundation, Diploma, and Degree levels. Each course has a library of past-year papers. Students can launch a paper in **Exam Mode** (60-minute countdown, strict) or **Practice Mode** (stopwatch, hints, show-solution). After submitting, a detailed report breaks down scores, time per question, accuracy, and cumulative progress.

**Admins** create and publish exam papers through a multi-step builder that supports form-based authoring, raw LaTeX input, and bulk import. A question bank, academic schedule manager, and performance analytics dashboard round out the admin side.

---

## Tech Stack

| Layer | Library / Tool |
|---|---|
| UI Framework | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Routing | React Router 6 |
| Styling | TailwindCSS 3 + CSS variables |
| Component Primitives | Radix UI (shadcn/ui wrappers) |
| Backend / Auth | Supabase (PostgreSQL + Auth) |
| Server State | TanStack React Query 5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts 2 |
| 3D | Three.js + @react-three/fiber |
| Math Rendering | KaTeX |
| Notifications | Sonner |
| Theme | next-themes |
| Screenshot | html2canvas |
| Testing | Vitest + @testing-library |
| Linting | ESLint 9 |

---

## Project Structure

```
quizzo/
├── public/                        # Static assets
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
│
├── src/
│   ├── assets/
│   │   └── testimonial-avatar.jpg.asset.json
│   │
│   ├── components/
│   │   ├── ui/                    # 49 shadcn/ui primitives
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── card.tsx
│   │   │   ├── chart.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── sonner.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── ... (more)
│   │   │
│   │   ├── AppLayout.tsx          # Admin shell: sidebar + mobile sheet
│   │   ├── AppSidebar.tsx         # Collapsible / pinnable admin nav rail
│   │   ├── Logo3D.tsx             # Three.js animated cube for the landing hero
│   │   ├── MathText.tsx           # KaTeX-aware text renderer
│   │   ├── NavAuthArea.tsx        # Top-right auth widget (login / user menu)
│   │   ├── NavLink.tsx            # Sidebar link with active state highlight
│   │   ├── NeonPatternDefs.tsx    # SVG defs for hatched/neon chart fills
│   │   ├── NeonToggle.tsx         # Custom styled toggle with neon accent
│   │   ├── ProtectedRoute.tsx     # Auth guard — redirects to /auth
│   │   ├── SeverityBadge.tsx      # Critical / High / Medium / Low badge
│   │   ├── StackedLogo.tsx        # SVG "Q" brand mark
│   │   ├── StatusBadge.tsx        # Bug status colour badge
│   │   └── ThemeToggle.tsx        # Sun / Moon icon button
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx        # Global auth state + Supabase session
│   │
│   ├── data/
│   │   ├── questions.ts           # Question type definitions and helpers
│   │   └── schedule.ts            # Academic schedule model and seed data
│   │
│   ├── hooks/
│   │   ├── use-ghost-scrollbar.tsx # Hides default scrollbar styles
│   │   ├── use-mobile.tsx          # Breakpoint boolean hook
│   │   ├── use-neon-charts.ts      # Returns fill props for neon-styled charts
│   │   └── use-toast.ts            # Imperative toast helper
│   │
│   ├── integrations/
│   │   ├── lovable/
│   │   │   └── index.ts           # Lovable cloud auth client (Google OAuth)
│   │   └── supabase/
│   │       ├── client.ts          # Supabase browser client
│   │       └── types.ts           # Full auto-generated DB type tree
│   │
│   ├── lib/
│   │   ├── parse-bulk-paper.ts    # LaTeX bulk import parser
│   │   └── utils.ts               # cn(), slugify(), and other utilities
│   │
│   ├── pages/
│   │   ├── Analytics.tsx          # /admin/performance — pass rates, heatmap
│   │   ├── Auth.tsx               # /auth — sign-in / sign-up
│   │   ├── BugCreate.tsx          # /admin/create — paper builder
│   │   ├── BugDetail.tsx          # (reserved) bug detail view
│   │   ├── BugList.tsx            # /admin/bank — searchable question bank
│   │   ├── CourseDetail.tsx       # /:slug/:courseSlug — past papers list
│   │   ├── Dashboard.tsx          # /admin/overview — platform stats
│   │   ├── Degree.tsx             # /:slug — degree course browser
│   │   ├── Exam.tsx               # /:slug/:courseSlug/exam — exam / practice
│   │   ├── ExamReport.tsx         # /:slug/:courseSlug/report — result report
│   │   ├── Index.tsx              # / — root redirect to landing
│   │   ├── Landing.tsx            # / — public marketing + hero
│   │   ├── NotFound.tsx           # * — 404
│   │   ├── Profile.tsx            # /profile — user info + PYQ history
│   │   ├── Schedule.tsx           # /admin/schedule — academic calendar
│   │   └── Settings.tsx           # /settings — admin settings tabs
│   │
│   ├── test/
│   │   ├── example.test.ts
│   │   └── setup.ts
│   │
│   ├── App.tsx                    # Router root, providers, route tree
│   ├── index.css                  # Tailwind directives + CSS variable tokens
│   ├── main.tsx                   # React DOM entry point
│   └── vite-env.d.ts
│
├── supabase/
│   ├── config.toml
│   └── migrations/                # 9 SQL migration files (chronological)
│
├── .env                           # Supabase project credentials (not committed)
├── components.json                # shadcn/ui config
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Pages & Functionality

### Public Pages

#### `/` — Landing
The marketing home page. Renders a Three.js 3D rotating cube in the hero alongside the QUIZZO wordmark, degree navigation buttons, a live mock of the admin UI, a features section, testimonial, and a CTA. Light/dark theme toggle and auth links are in the nav.

#### `/auth` — Authentication
Sign-in and sign-up tabs plus a Google OAuth button. The `admin@quizzo` / `123` credential is a hardcoded bypass that sets `localStorage.quizzo_admin = "1"` and redirects directly to `/admin/overview`.

#### `/:slug` — Degree Browser
Displays all courses for the chosen degree (e.g., `data-science-and-applications`). Segmented controls filter by level (Foundation / Diploma / Degree) and exam type (Quiz 1 / Quiz 2 / End Term). Each course card shows deterministic paper and question counts and links through to its past-paper list. The full course catalog is currently enabled only for the Data Science program.

#### `/:slug/:courseSlug` — Course Detail (Past Papers)
Lists all available past papers for a course filtered by term (Jan / May / Sep) and year. Each paper card shows date, duration, question count, and total marks, with direct links to Exam Mode and Practice Mode.

#### `/:slug/:courseSlug/exam` — Exam / Practice Session

**Instruction view** — shows mode (exam or practice), status legend, question count, timer type, and a checkbox agreement before starting.

**Exam view**:
- 30 questions, four types: Single Correct, Multi Correct, Comprehension, Integer
- Full-screen layout with a collapsible question palette (colour-coded: answered / not answered / marked / not visited)
- Exam mode: 60-minute countdown; Practice mode: stopwatch (no time limit)
- Per-question toolbar: screenshot to clipboard (html2canvas), report-issue dialog, hint reveal (practice only)
- Integer questions use a custom on-screen keypad
- Comprehension questions display a scrollable passage above the stem
- Action bar: Mark for Review & Next, Clear Response, Save & Next
- Show Solution panel in practice mode (deterministic placeholder answers)
- Calculator dialog and notes panel accessible from the header
- Submit / End Practice navigates to the report page

#### `/:slug/:courseSlug/report` — Exam Report

Post-session summary page with:
- Metrics bar: Total Score, Accuracy %, Time Taken, Questions Attempted
- Questions by status bar chart (correct / incorrect / skipped / marked)
- Section distribution donut chart
- Time per question line chart
- Cumulative score area chart
- Question log table (list view or grid view) with search

#### `/profile` — User Profile
Profile info form (full name, academic track), PYQ practice history table with score and View Report links, change-password form, and a Log Out button. Requires auth; unauthenticated visitors are bounced to `/`.

---

### Protected Admin Pages

All routes under `/admin/*` and `/settings` are wrapped by `ProtectedRoute` and redirect to `/auth` if no session is found.

#### `/admin/overview` — Dashboard
Four stat cards: Total Students (1,284), Active Exams (18), Questions in Bank (3,540), Avg Accuracy (72%). Bar chart of exam attempts over 14 days. Pie chart of attempts by subject. Recent exams table with ID, title, subject, attempts, and average score.

#### `/admin/create` — Paper Builder

A multi-section authoring page:

1. **Academic Context** — degree, level, subject, year, term, exam dropdowns. The scheduled date is auto-resolved from the Schedule Manager.
2. **PYQ Reference** — optional PDF upload rendered in a dialog viewer.
3. **Question Stream** — inline list of all authored questions. Each card shows question number, type, marks, and a one-line preview. Clicking a card opens it in-place for editing.
4. **Question Editor** — toggled between Form View and LaTeX View:
   - **Form View**: type selector (Numerical / Single Correct / Multi Correct / Comprehension), marks input, stem textarea with live KaTeX preview, four option inputs with correct-answer toggle buttons. Comprehension mode adds a passage textarea and a list of sub-questions, each with their own type, marks, stem, options, and correct answers.
   - **LaTeX View**: a raw source textarea accepting standard exam LaTeX macros.
5. **Bulk Import** — paste multi-question LaTeX source; the parser produces structured `Question` objects and flags incomplete blocks for repair.
6. **Summary footer** — total questions, total marks, invalid count, Publish button.

#### `/admin/bank` — Question Bank
Searchable, filterable table of all questions. Filter by subject and difficulty (Easy / Medium / Hard). Columns: ID, Subject Tag, Question Snippet, Difficulty, Created date.

#### `/admin/schedule` — Academic Schedule Manager
Grid of academic terms by year (2021 → current + 3 years) across three terms (Jan / May / Sept). Each cell holds Quiz 1, Quiz 2, and End Term assessment date pickers. The paper builder reads these dates to auto-populate the exam date field.

#### `/admin/performance` — Performance Analytics
Four stat cards: Overall Pass Rate (78%), Average Score (68%), Exams Conducted (342), Active Cohorts (6). Subject-wise average bar chart. Pass/Fail ratio donut. Average score area chart across six semesters. Subject × difficulty accuracy heatmap (colour-coded green → amber → red).

#### `/settings` — Settings
Five tabs inside the admin shell:
- **Profile** — full name, job title, avatar upload (Supabase Storage), password change
- **Institution** — platform name, institution, support email, active academic terms (add/remove tags)
- **Team** — invite by email + role, pending invitations with revoke button, team member list with roles pulled from `get_team_members()` RPC
- **Notifications** — global broadcast composer (audience picker, message textarea, send button); recent broadcasts list. Delivery provider is not yet wired.
- **General** — theme selector (light/dark), default difficulty, default exam duration; Danger Zone placeholder for account deletion

---

## Components

### Layout

| Component | Purpose |
|---|---|
| `AppLayout` | Admin page shell. Renders `AppSidebar` on desktop and a `Sheet`-based drawer on mobile. |
| `AppSidebar` | Sticky left rail with pin/unpin toggle. Collapsed to 56 px when unpinned; hovering expands it over content without reflowing the main column. |
| `SidebarContent` | Nav items, logo, user avatar, and sign-out button. Shared between desktop rail and mobile sheet. |
| `ProtectedRoute` | Wraps admin routes. Reads `AuthContext` and `localStorage.quizzo_admin`; redirects to `/auth` when both are absent. |

### Navigation

| Component | Purpose |
|---|---|
| `NavAuthArea` | Top-right widget. Shows Sign In link when logged out; shows user initials avatar with dropdown (Profile, Sign Out) when logged in. |
| `NavLink` | Sidebar navigation link. Applies `border-l-2 border-emerald-500` + bg accent when active. |

### Branding

| Component | Purpose |
|---|---|
| `StackedLogo` | SVG "Q" stacked wordmark. Accepts `size` and `color` props. |
| `Logo3D` | Three.js canvas rendering a rotating cube. Accepts `variant`, `size`, `zoom`, `bgHex`, and `lineHex`. Used only on the landing hero. |

### Content

| Component | Purpose |
|---|---|
| `MathText` | Wraps children with KaTeX rendering. Detects `$...$` and `$$...$$` delimiters. |
| `SeverityBadge` | Colour-coded pill for `critical` / `high` / `medium` / `low`. |
| `StatusBadge` | Colour-coded pill for bug workflow states. |

### Charts & Visuals

| Component | Purpose |
|---|---|
| `NeonPatternDefs` | Inserts SVG `<defs>` with diagonal-hatch fill patterns, one per chart colour. Referenced by `url(#neon-...)` in Recharts `Cell` fills. |
| `NeonToggle` | Styled toggle button with neon accent variant. |
| `ThemeToggle` | Sun/Moon icon button wired to `next-themes`. |

---

## Authentication

`AuthContext` (`src/contexts/AuthContext.tsx`) wraps the entire application and exposes:

```ts
{
  user: User | null
  session: Session | null
  profile: Profile | null       // from public.profiles table
  loading: boolean
  signUp(email, password, fullName): Promise<void>
  signIn(email, password): Promise<void>
  signOut(): Promise<void>
  refreshProfile(): Promise<void>
}
```

**Flow:**
1. On mount, `supabase.auth.getSession()` restores any existing session.
2. `supabase.auth.onAuthStateChange` keeps the context in sync.
3. On successful session, the profile row is fetched from `public.profiles`.

**Methods:**
- Email/password sign-up (min 6 chars)
- Email/password sign-in
- Google OAuth via `@lovable.dev/cloud-auth-js`
- Hardcoded admin bypass: `admin@quizzo` / `123` → sets `localStorage.quizzo_admin = "1"`, skips Supabase

**Route Guard:**
`ProtectedRoute` checks both `AuthContext.user` and `localStorage.quizzo_admin`. Either being truthy grants access.

---

## Database Schema

All tables live in the `public` schema on Supabase (PostgreSQL 14.5).

### Tables

#### `profiles`
User display info. Created automatically by the `handle_new_user()` trigger on `auth.users` insert.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| full_name | text | |
| job_title | text | nullable |
| avatar_url | text | nullable; Supabase Storage URL |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `bugs`
Core issue tracking entity. The paper/question system reuses this table shape.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tracking_id | text | Human-readable ID (e.g., TRG-142) |
| title | text | |
| description | text | |
| severity | `bug_severity` | critical / high / medium / low |
| status | `bug_status` | new → assigned → in_progress → testing → resolved → closed |
| reporter_id | uuid | FK → auth.users |
| assignee_id | uuid | nullable |
| project_id | uuid | nullable FK → projects |
| sla_deadline | timestamptz | nullable |
| environment | text | nullable |
| steps_to_reproduce | text | nullable |
| actual_behavior | text | nullable |
| expected_behavior | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `projects`
| Column | Type |
|---|---|
| id | uuid |
| name | text |
| description | text |
| created_by | uuid |
| created_at / updated_at | timestamptz |

#### `comments`
| Column | Type |
|---|---|
| id | uuid |
| bug_id | uuid FK → bugs |
| user_id | uuid |
| content | text |
| created_at / updated_at | timestamptz |

#### `attachments`
| Column | Type |
|---|---|
| id | uuid |
| bug_id | uuid FK → bugs |
| user_id | uuid |
| file_name | text |
| file_path | text |
| file_size | int |
| mime_type | text |
| created_at | timestamptz |

#### `activity_log`
Audit trail for every bug state change.

| Column | Type |
|---|---|
| id | uuid |
| bug_id | uuid FK → bugs |
| user_id | uuid |
| action | text |
| old_value | text |
| new_value | text |
| created_at | timestamptz |

#### `user_roles`
| Column | Type |
|---|---|
| id | uuid |
| user_id | uuid |
| role | `app_role` (admin / moderator / user) |

#### `invitations`
| Column | Type |
|---|---|
| id | uuid |
| email | text |
| invited_by | uuid |
| role | `app_role` |
| status | text (pending / accepted / revoked) |
| expires_at | timestamptz |
| created_at | timestamptz |

#### `company_settings`
Platform-level config per user.

| Column | Type |
|---|---|
| id | uuid |
| user_id | uuid |
| company_name | text |
| company_website | text |
| industry | text |
| company_size | text |
| address | text |
| phone | text |
| company_logo_url | text |
| created_at / updated_at | timestamptz |

#### `notification_preferences`
| Column | Notes |
|---|---|
| email_on_new_bug | boolean |
| email_on_assignment | boolean |
| email_on_comment | boolean |
| email_on_status_change | boolean |
| email_on_sla_breach | boolean |
| daily_digest | boolean |

### Enums

```sql
bug_severity: critical | high | medium | low
bug_status:   new | assigned | in_progress | testing | resolved | closed
app_role:     admin | moderator | user
```

### Functions

| Function | Returns |
|---|---|
| `get_team_members()` | `{ user_id, full_name, job_title, avatar_url, role }[]` |
| `has_role(_user_id, _role)` | `boolean` |

### Trigger
`handle_new_user()` fires on `INSERT` to `auth.users` and creates a corresponding `profiles` row.

---

## Data Models

These TypeScript models live in `src/data/` and are shared across pages and the bulk parser to avoid circular imports.

### Question (`src/data/questions.ts`)

```ts
type QType = "numerical" | "single" | "multi" | "comprehension"
type SubQType = "numerical" | "single_correct" | "multi_correct"

interface SubQuestion {
  id: string
  type: SubQType
  marks: number
  stem: string
  options: string[]        // always 4 slots
  correct: number[]        // indices of correct options
  numericalAnswer: string
}

interface QuestionDraft {
  type: QType
  inputMode: "form" | "latex"
  latex: string            // raw LaTeX source (latex mode only)
  passage: string          // comprehension passage (form mode only)
  subQuestions: SubQuestion[]
  stem: string
  options: string[]
  correct: number[]
  numericalAnswer: string
  marks: number
}

interface Question extends QuestionDraft {
  id: string
  isValid: boolean         // false when bulk parser flagged the block
  issues: string[]         // human-readable reasons shown in the editor
}
```

### Academic Schedule (`src/data/schedule.ts`)

```ts
type TermKey = "jan" | "may" | "sept"

interface Assessment {
  name: string   // "Quiz 1" | "Quiz 2" | "End Term Exam"
  date: string   // "YYYY-MM-DD" or ""
}

interface ScheduleEntry {
  id: string          // "${year}-${term}"
  year: number
  term: TermKey
  assessments: Assessment[]
}
```

---

## Routing

```
Public
  /                              Landing page
  /auth                          Sign in / Sign up
  /:slug                         Degree browser
  /:slug/:courseSlug             Past papers for a course
  /:slug/:courseSlug/exam        Exam or practice session
  /:slug/:courseSlug/report      Post-session report
  /profile                       User profile (redirects if not authed)

Protected (requires auth or admin bypass)
  /admin/overview                Dashboard
  /admin/create                  Paper builder
  /admin/bank                    Question bank
  /admin/schedule                Academic schedule
  /admin/performance             Analytics
  /settings                      Settings

Fallback
  *                              404 Not Found
```

---

## State Management

| Concern | Solution |
|---|---|
| Auth / user session | `AuthContext` (React Context + `useState`) |
| Server data caching | TanStack React Query (`QueryClient`) |
| Forms | React Hook Form + Zod |
| Complex page-local state | `useState` / `useReducer` in-component |
| Theme | `next-themes` (`ThemeProvider`) |
| Toast / notifications | Sonner (`toast.*`) and shadcn `useToast` |
| Shared data models | `src/data/questions.ts`, `src/data/schedule.ts` (pure TS, no reactivity) |

> Most analytics and question bank data is currently static seed state. Live Supabase queries are used for auth, profiles, invitations, and team membership.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+ (or Bun)

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

### Test

```bash
npm test
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=https://your_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

All three values are available in your Supabase project dashboard under **Project Settings → API**.

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Serve production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Key Integrations

### Supabase
- **Auth**: email/password and Google OAuth sessions, persisted across page loads
- **Database**: PostgreSQL via the auto-generated typed client in `src/integrations/supabase/`
- **Storage**: `avatars` bucket for user profile pictures (upsert with cache-busting URL)
- **RPC**: `get_team_members()` and `has_role()` server-side functions

### Lovable Cloud Auth (`@lovable.dev/cloud-auth-js`)
Provides the Google OAuth redirect in `src/integrations/lovable/index.ts`. Called from the Auth page's "Continue with Google" button.

### Three.js + React Three Fiber
The `Logo3D` component renders an animated wireframe cube on the landing hero. It accepts theme-aware `bgHex` and `lineHex` colour props and updates on light/dark mode switches.

### KaTeX (via `MathText`)
The `MathText` component scans its children for `$...$` and `$$...$$` delimiters and renders them with KaTeX. Used throughout the paper builder editor, question previews, and (eventually) the exam question panel.

### html2canvas
In the exam view, the "Screenshot" button captures the current question DOM node via `html2canvas` and writes the PNG blob to the clipboard using the Clipboard API.

### Recharts
All charts (bar, area, pie, line) use Recharts wrapped in shadcn's `ChartContainer`. The `NeonPatternDefs` component injects SVG hatch-fill patterns so bars and areas display a distinctive diagonal-line texture instead of a solid colour.
