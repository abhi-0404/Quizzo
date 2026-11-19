-- Course-heading abbreviations found in real TCS iON papers (the IIT M
-- improvement exam, 26 Oct 2025) that had no alias, so the importer could not
-- map them to a course. Safe to re-run.
INSERT INTO public.course_aliases (course_id, alias)
SELECT c.id, a.alias
FROM (VALUES
  ('introduction-to-deep-learning-and-generative-ai', 'dlgenai'),
  ('introduction-to-deep-learning-and-generative-ai', 'dl genai'),
  ('linear-statistical-models',                       'lsm')
) AS a(slug, alias)
JOIN public.courses c ON c.slug = a.slug
ON CONFLICT (alias) DO NOTHING;
