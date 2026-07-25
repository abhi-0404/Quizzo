-- 1. Add explicit admin-only view rule for user_roles.
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Grant Data API access to public tables so the existing policies can be enforced.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bugs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.bugs TO service_role;
GRANT ALL ON public.comments TO service_role;
GRANT ALL ON public.activity_log TO service_role;
GRANT ALL ON public.attachments TO service_role;
GRANT ALL ON public.company_settings TO service_role;
GRANT ALL ON public.invitations TO service_role;
GRANT ALL ON public.notification_preferences TO service_role;

-- 3. Restrict SECURITY DEFINER functions so they are not publicly callable.
REVOKE EXECUTE ON FUNCTION public.has_role FROM public;
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_team_members FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_members TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user FROM public;