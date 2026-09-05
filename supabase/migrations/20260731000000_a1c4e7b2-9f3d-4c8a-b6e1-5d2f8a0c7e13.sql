-- PYQ pipeline: course catalog, exam sittings, papers, questions, figures and
-- student attempts.
--
-- Shape notes (measured against 9 real TCS iON papers, see plan/pyq-pipeline.md):
--   * A paper is identified by (sitting, course, programme, content hash).
--     Programme is in the key because cohorts genuinely sat DIFFERENT papers for
--     the same course on the same date -- Degree vs Diploma "AI" share only 29
--     questions. Deduping across cohorts would destroy real papers.
--   * The content hash makes re-importing another exam code of the SAME cohort
--     idempotent: identical content appends to source_codes instead of inserting.

-- Enums -----------------------------------------------------------------------
CREATE TYPE public.course_level   AS ENUM ('foundation', 'diploma', 'degree');
CREATE TYPE public.exam_type      AS ENUM ('quiz_1', 'quiz_2', 'end_term');
CREATE TYPE public.exam_programme AS ENUM ('foundation', 'diploma', 'degree', 'improvement');
CREATE TYPE public.exam_slot      AS ENUM ('fn', 'an');
CREATE TYPE public.question_kind  AS ENUM ('single', 'multi', 'numerical', 'comprehension');
CREATE TYPE public.attempt_mode   AS ENUM ('exam', 'practice');
CREATE TYPE public.answer_status  AS ENUM ('correct', 'incorrect', 'skipped');

-- Course catalog --------------------------------------------------------------
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  level public.course_level NOT NULL DEFAULT 'foundation',
  -- False for courses auto-created during an import, so an admin can find and
  -- correct their name and level afterwards.
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PDFs title courses inconsistently: "MLF", "PDSA", and the same course appears
-- both as "Maths2" and "Sem2 Maths2". Aliases are stored already normalised
-- (lowercased, leading "sem<n> " stripped) so lookup is a plain equality test.
CREATE TABLE public.course_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exam sittings and papers ----------------------------------------------------
CREATE TABLE public.sittings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_date date NOT NULL,
  exam_type public.exam_type NOT NULL,
  term text NOT NULL DEFAULT '',
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_date, exam_type)
);

CREATE TABLE public.papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitting_id uuid NOT NULL REFERENCES public.sittings(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  programme public.exam_programme NOT NULL,
  slot public.exam_slot NOT NULL DEFAULT 'fn',
  -- Business rule, not a PDF field: quizzes run 60 minutes, end terms 90.
  duration_minutes integer NOT NULL DEFAULT 60,
  -- Every exam code whose extraction produced this exact content.
  source_codes text[] NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  variant_label text NOT NULL DEFAULT '',
  total_marks integer NOT NULL DEFAULT 0,
  question_count integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitting_id, course_id, programme, content_hash)
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind public.question_kind NOT NULL,
  marks numeric NOT NULL DEFAULT 0,
  stem text NOT NULL DEFAULT '',
  passage text NOT NULL DEFAULT '',
  -- Mirrors the app's in-memory model (src/data/questions.ts) rather than
  -- normalising options into their own table: a paper is always read whole, so
  -- the nested shape avoids an assembly step on every read.
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct jsonb NOT NULL DEFAULT '[]'::jsonb,
  numerical_answer text NOT NULL DEFAULT '',
  sub_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The Question Id printed in the source PDF, for tracing a row back.
  source_question_id text NOT NULL DEFAULT '',
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_id, position)
);

CREATE TABLE public.question_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  -- The id the question text references as an asset-<key> image URL.
  asset_key text NOT NULL,
  storage_path text NOT NULL,
  alt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, asset_key)
);

-- Attempts --------------------------------------------------------------------
CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  mode public.attempt_mode NOT NULL DEFAULT 'exam',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  total_marks integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  response jsonb,
  status public.answer_status NOT NULL DEFAULT 'skipped',
  marks_awarded numeric NOT NULL DEFAULT 0,
  time_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

-- Indexes ---------------------------------------------------------------------
CREATE INDEX idx_course_aliases_course_id    ON public.course_aliases(course_id);
CREATE INDEX idx_course_aliases_alias        ON public.course_aliases(alias);
CREATE INDEX idx_courses_level               ON public.courses(level);
CREATE INDEX idx_papers_sitting_id           ON public.papers(sitting_id);
CREATE INDEX idx_papers_course_id            ON public.papers(course_id);
CREATE INDEX idx_papers_published            ON public.papers(published);
CREATE INDEX idx_questions_paper_id          ON public.questions(paper_id);
CREATE INDEX idx_question_assets_question_id ON public.question_assets(question_id);
CREATE INDEX idx_attempts_user_id            ON public.attempts(user_id);
CREATE INDEX idx_attempts_paper_id           ON public.attempts(paper_id);
CREATE INDEX idx_attempt_answers_attempt_id  ON public.attempt_answers(attempt_id);
CREATE INDEX idx_attempt_answers_question_id ON public.attempt_answers(question_id);

-- updated_at triggers (the function already exists) ----------------------------
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sittings_updated_at BEFORE UPDATE ON public.sittings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_papers_updated_at BEFORE UPDATE ON public.papers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attempts_updated_at BEFORE UPDATE ON public.attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row level security ----------------------------------------------------------
ALTER TABLE public.courses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sittings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

-- The degree browser, course pages and the exam runner are reachable without
-- signing in, so catalog reads must include anon.
CREATE POLICY "Courses are publicly readable" ON public.courses
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Course aliases are publicly readable" ON public.course_aliases
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage course aliases" ON public.course_aliases
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sittings are publicly readable" ON public.sittings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage sittings" ON public.sittings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- An admin has to read back rows it has just inserted but not yet published, so
-- a bare published = true would break the review-then-publish flow.
CREATE POLICY "Published papers are readable" ON public.papers
  FOR SELECT TO anon, authenticated
  USING (published = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage papers" ON public.papers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Questions of published papers are readable" ON public.questions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.papers p
    WHERE p.id = questions.paper_id
      AND (p.published = true OR public.has_role(auth.uid(), 'admin'))
  ));
CREATE POLICY "Admins can manage questions" ON public.questions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Assets of published papers are readable" ON public.question_assets
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.papers p ON p.id = q.paper_id
    WHERE q.id = question_assets.question_id
      AND (p.published = true OR public.has_role(auth.uid(), 'admin'))
  ));
CREATE POLICY "Admins can manage question assets" ON public.question_assets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own attempts" ON public.attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own attempts" ON public.attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own attempts" ON public.attempts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own attempts" ON public.attempts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users read own attempt answers" ON public.attempt_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a
                 WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid()));
CREATE POLICY "Users write own attempt answers" ON public.attempt_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts a
                      WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid()));
CREATE POLICY "Users update own attempt answers" ON public.attempt_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a
                 WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid()));

-- Grants (RLS alone is not enough for the Data API) ----------------------------
GRANT SELECT ON public.courses         TO anon;
GRANT SELECT ON public.course_aliases  TO anon;
GRANT SELECT ON public.sittings        TO anon;
GRANT SELECT ON public.papers          TO anon;
GRANT SELECT ON public.questions       TO anon;
GRANT SELECT ON public.question_assets TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_aliases  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittings        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.papers          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempts        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempt_answers TO authenticated;

GRANT ALL ON public.courses         TO service_role;
GRANT ALL ON public.course_aliases  TO service_role;
GRANT ALL ON public.sittings        TO service_role;
GRANT ALL ON public.papers          TO service_role;
GRANT ALL ON public.questions       TO service_role;
GRANT ALL ON public.question_assets TO service_role;
GRANT ALL ON public.attempts        TO service_role;
GRANT ALL ON public.attempt_answers TO service_role;

-- Figure storage --------------------------------------------------------------
-- Public read: figures belong to papers published for study, and a storage path
-- is not a secret, so an unpublished paper's figures are reachable by anyone who
-- guesses one. Accepted deliberately; set public = false if that changes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-figures', 'question-figures', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Question figures are publicly readable" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'question-figures');
CREATE POLICY "Admins can upload question figures" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-figures' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update question figures" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'question-figures' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete question figures" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'question-figures' AND public.has_role(auth.uid(), 'admin'));
