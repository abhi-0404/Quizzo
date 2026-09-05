import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

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
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
