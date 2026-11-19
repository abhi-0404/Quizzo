-- Contributor workflow.
--
-- A contributor is a trusted reviewer an admin adds by email. On any published
-- paper a contributor can:
--   * see the answer key and say, per question, "correct" or "wrong, it should be X"
--   * upload a worked solution as a PDF or image, for a question or the whole paper
-- An admin then accepts or rejects each flag (accepting applies the corrected
-- key) and approves or rejects each solution. Approved solutions are shown to
-- students in practice mode.
--
-- Contributors never get write access to papers, questions or other users.
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: admin or contributor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_reviewer(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin') OR public.has_role(_uid, 'contributor')
$$;
REVOKE ALL ON FUNCTION public.is_reviewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_reviewer(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Answer-key reviews
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.answer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  verdict text NOT NULL CHECK (verdict IN ('correct', 'incorrect')),
  -- When the verdict is 'incorrect': the option indexes the reviewer says are
  -- right (single/multi), or the numeric answer (numerical).
  suggested_correct jsonb,
  suggested_numerical text CHECK (suggested_numerical IS NULL OR char_length(suggested_numerical) <= 60),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, reviewer_id),
  CHECK (verdict = 'correct' OR suggested_correct IS NOT NULL OR suggested_numerical IS NOT NULL)
);
-- A flag is later applied to the live key, so its shape must be sane. Without
-- this, an empty numeric answer or a junk array could break grading for a question.
ALTER TABLE public.answer_reviews DROP CONSTRAINT IF EXISTS answer_reviews_suggested_correct_shape;
ALTER TABLE public.answer_reviews ADD CONSTRAINT answer_reviews_suggested_correct_shape
  CHECK (
    suggested_correct IS NULL
    OR (jsonb_typeof(suggested_correct) = 'array'
        AND jsonb_array_length(suggested_correct) BETWEEN 1 AND 20
        AND pg_column_size(suggested_correct) < 512)
  );
ALTER TABLE public.answer_reviews DROP CONSTRAINT IF EXISTS answer_reviews_suggested_numerical_nonblank;
ALTER TABLE public.answer_reviews ADD CONSTRAINT answer_reviews_suggested_numerical_nonblank
  CHECK (suggested_numerical IS NULL OR btrim(suggested_numerical) <> '');

CREATE INDEX IF NOT EXISTS idx_answer_reviews_question ON public.answer_reviews(question_id);
CREATE INDEX IF NOT EXISTS idx_answer_reviews_reviewer ON public.answer_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_answer_reviews_status ON public.answer_reviews(status) WHERE verdict = 'incorrect';
ALTER TABLE public.answer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers file reviews" ON public.answer_reviews;
DROP POLICY IF EXISTS "Reviewers edit own pending reviews" ON public.answer_reviews;
DROP POLICY IF EXISTS "Reviewers read own, admins read all" ON public.answer_reviews;
DROP POLICY IF EXISTS "Reviewers delete own pending reviews" ON public.answer_reviews;

CREATE POLICY "Reviewers file reviews" ON public.answer_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.is_reviewer(auth.uid())
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND created_at <= now()
    AND EXISTS (
      SELECT 1 FROM public.questions q JOIN public.papers p ON p.id = q.paper_id
       WHERE q.id = answer_reviews.question_id AND p.published
    )
  );
-- A reviewer can change their own review only while it is still undecided, and
-- can never set the decision fields themselves. The pin trigger below stops
-- them moving a review to another question or back-dating it.
CREATE POLICY "Reviewers edit own pending reviews" ON public.answer_reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() AND status = 'pending' AND public.is_reviewer(auth.uid()))
  WITH CHECK (reviewer_id = auth.uid() AND status = 'pending' AND decided_by IS NULL AND decided_at IS NULL);
CREATE POLICY "Reviewers read own, admins read all" ON public.answer_reviews
  FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- A rejected flag can be withdrawn so the question can be flagged again.
CREATE POLICY "Reviewers delete own pending reviews" ON public.answer_reviews
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (reviewer_id = auth.uid() AND status IN ('pending', 'rejected')));

CREATE OR REPLACE FUNCTION public.pin_answer_review_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.question_id := OLD.question_id;
  NEW.reviewer_id := OLD.reviewer_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pin_answer_review_identity ON public.answer_reviews;
CREATE TRIGGER pin_answer_review_identity BEFORE UPDATE ON public.answer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.pin_answer_review_identity();

REVOKE ALL ON public.answer_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_reviews TO authenticated;
GRANT ALL ON public.answer_reviews TO service_role;

DROP TRIGGER IF EXISTS update_answer_reviews_updated_at ON public.answer_reviews;
CREATE TRIGGER update_answer_reviews_updated_at BEFORE UPDATE ON public.answer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Solutions (PDF or image)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paper_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  -- NULL means a solution for the whole paper.
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Object path in the private `solutions` bucket: <paper_id>/<author_id>/<file>
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime text NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_solutions_paper ON public.paper_solutions(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_solutions_question ON public.paper_solutions(question_id);
CREATE INDEX IF NOT EXISTS idx_paper_solutions_author ON public.paper_solutions(author_id);
CREATE INDEX IF NOT EXISTS idx_paper_solutions_status ON public.paper_solutions(status);
ALTER TABLE public.paper_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers submit solutions" ON public.paper_solutions;
DROP POLICY IF EXISTS "Read own, approved, or all as admin" ON public.paper_solutions;
DROP POLICY IF EXISTS "Authors delete own pending solutions" ON public.paper_solutions;

CREATE POLICY "Reviewers submit solutions" ON public.paper_solutions
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_reviewer(auth.uid())
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND created_at <= now()
    AND storage_path LIKE paper_id::text || '/' || auth.uid()::text || '/%'
    AND EXISTS (SELECT 1 FROM public.papers p WHERE p.id = paper_solutions.paper_id AND p.published)
    AND (
      question_id IS NULL
      OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = paper_solutions.question_id AND q.paper_id = paper_solutions.paper_id)
    )
  );
-- Approved solutions of a published paper are visible to every signed-in
-- student; everything else only to its author and to admins.
CREATE POLICY "Read own, approved, or all as admin" ON public.paper_solutions
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (status = 'approved'
        AND EXISTS (SELECT 1 FROM public.papers p WHERE p.id = paper_solutions.paper_id AND p.published))
  );
CREATE POLICY "Authors delete own pending solutions" ON public.paper_solutions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (author_id = auth.uid() AND status = 'pending'));
-- No UPDATE policy on purpose: decisions go through admin_decide_solution().

REVOKE ALL ON public.paper_solutions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.paper_solutions TO authenticated;
GRANT ALL ON public.paper_solutions TO service_role;

-- Quota: a reviewer can have at most 50 solutions waiting for a decision.
CREATE OR REPLACE FUNCTION public.enforce_solution_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.paper_solutions WHERE author_id = NEW.author_id AND status = 'pending') >= 50 THEN
    RAISE EXCEPTION 'Too many solutions are waiting for review. Please wait for a decision.' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_solution_quota ON public.paper_solutions;
CREATE TRIGGER enforce_solution_quota BEFORE INSERT ON public.paper_solutions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_solution_quota();

-- Private bucket, 10 MB, PDF and common image types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('solutions', 'solutions', false, 10485760,
        ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS "Reviewers upload solutions to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Read own, approved or admin solutions" ON storage.objects;
DROP POLICY IF EXISTS "Delete own pending solutions or admin" ON storage.objects;

-- Path is exactly <paper_id>/<author_id>/<file>: two folders, and folder [2]
-- must be the uploader, so nobody can write outside their own folder or nest deeper.
CREATE POLICY "Reviewers upload solutions to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'solutions'
    AND public.is_reviewer(auth.uid())
    AND array_length(storage.foldername(objects.name), 1) = 2
    AND (storage.foldername(objects.name))[2] = auth.uid()::text
  );
CREATE POLICY "Read own, approved or admin solutions" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'solutions'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(objects.name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.paper_solutions s
          JOIN public.papers p ON p.id = s.paper_id AND p.published
         WHERE s.storage_path = objects.name AND s.status = 'approved'
      )
    )
  );
-- A file that has a pending or approved row cannot be deleted or swapped from
-- under the admin: remove the row first (only possible while pending), then the file.
CREATE POLICY "Delete own pending solutions or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'solutions'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        (storage.foldername(objects.name))[2] = auth.uid()::text
        AND NOT EXISTS (
          SELECT 1 FROM public.paper_solutions s
           WHERE s.storage_path = objects.name AND s.status IN ('pending', 'approved')
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- The answer key is now readable by contributors too (published papers only
-- reach them through the normal read policies; this is the key itself).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_answer_key(p_paper_id uuid)
RETURNS TABLE(question_id uuid, "position" integer, correct jsonb, numerical_answer text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_reviewer(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  -- Contributors only ever see keys of published papers; admins see all.
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.papers p WHERE p.id = p_paper_id AND p.published) THEN
    RAISE EXCEPTION 'Paper not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
    SELECT q.id, q.position, q.correct, q.numerical_answer
      FROM public.questions q WHERE q.paper_id = p_paper_id ORDER BY q.position;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contributor: the paper queue with my progress
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contributor_papers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF NOT public.is_reviewer(uid) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.exam_date DESC, t.course), '[]'::jsonb)
    INTO result
    FROM (
      SELECT p.id AS paper_id, c.name AS course, c.slug AS course_slug,
             s.exam_type::text AS exam_type, s.term, s.year, s.exam_date,
             p.programme::text AS programme, p.slot::text AS slot, p.variant_label,
             p.question_count, p.total_marks,
             (SELECT count(*) FROM public.answer_reviews r JOIN public.questions q ON q.id = r.question_id
               WHERE q.paper_id = p.id AND r.reviewer_id = uid) AS my_reviews,
             (SELECT count(*) FROM public.answer_reviews r JOIN public.questions q ON q.id = r.question_id
               WHERE q.paper_id = p.id AND r.reviewer_id = uid AND r.verdict = 'incorrect') AS my_flags,
             (SELECT count(*) FROM public.paper_solutions ps WHERE ps.paper_id = p.id AND ps.author_id = uid) AS my_solutions,
             (SELECT count(*) FROM public.paper_solutions ps WHERE ps.paper_id = p.id AND ps.status = 'approved') AS approved_solutions
        FROM public.papers p
        JOIN public.courses c ON c.id = p.course_id
        JOIN public.sittings s ON s.id = p.sitting_id
       WHERE p.published
    ) t;

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: manage contributors
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_contributors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'contributors', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'user_id', u.id, 'email', u.email,
               'full_name', coalesce(pr.full_name, ''), 'avatar_url', pr.avatar_url,
               'joined_at', u.created_at,
               'reviews', (SELECT count(*) FROM public.answer_reviews r WHERE r.reviewer_id = u.id),
               'flags', (SELECT count(*) FROM public.answer_reviews r WHERE r.reviewer_id = u.id AND r.verdict = 'incorrect'),
               'solutions', (SELECT count(*) FROM public.paper_solutions s WHERE s.author_id = u.id)
             ) ORDER BY u.created_at), '[]'::jsonb)
        FROM public.user_roles ur
        JOIN auth.users u ON u.id = ur.user_id
        LEFT JOIN public.profiles pr ON pr.user_id = u.id
       WHERE ur.role = 'contributor'
    ),
    'invites', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at
             ) ORDER BY i.created_at DESC), '[]'::jsonb)
        FROM public.invitations i
       WHERE i.role = 'contributor' AND i.status = 'pending' AND i.expires_at > now()
    )
  );
END;
$$;

-- Returns 'granted' when the person already has an account, or 'invited' when
-- they have not signed in yet (the role is applied automatically on first
-- sign-in, see handle_new_user below).
CREATE OR REPLACE FUNCTION public.admin_add_contributor(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  addr text := lower(btrim(coalesce(p_email, '')));
  target uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(addr) > 254 OR addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;

  -- Only a CONFIRMED address counts as an existing account. An unconfirmed row
  -- could belong to someone who typed the address without owning it.
  SELECT id INTO target FROM auth.users
   WHERE lower(email) = addr AND email_confirmed_at IS NOT NULL LIMIT 1;
  IF target IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (target, 'contributor') ON CONFLICT DO NOTHING;
    -- Close any open invite for the same address.
    UPDATE public.invitations SET status = 'accepted'
     WHERE lower(email) = addr AND role = 'contributor' AND status = 'pending';
    RETURN 'granted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitations
     WHERE lower(email) = addr AND role = 'contributor' AND status = 'pending' AND expires_at > now()
  ) THEN
    INSERT INTO public.invitations (email, role, invited_by, status, expires_at)
    VALUES (addr, 'contributor', auth.uid(), 'pending', now() + interval '90 days');
  END IF;
  RETURN 'invited';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_contributor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'contributor';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: the review inbox
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_review_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'flags', (
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT r.id AS review_id, r.question_id, q.paper_id, q.position, q.kind::text AS kind,
                 left(q.stem, 160) AS snippet, q.options,
                 q.correct AS current_correct, q.numerical_answer AS current_numerical,
                 r.suggested_correct, r.suggested_numerical, r.note, r.created_at, r.updated_at,
                 c.name AS course, coalesce(pr.full_name, '') AS reviewer_name, u.email AS reviewer_email
            FROM public.answer_reviews r
            JOIN public.questions q ON q.id = r.question_id
            JOIN public.papers p ON p.id = q.paper_id
            JOIN public.courses c ON c.id = p.course_id
            JOIN auth.users u ON u.id = r.reviewer_id
            LEFT JOIN public.profiles pr ON pr.user_id = r.reviewer_id
           WHERE r.verdict = 'incorrect' AND r.status = 'pending'
           ORDER BY r.created_at DESC
           LIMIT 100
        ) t
    ),
    'solutions', (
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT s.id, s.paper_id, s.question_id, q.position, s.storage_path, s.file_name, s.mime,
                 s.size_bytes, s.note, s.created_at, c.name AS course,
                 coalesce(pr.full_name, '') AS author_name, u.email AS author_email
            FROM public.paper_solutions s
            JOIN public.papers p ON p.id = s.paper_id
            JOIN public.courses c ON c.id = p.course_id
            LEFT JOIN public.questions q ON q.id = s.question_id
            JOIN auth.users u ON u.id = s.author_id
            LEFT JOIN public.profiles pr ON pr.user_id = s.author_id
           WHERE s.status = 'pending'
           ORDER BY s.created_at DESC
           LIMIT 100
        ) t
    ),
    'confirmed_correct', (SELECT count(*) FROM public.answer_reviews WHERE verdict = 'correct'),
    'accepted_flags', (SELECT count(*) FROM public.answer_reviews WHERE verdict = 'incorrect' AND status = 'accepted')
  );
END;
$$;

-- Accepting a flag applies the corrected key to the question. Attempts already
-- submitted are NOT re-graded; they keep the score they were given.
-- p_expected_updated_at is the `updated_at` the admin saw in the inbox. If the
-- contributor edited the review after that, the decision is refused, so an admin
-- can never apply a key they did not look at.
CREATE OR REPLACE FUNCTION public.admin_decide_review(
  p_review_id uuid,
  p_accept boolean,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.answer_reviews%ROWTYPE;
  q_kind text;
  q_options jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.answer_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This review was already decided' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND r.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'The reviewer changed this flag after you opened it. Reload and look again.' USING ERRCODE = '40001';
  END IF;

  IF p_accept AND r.verdict = 'incorrect' THEN
    -- Never write a key that does not fit the question.
    SELECT kind::text, options INTO q_kind, q_options FROM public.questions WHERE id = r.question_id;
    IF q_kind = 'numerical' THEN
      IF r.suggested_numerical IS NULL THEN
        RAISE EXCEPTION 'This question needs a numeric answer, but the flag does not give one' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF r.suggested_correct IS NULL THEN
        RAISE EXCEPTION 'This question needs option choices, but the flag does not give any' USING ERRCODE = '22023';
      END IF;
      IF q_kind <> 'multi' AND jsonb_array_length(r.suggested_correct) <> 1 THEN
        RAISE EXCEPTION 'This question has exactly one correct option' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(r.suggested_correct) e
         WHERE CASE
                 WHEN jsonb_typeof(e) <> 'number' THEN true
                 ELSE (e #>> '{}')::numeric <> floor((e #>> '{}')::numeric)
                   OR (e #>> '{}')::numeric < 0
                   OR (e #>> '{}')::numeric >= jsonb_array_length(q_options)
               END
      ) THEN
        RAISE EXCEPTION 'The suggested options do not match this question' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.questions
       SET correct = coalesce(r.suggested_correct, correct),
           numerical_answer = coalesce(r.suggested_numerical, numerical_answer)
     WHERE id = r.question_id;
  END IF;

  UPDATE public.answer_reviews
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_solution(p_id uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.paper_solutions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solution not found or already decided' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Function privileges
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_answer_key(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contributor_papers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_contributors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_contributor(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_contributor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_inbox() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_review(uuid, boolean, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_solution(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_answer_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contributor_papers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_contributors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_contributor(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_contributor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_review(uuid, boolean, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_solution(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sign-up: apply a pending contributor invitation, and fix the team list
-- ─────────────────────────────────────────────────────────────────────────────
-- Only the contributor role is ever granted from an invitation, and only once the
-- email address is CONFIRMED (Google sign-in confirms it on sign-up; a password
-- sign-up confirms it later, handled by the second trigger). That stops anyone
-- from claiming an invited address they do not own.
CREATE OR REPLACE FUNCTION public.apply_contributor_invite(p_user_id uuid, p_email text, p_confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_email IS NULL OR NOT p_confirmed THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invitations i
     WHERE lower(i.email) = lower(p_email) AND i.role = 'contributor'
       AND i.status = 'pending' AND i.expires_at > now()
  ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'contributor') ON CONFLICT DO NOTHING;
    UPDATE public.invitations SET status = 'accepted'
     WHERE lower(email) = lower(p_email) AND role = 'contributor' AND status = 'pending';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_contributor_invite(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- The Google profile name arrives as "name" as well as "full_name", so both are
-- used. It is cut to the column's 100-character limit so a long name can never
-- make a sign-up fail.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), 100));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  PERFORM public.apply_contributor_invite(NEW.id, NEW.email, NEW.email_confirmed_at IS NOT NULL);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_user_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.apply_contributor_invite(NEW.id, NEW.email, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_user_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- Practice-mode answer reveals: throttle so one account cannot dump a whole key
-- ─────────────────────────────────────────────────────────────────────────────
-- Question ids are public, and reveal_answer returns the key for one id, so
-- without a limit a signed-in user could walk every id. A student sitting a few
-- papers reveals far fewer than the cap; a scraper hits it quickly.
CREATE TABLE IF NOT EXISTS public.answer_reveals (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_answer_reveals_user_time ON public.answer_reveals(user_id, created_at);
ALTER TABLE public.answer_reveals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.answer_reveals FROM anon, authenticated;
GRANT ALL ON public.answer_reveals TO service_role;

CREATE OR REPLACE FUNCTION public.reveal_answer(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT jsonb_build_object('correct', q.correct, 'numerical_answer', q.numerical_answer)
    INTO result
    FROM public.questions q JOIN public.papers p ON p.id = q.paper_id
   WHERE q.id = p_question_id
     AND (p.published = true OR public.has_role(uid, 'admin'));
  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  -- Re-opening a question already revealed is free; only new questions count.
  IF NOT EXISTS (SELECT 1 FROM public.answer_reveals WHERE user_id = uid AND question_id = p_question_id)
     AND NOT public.has_role(uid, 'admin') THEN
    IF (SELECT count(*) FROM public.answer_reveals
         WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 150 THEN
      RAISE EXCEPTION 'You have viewed a lot of solutions this hour. Please try again later.' USING ERRCODE = '54000';
    END IF;
    INSERT INTO public.answer_reveals (user_id, question_id) VALUES (uid, p_question_id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.reveal_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_answer(uuid) TO authenticated;

-- One row per person, showing their highest role (it listed a person once per role).
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
           COALESCE(
             (array_agg(ur.role::text ORDER BY CASE ur.role::text
                WHEN 'admin' THEN 1 WHEN 'contributor' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END))[1],
             'user')
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
     GROUP BY p.user_id, p.full_name, p.job_title, p.avatar_url;
END;
$$;
