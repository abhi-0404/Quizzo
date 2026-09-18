-- Add a scalar exam_code to papers.
--
-- `source_codes` already tracks every exam code whose extraction produced a
-- paper's exact content (plural, because duplicate codes of the same cohort
-- collapse into one paper). `exam_code` is different: it is the single code
-- an admin actually cares to see and search by — the first code seen for a
-- bulk-imported paper, or one typed by hand when authoring a paper with no
-- source PDF at all. Both flows had this value in the UI already; neither
-- persisted it.
ALTER TABLE public.papers
  ADD COLUMN exam_code text NOT NULL DEFAULT '';
