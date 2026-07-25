-- Remove anonymous execute access on SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.has_role FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_members FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user FROM anon;

-- Prevent direct calls to the auth trigger helper by authenticated users.
REVOKE EXECUTE ON FUNCTION public.handle_new_user FROM authenticated;

-- Keep get_team_members and has_role executable by authenticated users (required for Team tab and RLS policies).
GRANT EXECUTE ON FUNCTION public.get_team_members TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;