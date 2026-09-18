import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ArrowRight, ShieldCheck, BookOpen, BarChart2, Trophy } from "lucide-react";
import { StackedLogo } from "@/components/StackedLogo";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Auth() {
  const { user, loading, isAdmin, roleLoading } = useAuth();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (loading || (user && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) return <Navigate to={isAdmin ? "/admin/overview" : "/"} replace />;

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: "Google sign-in failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

return (
  <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-[360px] border border-border bg-card rounded-md overflow-hidden">

      {/* ───────── Brand ───────── */}
      <div className="flex flex-col items-center pt-10 pb-3">
        <Link
          to="/"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <StackedLogo size={34} />
          <span className="text-[26px] font-bold tracking-[0.08em] uppercase text-foreground">
            QUIZZO
          </span>
        </Link>

        <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.22em] leading-relaxed text-muted-foreground/65 text-center">
          Practice Past Papers.
          <br />
          Track Your Progress.
        </p>
      </div>

      {/* ───────── Content ───────── */}
      <div className="px-8 pt-7 pb-8 text-center">
        <h1 className="text-[36px] font-light leading-none tracking-[-0.04em] text-foreground">
          Welcome Back!
        </h1>

        <p className="mt-5 text-[13px] leading-6 text-muted-foreground">
          Sign in with your Google account to continue your learning journey with Quizzo.
        </p>
      </div>

      {/* ───────── CTA ───────── */}
      <div className="px-8 pb-10">
        <button
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className={cn(
            "w-full h-11 rounded-md border border-foreground",
            "bg-foreground text-background",
            "flex items-center justify-center gap-3",
            "text-[14px] font-medium",
            "hover:opacity-90 active:opacity-80",
            "transition-all duration-200",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          {isGoogleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : (
            <svg
              style={{ width: 18, height: 18, flexShrink: 0 }}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}

          <span>
            {isGoogleLoading ? "Signing in..." : "Continue with Google"}
          </span>
        </button>
      </div>

      {/* ───────── Footer ───────── */}
      <div className="border-t border-border px-8 py-6 flex items-center justify-between">
        <Link
          to="/"
          className="text-[12px] font-medium text-foreground hover:underline underline-offset-4 transition-all"
        >
          ← Back to home
        </Link>

        <span className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} QUIZZO
        </span>
      </div>

    </div>
  </div>
);
}