-- The "contributor" role: a trusted reviewer who checks answer keys and submits
-- worked solutions. Kept in its own file because a new enum value cannot be
-- used in the same transaction that adds it; the next migration uses it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contributor';
