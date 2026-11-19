-- Production hardening.
--
--   1. The answer key is no longer readable through the Data API.
--   2. Attempts are graded and stored by the database, not by the browser.
--   3. Leftover bug-tracker tables are closed off.
--   4. Profiles, the team list and invitations are no longer open to every
--      signed-in user.
--   5. Upload buckets get size and type limits.
--
-- Apply with `supabase db push`. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Answer key
-- ─────────────────────────────────────────────────────────────────────────────
-- Column-level privileges: `correct` and `numerical_answer` are simply absent
-- from what anon/authenticated may SELECT. INSERT/UPDATE/DELETE are untouched,
-- so the admin importer keeps working. Any column added to `questions` later
-- must be granted here explicitly.
REVOKE SELECT ON public.questions FROM anon, authenticated;
GRANT SELECT (
  id, paper_id, position, kind, marks, stem, passage, options,
  sub_questions, source_question_id, issues, created_at, updated_at
) ON public.questions TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Server-side grading
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors src/lib/grade.ts (matchesNumeric). Keep the two in step.
CREATE OR REPLACE FUNCTION public.answer_matches_numeric(given text, expected text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  want text := btrim(coalesce(expected, ''));
  g numeric;
  w numeric;
  m text[];
BEGIN
  IF want = '' THEN RETURN false; END IF;
  IF lower(btrim(given)) = lower(want) THEN RETURN true; END IF;

  BEGIN g := btrim(given)::numeric; EXCEPTION WHEN others THEN g := NULL; END;

  m := regexp_match(want, '^(-?[0-9.]+)\s*to\s*(-?[0-9.]+)$', 'i');
  IF m IS NOT NULL THEN
    IF g IS NULL THEN RETURN false; END IF;
    BEGIN
      RETURN g BETWEEN least(m[1]::numeric, m[2]::numeric) AND greatest(m[1]::numeric, m[2]::numeric);
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
  END IF;

  BEGIN w := want::numeric; EXCEPTION WHEN others THEN w := NULL; END;
  RETURN g IS NOT NULL AND w IS NOT NULL AND abs(g - w) < 1e-9;
END;
$$;

-- Grade and store one finished session. p_answers is an array of
--   { "question_id": uuid, "response": <number | number[] | string | null>,
--     "time_seconds": int }
-- Anything the client says about status or marks is ignored.
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_paper_id uuid,
  p_mode public.attempt_mode,
  p_duration_seconds integer,
  p_answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  paper_total integer;
  aid uuid;
  q record;
  e jsonb;
  resp jsonb;
  st public.answer_status;
  mk numeric;
  secs integer;
  given_arr integer[];
  want_arr integer[];
  n_correct integer := 0;
  n_incorrect integer := 0;
  n_skipped integer := 0;
  score_sum numeric := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_answers) > 500 THEN
    RAISE EXCEPTION 'too many answers' USING ERRCODE = '22023';
  END IF;

  SELECT total_marks INTO paper_total FROM public.papers
   WHERE id = p_paper_id AND published = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paper not found' USING ERRCODE = 'P0002';
  END IF;

  -- Soft rate limit: stops scripted floods without touching real students.
  IF (SELECT count(*) FROM public.attempts
       WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.attempts (user_id, paper_id, mode, submitted_at, duration_seconds, total_marks)
  VALUES (uid, p_paper_id, p_mode, now(),
          LEAST(GREATEST(COALESCE(p_duration_seconds, 0), 0), 43200), COALESCE(paper_total, 0))
  RETURNING id INTO aid;

  FOR q IN
    SELECT id, kind, marks, correct, numerical_answer
      FROM public.questions WHERE paper_id = p_paper_id ORDER BY position
  LOOP
    SELECT x INTO e FROM jsonb_array_elements(p_answers) x
     WHERE x->>'question_id' = q.id::text LIMIT 1;

    resp := e->'response';
    mk := 0;
    st := 'incorrect';

    IF resp IS NULL OR jsonb_typeof(resp) = 'null' OR resp = '""'::jsonb OR resp = '[]'::jsonb THEN
      st := 'skipped';
    ELSIF length(resp::text) > 500 THEN
      st := 'incorrect';
    ELSE
      BEGIN
        IF q.kind = 'numerical' THEN
          IF public.answer_matches_numeric(resp #>> '{}', q.numerical_answer) THEN st := 'correct'; END IF;
        ELSIF q.kind = 'multi' THEN
          IF jsonb_typeof(resp) = 'array' THEN
            SELECT array_agg(v::integer ORDER BY v::integer) INTO given_arr FROM jsonb_array_elements_text(resp) v;
            SELECT array_agg(v::integer ORDER BY v::integer) INTO want_arr  FROM jsonb_array_elements_text(q.correct) v;
            IF given_arr = want_arr THEN st := 'correct'; END IF;
          END IF;
        ELSE
          IF jsonb_typeof(resp) = 'number' AND q.correct @> resp THEN st := 'correct'; END IF;
        END IF;
      EXCEPTION WHEN others THEN
        st := 'incorrect';
      END;
    END IF;

    IF st = 'correct' THEN mk := q.marks; n_correct := n_correct + 1;
    ELSIF st = 'incorrect' THEN n_incorrect := n_incorrect + 1;
    ELSE n_skipped := n_skipped + 1;
    END IF;
    score_sum := score_sum + mk;

    secs := 0;
    IF jsonb_typeof(e->'time_seconds') = 'number' THEN
      secs := LEAST(GREATEST((e->>'time_seconds')::numeric, 0), 86400)::integer;
    END IF;

    INSERT INTO public.attempt_answers (attempt_id, question_id, response, status, marks_awarded, time_seconds)
    VALUES (aid, q.id,
            CASE WHEN st = 'skipped' OR length(resp::text) > 500 THEN NULL ELSE resp END,
            st, mk, secs);
  END LOOP;

  UPDATE public.attempts
     SET score = score_sum, correct_count = n_correct,
         incorrect_count = n_incorrect, skipped_count = n_skipped
   WHERE id = aid;

  RETURN aid;
END;
$$;

-- Practice mode's "Show Solution". Signed-in only, published papers only.
CREATE OR REPLACE FUNCTION public.reveal_answer(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT jsonb_build_object('correct', q.correct, 'numerical_answer', q.numerical_answer)
    INTO result
    FROM public.questions q JOIN public.papers p ON p.id = q.paper_id
   WHERE q.id = p_question_id
     AND (p.published = true OR public.has_role(auth.uid(), 'admin'));
  RETURN result;
END;
$$;

-- Admin-only: the whole key for a paper, for review and tooling.
CREATE OR REPLACE FUNCTION public.get_answer_key(p_paper_id uuid)
RETURNS TABLE(question_id uuid, "position" integer, correct jsonb, numerical_answer text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT q.id, q.position, q.correct, q.numerical_answer
      FROM public.questions q WHERE q.paper_id = p_paper_id ORDER BY q.position;
END;
$$;

REVOKE ALL ON FUNCTION public.answer_matches_numeric(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_attempt(uuid, public.attempt_mode, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reveal_answer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_answer_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_attempt(uuid, public.attempt_mode, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_answer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_answer_key(uuid) TO authenticated;

-- Attempts can now only be created through submit_attempt. Reads and deletes of
-- one's own history stay.
REVOKE INSERT, UPDATE ON public.attempts FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.attempt_answers FROM anon, authenticated;
DROP POLICY IF EXISTS "Users create own attempts" ON public.attempts;
DROP POLICY IF EXISTS "Users update own attempts" ON public.attempts;
DROP POLICY IF EXISTS "Users write own attempt answers" ON public.attempt_answers;
DROP POLICY IF EXISTS "Users update own attempt answers" ON public.attempt_answers;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Leftover bug-tracker tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Nothing in the app reads these any more. Access is revoked rather than the
-- tables dropped, so nothing is destroyed; drop them once confirmed empty.
REVOKE ALL ON public.bugs, public.comments, public.projects,
              public.activity_log, public.attachments FROM anon, authenticated;
DROP POLICY IF EXISTS "Authenticated can upload bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view bug attachments" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. People data
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile or admin" ON public.profiles;
CREATE POLICY "Users read own profile or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_full_name_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_full_name_len
  CHECK (char_length(full_name) <= 100) NOT VALID;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_job_title_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_job_title_len
  CHECK (job_title IS NULL OR char_length(job_title) <= 100) NOT VALID;

CREATE OR REPLACE FUNCTION public.get_team_members()
RETURNS TABLE(user_id uuid, full_name text, job_title text, avatar_url text, role text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.user_id, p.full_name, p.job_title, p.avatar_url,
           COALESCE(ur.role::text, 'user')
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id;
END;
$$;

DROP POLICY IF EXISTS "Inviter or admin can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Authenticated can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Inviter or admin can delete invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins manage invitations" ON public.invitations;
CREATE POLICY "Admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = invited_by);

-- Belt and braces: anon never needs these.
REVOKE ALL ON public.profiles, public.user_roles, public.invitations,
              public.company_settings, public.notification_preferences,
              public.attempts, public.attempt_answers FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Storage limits
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'avatars';
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'question-figures';
