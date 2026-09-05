-- Seed the course catalog and the aliases that map TCS iON section headings onto
-- it.
--
-- Headings in the source PDFs are inconsistent abbreviations: "MLF", "PDSA",
-- "Sw Engg", and the same course appears both as "Maths2" and "Sem2 Maths2".
-- Aliases are stored already normalised -- lowercased, with a leading "sem<n> "
-- stripped -- so the importer's lookup is a plain equality test.
--
-- Courses whose heading could not be confidently expanded (for example "ADS",
-- "SPG") are deliberately absent: the importer creates those on first sight with
-- confirmed = false, and an admin names and levels them during review.

INSERT INTO public.courses (name, slug, level) VALUES
  -- Foundation
  ('English I',                                  'english-i',                                  'foundation'),
  ('English II',                                 'english-ii',                                 'foundation'),
  ('Mathematics I',                              'mathematics-i',                              'foundation'),
  ('Mathematics II',                             'mathematics-ii',                             'foundation'),
  ('Statistics I',                               'statistics-i',                               'foundation'),
  ('Statistics II',                              'statistics-ii',                              'foundation'),
  ('Computational Thinking',                     'computational-thinking',                     'foundation'),
  ('Programming in Python',                      'programming-in-python',                      'foundation'),
  -- Diploma
  ('Database Management Systems',                'database-management-systems',                'diploma'),
  ('Programming in Java',                        'programming-in-java',                        'diploma'),
  ('Data Structures and Algorithms',             'data-structures-and-algorithms',             'diploma'),
  ('Modern Application Development I',           'modern-application-development-i',           'diploma'),
  ('Modern Application Development II',          'modern-application-development-ii',          'diploma'),
  ('Mathematical Methods for Data Science',      'mathematical-methods-for-data-science',      'diploma'),
  ('Machine Learning Foundations',               'machine-learning-foundations',               'diploma'),
  ('Machine Learning Techniques',                'machine-learning-techniques',                'diploma'),
  ('Machine Learning Practice',                  'machine-learning-practice',                  'diploma'),
  ('Business Data Management',                   'business-data-management',                   'diploma'),
  ('Business Analytics',                         'business-analytics',                         'diploma'),
  ('Tools in Data Science',                      'tools-in-data-science',                      'diploma'),
  ('System Commands',                            'system-commands',                            'diploma'),
  -- Degree
  ('Software Engineering',                       'software-engineering',                       'degree'),
  ('Software Testing',                           'software-testing',                           'degree'),
  ('Operating Systems',                          'operating-systems',                          'degree'),
  ('Computer Systems Architecture',              'computer-systems-architecture',              'degree'),
  ('Computer System Design',                     'computer-system-design',                     'degree'),
  ('Artificial Intelligence',                    'artificial-intelligence',                    'degree'),
  ('Deep Learning',                              'deep-learning',                              'degree'),
  ('Deep Learning Practice',                     'deep-learning-practice',                     'degree'),
  ('Deep Learning for Computer Vision',          'deep-learning-for-computer-vision',          'degree'),
  ('Large Language Models',                      'large-language-models',                      'degree'),
  ('Big Data Analytics',                         'big-data-analytics',                         'degree'),
  ('Natural Language Processing',                'natural-language-processing',                'degree'),
  ('Reinforcement Learning',                     'reinforcement-learning',                     'degree'),
  ('Programming in C',                           'programming-in-c',                           'degree'),
  ('Statistical Computing',                      'statistical-computing',                      'degree'),
  ('Advanced Algorithms',                        'advanced-algorithms',                        'degree'),
  ('Game Theory and Strategy',                   'game-theory-and-strategy',                   'degree'),
  ('Managerial Economics',                       'managerial-economics',                       'degree'),
  ('Market Research',                            'market-research',                            'degree'),
  ('Mathematical Foundations of Generative AI',  'mathematical-foundations-of-generative-ai',  'degree'),
  ('Algorithmic Thinking in Bioinformatics',     'algorithmic-thinking-in-bioinformatics',     'degree')
ON CONFLICT (slug) DO NOTHING;

-- Every course matches its own name, so a PDF that spells a course out in full
-- resolves without a hand-written alias.
INSERT INTO public.course_aliases (course_id, alias)
SELECT id, lower(name) FROM public.courses
ON CONFLICT (alias) DO NOTHING;

-- Abbreviations observed in real papers.
INSERT INTO public.course_aliases (course_id, alias)
SELECT c.id, a.alias
FROM (VALUES
  ('english-i',                                 'english1'),
  ('english-ii',                                'english2'),
  ('mathematics-i',                             'maths1'),
  ('mathematics-ii',                            'maths2'),
  ('statistics-i',                              'statistics1'),
  ('statistics-ii',                             'statistics2'),
  ('computational-thinking',                    'ct'),
  ('programming-in-python',                     'intro to python'),
  ('programming-in-python',                     'python'),
  ('database-management-systems',               'dbms'),
  ('programming-in-java',                       'java'),
  ('data-structures-and-algorithms',            'pdsa'),
  ('modern-application-development-i',          'appdev1'),
  ('modern-application-development-ii',         'appdev2'),
  ('mathematical-methods-for-data-science',     'mmds'),
  ('machine-learning-foundations',              'mlf'),
  ('machine-learning-techniques',               'mlt'),
  ('machine-learning-practice',                 'mlp'),
  ('business-data-management',                  'bdm'),
  ('tools-in-data-science',                     'tds'),
  ('system-commands',                           'system commands'),
  ('software-engineering',                      'sw engg'),
  ('software-testing',                          'sw testing'),
  ('operating-systems',                         'os'),
  ('artificial-intelligence',                   'ai'),
  ('deep-learning-practice',                    'dlp'),
  ('deep-learning-for-computer-vision',         'dl(cv)'),
  ('large-language-models',                     'llm'),
  ('big-data-analytics',                        'bda'),
  ('natural-language-processing',               'nlp'),
  ('reinforcement-learning',                    'rl'),
  ('algorithmic-thinking-in-bioinformatics',    'algorithmic thinking in bio')
) AS a(slug, alias)
JOIN public.courses c ON c.slug = a.slug
ON CONFLICT (alias) DO NOTHING;
