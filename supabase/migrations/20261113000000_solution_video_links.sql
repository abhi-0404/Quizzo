-- Video solutions as links.
--
-- Contributors can now attach a worked-solution VIDEO as an unlisted YouTube
-- link or a Google Drive link instead of uploading a file. Nothing is stored in
-- our bucket for these, so they cost no storage. The app normalises every link
-- to one of two canonical forms before saving; the database accepts only those:
--   https://www.youtube.com/watch?v=<11-char id>
--   https://drive.google.com/file/d/<id>/view
-- File solutions (PDF / image) are unchanged.
--
-- Safe to re-run.

ALTER TABLE public.paper_solutions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.paper_solutions ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.paper_solutions ALTER COLUMN mime DROP NOT NULL;
ALTER TABLE public.paper_solutions ALTER COLUMN size_bytes DROP NOT NULL;

ALTER TABLE public.paper_solutions DROP CONSTRAINT IF EXISTS paper_solutions_kind_check;
ALTER TABLE public.paper_solutions ADD CONSTRAINT paper_solutions_kind_check
  CHECK (kind IN ('file', 'video'));

ALTER TABLE public.paper_solutions DROP CONSTRAINT IF EXISTS paper_solutions_video_url_check;
ALTER TABLE public.paper_solutions ADD CONSTRAINT paper_solutions_video_url_check
  CHECK (
    video_url IS NULL
    OR video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    OR video_url ~ '^https://drive\.google\.com/file/d/[A-Za-z0-9_-]{10,100}/view$'
  );

-- A row is exactly one of the two shapes.
ALTER TABLE public.paper_solutions DROP CONSTRAINT IF EXISTS paper_solutions_shape_check;
ALTER TABLE public.paper_solutions ADD CONSTRAINT paper_solutions_shape_check
  CHECK (
    (kind = 'file' AND storage_path IS NOT NULL AND mime IS NOT NULL AND size_bytes IS NOT NULL AND video_url IS NULL)
    OR
    (kind = 'video' AND video_url IS NOT NULL AND storage_path IS NULL AND mime IS NULL AND size_bytes IS NULL)
  );

-- The original column checks reject NULL-free values only, so they still hold
-- for files; NULL passes a CHECK, which is what video rows need.

-- Insert policy: a file row must point into the uploader's own folder; a video
-- row has no storage object at all.
DROP POLICY IF EXISTS "Reviewers submit solutions" ON public.paper_solutions;
CREATE POLICY "Reviewers submit solutions" ON public.paper_solutions
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_reviewer(auth.uid())
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND created_at <= now()
    AND (
      (kind = 'file' AND storage_path LIKE paper_id::text || '/' || auth.uid()::text || '/%')
      OR (kind = 'video' AND storage_path IS NULL AND video_url IS NOT NULL)
    )
    AND EXISTS (SELECT 1 FROM public.papers p WHERE p.id = paper_solutions.paper_id AND p.published)
    AND (
      question_id IS NULL
      OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = paper_solutions.question_id AND q.paper_id = paper_solutions.paper_id)
    )
  );

-- The admin inbox now also returns kind and video_url.
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
          SELECT s.id, s.paper_id, s.question_id, q.position, s.kind, s.video_url,
                 s.storage_path, s.file_name, s.mime, s.size_bytes, s.note, s.created_at,
                 c.name AS course, coalesce(pr.full_name, '') AS author_name, u.email AS author_email
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
