-- Extend the course catalog with courses confirmed against the official
-- programme page (https://study.iitm.ac.in/ds/academics.html) that the
-- original seed (20260731000100) did not have — mostly degree electives a
-- bulk sitting import runs into but had no existing course to match, so each
-- one used to fall back to an unconfirmed "+ create" during review.
--
-- Existing courses are left exactly as they are: same name, same slug. This
-- only adds rows for courses genuinely missing, so nothing already resolved
-- is duplicated under a second, differently-spelled row.
INSERT INTO public.courses (name, slug, level) VALUES
  -- Diploma
  ('Introduction to Deep Learning and Generative AI', 'introduction-to-deep-learning-and-generative-ai', 'diploma'),
  -- Degree
  ('Strategies for Professional Growth',          'strategies-for-professional-growth',          'degree'),
  ('Big Data and Biological Networks',            'big-data-and-biological-networks',            'degree'),
  ('Data Visualization Design',                   'data-visualization-design',                   'degree'),
  ('Speech Technology',                           'speech-technology',                           'degree'),
  ('Design Thinking for Data-Driven App Development', 'design-thinking-for-data-driven-app-development', 'degree'),
  ('Industry 4.0',                                'industry-40',                                 'degree'),
  ('Privacy & Security in Online Social Media',   'privacy-security-in-online-social-media',    'degree'),
  ('Introduction to Big Data',                    'introduction-to-big-data',                    'degree'),
  ('Financial Forensics',                         'financial-forensics',                         'degree'),
  ('Linear Statistical Models',                   'linear-statistical-models',                   'degree'),
  ('Mathematical Thinking',                       'mathematical-thinking',                       'degree'),
  ('Corporate Finance',                           'corporate-finance',                           'degree'),
  ('Algorithms for Data Science (ADS)',           'algorithms-for-data-science-ads',             'degree'),
  ('Machine Learning Operations (MLOps)',         'machine-learning-operations-mlops',           'degree'),
  ('Data Science and AI Lab',                     'data-science-and-ai-lab',                     'degree'),
  ('App Dev Lab',                                 'app-dev-lab',                                 'degree'),
  ('Computer Networks',                           'computer-networks',                           'degree'),
  ('Theory of Computation',                       'theory-of-computation',                       'degree'),
  ('Compiler Design',                             'compiler-design',                             'degree'),
  ('Discrete Mathematics',                        'discrete-mathematics',                        'degree'),
  ('Sequential Decision Making',                  'sequential-decision-making',                  'degree')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.course_aliases (course_id, alias)
SELECT id, lower(name) FROM public.courses
ON CONFLICT (alias) DO NOTHING;

-- Abbreviations seen in real papers. Two of these — ADS and SPG — were called
-- out by name in the original seed's own comment as ones it couldn't
-- confidently expand; now resolved.
INSERT INTO public.course_aliases (course_id, alias)
SELECT c.id, a.alias
FROM (VALUES
  ('algorithms-for-data-science-ads',              'ads'),
  ('strategies-for-professional-growth',           'spg'),
  ('privacy-security-in-online-social-media',      'psosm'),
  ('data-visualization-design',                    'dvd'),
  ('machine-learning-operations-mlops',            'mlops'),
  ('industry-40',                                  'industry 4.0')
) AS a(slug, alias)
JOIN public.courses c ON c.slug = a.slug
ON CONFLICT (alias) DO NOTHING;
