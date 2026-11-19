# Deploying QUIZZO

QUIZZO is a static single-page app (Vite build in `dist/`) backed by Supabase. There is no server of our own to run.

## 1. Database

Apply every migration to the **production** Supabase project:

```bash
supabase link --project-ref <prod-ref>
supabase db push
```

`20261107000000_production_hardening.sql` is the important one. It hides the answer key, moves grading into the database, and closes off tables the app no longer uses.

The four migrations from this round, in the order `db push` applies them:

| File | What it does |
|---|---|
| `20261107000000_production_hardening.sql` | Hides the answer key, server-side grading, locks unused tables |
| `20261107000100_real_data.sql` | Admin overview/performance aggregates, schedule, question reports, delete account |
| `20261107000200_contributor_role.sql` | Adds the `contributor` role. Kept in its own file because a new enum value cannot be used in the transaction that adds it |
| `20261107000300_contributor_workflow.sql` | Answer-key reviews, PDF/image solutions, the private `solutions` bucket, the admin contributor and review functions |
| `20261113000000_solution_video_links.sql` | Contributor video solutions as YouTube / Google Drive links (no upload, no storage cost) |
| `20261113000100_course_aliases.sql` | Course-heading abbreviations (DLGenAI, LSM) so the importer maps them |

Do not merge the last two files into one. Do not skip `20261107000200`: the next file fails without it.

### Verify it worked

Run these in the SQL editor, or with the anon key through the REST API:

| Check | Expected |
|---|---|
| `select correct from questions limit 1` as `anon` or `authenticated` | `permission denied` |
| `insert into attempts ...` as an authenticated user | `permission denied` (use `submit_attempt`) |
| `select * from bugs` as an authenticated user | `permission denied` |
| `select * from profiles` as a normal user | only their own row |
| `select get_team_members()` as a normal user | `Forbidden` |
| `insert into answer_reviews ...` as a normal user (no contributor role) | `new row violates row-level security policy` |
| `select admin_add_contributor('x@example.com')` as a normal user or a contributor | `Forbidden` |
| `update questions set correct = '[0]'` as a contributor | `UPDATE 0` (row-level security hides every row from them) |
| `select correct from questions limit 1` as a contributor | `permission denied` (they read the key only through `get_answer_key`) |
| Storage → Buckets → `solutions` | Shown as **Private**; a request to `/storage/v1/object/public/solutions/...` is refused |

### Create the first admin

Sign in once with the account that should be admin, then in the SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict do nothing;
```

There is no other way to become an admin. The old hardcoded `admin@quizzo` login no longer exists.

## 2. Supabase dashboard settings (cannot be set from code)

**Authentication → URL Configuration**
- Site URL: your production origin.
- Redirect URLs: `https://<your-domain>` and `https://<your-domain>/auth/callback` (sign-in returns to the site origin). Remove `localhost` entries from the production project.

**Authentication → Providers**
- Google: use a production OAuth client; add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.

**Authentication → Sign In / Providers**
- The app signs in with **Google only**. Leave the Email provider disabled unless you add an email form; if you do, turn on email confirmation, a minimum password length of 8 or more, and leaked-password protection.
- Enable CAPTCHA only if you add an email sign-in form (it does not apply to the Google flow).

**Authentication → SMTP**
- Only needed if you enable email sign-in or auth emails. The built-in sender is limited to a handful of emails per hour.

**Database → Backups**
- Turn on daily backups, or Point-in-Time Recovery on a paid plan.

**Project Settings → API**
- Only the **publishable (anon) key** goes in the frontend build. The service-role key must never appear in `VITE_*` variables or the repo.

## 3. Build and host

Environment variables (set in the host, not committed):

```
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

```bash
npm ci
npm run build      # output in dist/
```

The repo ships host config for both common setups, and each host ignores the other's:

- **Netlify / Cloudflare Pages:** `public/_headers` and `public/_redirects` are copied into `dist/`.
- **Vercel:** `vercel.json`.

Both set the SPA fallback (every path serves `index.html`), long-lived caching for hashed assets, HSTS, `X-Frame-Options: DENY`, a strict Content-Security-Policy and a restrictive Permissions-Policy.

If you use another host (nginx, S3 + CloudFront, Firebase), copy the same headers and the SPA fallback into its config.

### If you change what the app talks to

The CSP allows scripts from `self` only, plus Supabase (`*.supabase.co`, including websockets), Google Fonts and Google profile pictures. Adding an analytics script, a different font host or a custom Supabase domain means updating `connect-src`, `script-src`, `font-src` or `img-src` in **both** `public/_headers` and `vercel.json`.

## 4. After go-live

- Sign in as admin, publish one paper, take it signed in and signed out, and confirm the score appears in the report.
- Open the site in a private window and check the browser console for CSP violations. A single `next-themes` inline-script warning is known and harmless: the theme is applied by `public/theme-init.js` instead.
- Set up error monitoring. `src/components/ErrorBoundary.tsx` has a marked hook for it.
- Submit the sitemap and set a canonical URL once the domain is final.

## Known limits

- Practice-mode "Show Solution" needs a signed-in user: the key is fetched per question from the `reveal_answer` function. This stops reading the key straight from the table, and each account can open at most **150 new answers per hour** (re-opening one already seen is free), which makes bulk scraping slow. It does not stop a determined person using many accounts. If that matters, add CAPTCHA at sign-in or lower the cap in `20261107000300_contributor_workflow.sql`.
- Grading functions are SQL mirrors of `src/lib/grade.ts`. Change them together.
- Accepting a contributor's answer-key correction (Admin → Review Inbox) changes the key for **future** attempts only. Attempts already submitted keep the score they were given; they are not re-graded.
- Approved solutions are shown to students through signed links that expire after an hour. A student who leaves the page open longer needs to reopen the solution.
- The old bug-tracker tables (`bugs`, `comments`, `projects`, `activity_log`, `attachments`) are locked but not dropped. Drop them once you have confirmed they are empty.
- Remaining `npm audit` findings are in dev tooling (vite dev server, vitest) and `zod` 3.x, which only validates small form inputs. They do not ship in the built site.
