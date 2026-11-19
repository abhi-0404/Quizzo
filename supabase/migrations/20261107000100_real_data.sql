-- Real data for the admin pages, plus the tables behind features that used to
-- be placeholders.
--
--   1. admin_overview() / admin_performance(): aggregates for the admin
--      Overview and Performance pages. Admin-only; they return totals, never
--      raw rows from other users.
--   2. academic_schedule: the Schedule page is now stored, not in-memory.
--   3. question_reports: "Report Error" in the exam now actually records.
--   4. delete_my_account(): the Settings "Delete account" button.
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 (first, because admin_overview reads it). Question reports
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('typo', 'wrong_answer', 'missing_image', 'unclear', 'other')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One report of each kind per student per question: stops accidental
  -- double-clicks and cheap spam from filling the queue.
  UNIQUE (question_id, user_id, reason)
);
CREATE INDEX IF NOT EXISTS idx_question_reports_status ON public.question_reports(status);
CREATE INDEX IF NOT EXISTS idx_question_reports_question ON public.question_reports(question_id);
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users file reports" ON public.question_reports;
DROP POLICY IF EXISTS "Users read own reports, admins read all" ON public.question_reports;
DROP POLICY IF EXISTS "Admins update reports" ON public.question_reports;
DROP POLICY IF EXISTS "Admins delete reports" ON public.question_reports;
CREATE POLICY "Users file reports" ON public.question_reports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users read own reports, admins read all" ON public.question_reports
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update reports" ON public.question_reports
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete reports" ON public.question_reports
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.question_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_reports TO authenticated;
GRANT ALL ON public.question_reports TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Academic schedule
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_schedule (
  id text PRIMARY KEY,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  term text NOT NULL CHECK (term IN ('jan', 'may', 'sept')),
  assessments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, term)
);
ALTER TABLE public.academic_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage schedule" ON public.academic_schedule;
CREATE POLICY "Admins manage schedule" ON public.academic_schedule
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.academic_schedule FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_schedule TO authenticated;
GRANT ALL ON public.academic_schedule TO service_role;

DROP TRIGGER IF EXISTS update_academic_schedule_updated_at ON public.academic_schedule;
CREATE TRIGGER update_academic_schedule_updated_at BEFORE UPDATE ON public.academic_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Admin aggregates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'students', (
      SELECT count(*) FROM public.profiles p
       WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')
    ),
    'published_papers', (SELECT count(*) FROM public.papers WHERE published),
    'questions', (
      SELECT count(*) FROM public.questions q JOIN public.papers p ON p.id = q.paper_id WHERE p.published
    ),
    'attempts_30d', (
      SELECT count(*) FROM public.attempts WHERE submitted_at > now() - interval '30 days'
    ),
    'avg_pct_30d', (
      SELECT round(100 * sum(score) / nullif(sum(total_marks), 0), 1)
        FROM public.attempts
       WHERE submitted_at > now() - interval '30 days' AND total_marks > 0
    ),
    'open_reports', (SELECT count(*) FROM public.question_reports WHERE status = 'open'),

    -- Zero-filled so a quiet day shows as a gap in the chart, not a missing bar.
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'attempts', coalesce(c.n, 0)) ORDER BY d.day), '[]'::jsonb)
        FROM generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day') AS d(day)
        LEFT JOIN (
          SELECT submitted_at::date AS day, count(*) AS n
            FROM public.attempts
           WHERE submitted_at >= current_date - 13
           GROUP BY 1
        ) c ON c.day = d.day::date
    ),

    'by_course', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'attempts', t.n) ORDER BY t.n DESC), '[]'::jsonb)
        FROM (
          SELECT c.name, count(*) AS n
            FROM public.attempts a
            JOIN public.papers p ON p.id = a.paper_id
            JOIN public.courses c ON c.id = p.course_id
           WHERE a.submitted_at IS NOT NULL
           GROUP BY c.name
           ORDER BY count(*) DESC
           LIMIT 6
        ) t
    ),

    'recent_papers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'paper_id', t.id, 'course', t.course, 'exam_type', t.exam_type, 'term', t.term,
               'year', t.year, 'programme', t.programme, 'attempts', t.attempts, 'avg_pct', t.avg_pct
             ) ORDER BY t.last_at DESC), '[]'::jsonb)
        FROM (
          SELECT p.id, c.name AS course, s.exam_type::text AS exam_type, s.term, s.year,
                 p.programme::text AS programme, count(*) AS attempts,
                 round(100 * sum(a.score) / nullif(sum(a.total_marks), 0), 1) AS avg_pct,
                 max(a.submitted_at) AS last_at
            FROM public.attempts a
            JOIN public.papers p ON p.id = a.paper_id
            JOIN public.courses c ON c.id = p.course_id
            JOIN public.sittings s ON s.id = p.sitting_id
           WHERE a.submitted_at IS NOT NULL
           GROUP BY p.id, c.name, s.exam_type, s.term, s.year, p.programme
           ORDER BY max(a.submitted_at) DESC
           LIMIT 5
        ) t
    ),

    'reports', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'reason', t.reason, 'note', t.note, 'created_at', t.created_at,
               'course', t.course, 'position', t.position, 'snippet', t.snippet
             ) ORDER BY t.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT r.id, r.reason, r.note, r.created_at, c.name AS course, q.position,
                 left(q.stem, 110) AS snippet
            FROM public.question_reports r
            JOIN public.questions q ON q.id = r.question_id
            JOIN public.papers p ON p.id = q.paper_id
            JOIN public.courses c ON c.id = p.course_id
           WHERE r.status = 'open'
           ORDER BY r.created_at DESC
           LIMIT 8
        ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Pass mark used below. The programme's real pass rule varies by course, so this
-- is a stated convention for the dashboard, not an official figure.
CREATE OR REPLACE FUNCTION public.admin_performance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  pass_mark constant numeric := 0.4;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH scored AS (
    SELECT a.id, a.user_id, a.paper_id, a.score, a.total_marks, a.submitted_at
      FROM public.attempts a
     WHERE a.submitted_at IS NOT NULL AND a.total_marks > 0
  ),
  top_courses AS (
    SELECT c.id, c.name, count(*) AS n
      FROM scored s
      JOIN public.papers p ON p.id = s.paper_id
      JOIN public.courses c ON c.id = p.course_id
     GROUP BY c.id, c.name
     ORDER BY count(*) DESC
     LIMIT 8
  )
  SELECT jsonb_build_object(
    'pass_mark_pct', pass_mark * 100,
    'attempts', (SELECT count(*) FROM scored),
    'avg_pct', (SELECT round(100 * sum(score) / nullif(sum(total_marks), 0), 1) FROM scored),
    'pass_count', (SELECT count(*) FROM scored WHERE score / total_marks >= pass_mark),
    'fail_count', (SELECT count(*) FROM scored WHERE score / total_marks < pass_mark),
    'active_students_30d', (SELECT count(DISTINCT user_id) FROM scored WHERE submitted_at > now() - interval '30 days'),

    'by_course', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('course', t.name, 'avg_pct', t.avg_pct, 'attempts', t.n) ORDER BY t.n DESC), '[]'::jsonb)
        FROM (
          SELECT c.name, count(*) AS n,
                 round(100 * sum(s.score) / nullif(sum(s.total_marks), 0), 1) AS avg_pct
            FROM scored s
            JOIN public.papers p ON p.id = s.paper_id
            JOIN public.courses c ON c.id = p.course_id
           WHERE c.id IN (SELECT id FROM top_courses)
           GROUP BY c.name
        ) t
    ),

    'by_term', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('term', t.term, 'year', t.year, 'avg_pct', t.avg_pct, 'attempts', t.n) ORDER BY t.year, t.ord), '[]'::jsonb)
        FROM (
          SELECT si.term, si.year, min(si.exam_date) AS ord, count(*) AS n,
                 round(100 * sum(s.score) / nullif(sum(s.total_marks), 0), 1) AS avg_pct
            FROM scored s
            JOIN public.papers p ON p.id = s.paper_id
            JOIN public.sittings si ON si.id = p.sitting_id
           GROUP BY si.term, si.year
        ) t
    ),

    -- Accuracy = correct / attempted (skipped answers don't count against it).
    'accuracy_by_kind', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('course', t.name, 'kind', t.kind, 'accuracy', t.accuracy, 'attempted', t.attempted)), '[]'::jsonb)
        FROM (
          SELECT c.name, q.kind::text AS kind,
                 count(*) FILTER (WHERE aa.status <> 'skipped') AS attempted,
                 round(100.0 * count(*) FILTER (WHERE aa.status = 'correct')
                       / nullif(count(*) FILTER (WHERE aa.status <> 'skipped'), 0), 0) AS accuracy
            FROM public.attempt_answers aa
            JOIN scored s ON s.id = aa.attempt_id
            JOIN public.questions q ON q.id = aa.question_id
            JOIN public.papers p ON p.id = q.paper_id
            JOIN public.courses c ON c.id = p.course_id
           WHERE c.id IN (SELECT id FROM top_courses)
           GROUP BY c.name, q.kind
          HAVING count(*) FILTER (WHERE aa.status <> 'skipped') > 0
        ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_performance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_performance() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Delete account
-- ─────────────────────────────────────────────────────────────────────────────
-- Removing the auth user cascades to the profile, roles, attempts and answers.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.has_role(uid, 'admin')
     AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'You are the only admin. Make someone else an admin before deleting this account.'
      USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Academic track on the profile
-- ─────────────────────────────────────────────────────────────────────────────
-- The Profile page's "Academic Track" selector used to be a fixed string that
-- was never saved.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academic_track text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_academic_track_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_academic_track_len
  CHECK (academic_track IS NULL OR char_length(academic_track) <= 80);
