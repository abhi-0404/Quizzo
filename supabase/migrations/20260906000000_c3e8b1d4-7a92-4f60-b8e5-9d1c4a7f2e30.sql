-- Fix: signed-out students could not read papers, questions or figures.
--
-- Migration 20260731000000 gave these tables one SELECT policy covering both
-- roles:
--
--   USING (published = true OR public.has_role(auth.uid(), 'admin'))
--
-- but migration 20260719163038 had already revoked EXECUTE on has_role from
-- `anon` (deliberately — an anonymous caller has no business probing role
-- membership). Evaluating the policy as `anon` therefore raises
--
--   42501: permission denied for function has_role
--
-- and the request fails outright rather than returning the published rows. The
-- degree browser, course pages and the exam runner are all reachable signed
-- out, so this blocked the entire student read path.
--
-- The fix splits each policy in two, so the anonymous branch never mentions
-- has_role. The revoke from migration 9 stays in place.

-- papers ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Published papers are readable" ON public.papers;

CREATE POLICY "Anon reads published papers" ON public.papers
  FOR SELECT TO anon
  USING (published = true);

CREATE POLICY "Authenticated reads published or own-admin papers" ON public.papers
  FOR SELECT TO authenticated
  USING (published = true OR public.has_role(auth.uid(), 'admin'));

-- questions -------------------------------------------------------------------
DROP POLICY IF EXISTS "Questions of published papers are readable" ON public.questions;

CREATE POLICY "Anon reads questions of published papers" ON public.questions
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.papers p
    WHERE p.id = questions.paper_id AND p.published = true
  ));

CREATE POLICY "Authenticated reads questions of published or admin papers" ON public.questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.papers p
    WHERE p.id = questions.paper_id
      AND (p.published = true OR public.has_role(auth.uid(), 'admin'))
  ));

-- question_assets -------------------------------------------------------------
DROP POLICY IF EXISTS "Assets of published papers are readable" ON public.question_assets;

CREATE POLICY "Anon reads assets of published papers" ON public.question_assets
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.papers p ON p.id = q.paper_id
    WHERE q.id = question_assets.question_id AND p.published = true
  ));

CREATE POLICY "Authenticated reads assets of published or admin papers" ON public.question_assets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.papers p ON p.id = q.paper_id
    WHERE q.id = question_assets.question_id
      AND (p.published = true OR public.has_role(auth.uid(), 'admin'))
  ));
