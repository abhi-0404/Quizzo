import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { QuizzoLoader } from "@/components/QuizzoLoader";

/**
 * Route guard.
 *
 * `requireAdmin` gates the /admin/* tree on the `admin` role in `user_roles`,
 * the same predicate the database policies enforce. Previously any signed-in
 * user could reach every admin page, and "admin" was a localStorage flag set by
 * a hardcoded credential that never created a Supabase session at all — which
 * also meant `auth.uid()` was null and admin-only RLS could never work.
 */
export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireReviewer = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  /** Contributor portal: a contributor or an admin may enter. */
  requireReviewer?: boolean;
}) {
  const { user, loading, isAdmin, isContributor, roleLoading } = useAuth();

  // Roles resolve a moment after the session does. Deciding before then would
  // bounce a real admin or contributor to the home page on every refresh.
  if (loading || ((requireAdmin || requireReviewer) && !!user && roleLoading)) {
    return <QuizzoLoader fullscreen />;
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  if (requireReviewer && !(isAdmin || isContributor)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
