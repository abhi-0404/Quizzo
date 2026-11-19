import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Moon,
  Sun,
  FileText,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { StackedLogo } from "@/components/StackedLogo";
import { NavAuthArea } from "@/components/NavAuthArea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { examTypeLabel, listAttempts } from "@/lib/pyq-read";
import { formatDate } from "@/data/schedule";
import { cn } from "@/lib/utils";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";

  const letters =
    (parts[0][0] ?? "") +
    (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "");

  return letters.toUpperCase() || "?";
}

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();

  const { data: attempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ["attempts", user?.id],
    queryFn: () => listAttempts(user!.id),
    enabled: !!user,
  });

  /* ───────────────── Profile State ───────────────── */

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [academicTrack, setAcademicTrack] = useState(profile?.academic_track ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [initialFullName, setInitialFullName] = useState(profile?.full_name ?? "");
  const [initialAcademicTrack, setInitialAcademicTrack] = useState(profile?.academic_track ?? "");

  /* ───────────────── Tab State ───────────────── */

  const [activeTab, setActiveTab] = useState<
    "account" | "history"
  >("account");

  /* ───────────────── Authentication Redirect ───────────────── */

  // Wait for the session to resolve: on a refresh `user` is null for a moment,
  // and redirecting then would bounce every signed-in student to the home page.
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  /* ───────────────── Sync Profile ───────────────── */

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setInitialFullName(profile.full_name ?? "");
      setAcademicTrack(profile.academic_track ?? "");
      setInitialAcademicTrack(profile.academic_track ?? "");
    }
  }, [profile]);

  /* ───────────────── Derived Values ───────────────── */

  const email = user?.email ?? "";

  const initials = useMemo(
    () => initialsFrom(fullName),
    [fullName]
  );

  const hasProfileChanges =
    fullName !== initialFullName ||
    academicTrack !== initialAcademicTrack;

  /* ───────────────── Save Profile ───────────────── */

  const handleSaveProfile = async () => {
    if (!user || !hasProfileChanges) return;

    setSavingProfile(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          academic_track: academicTrack || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();

      setInitialFullName(fullName);
      setInitialAcademicTrack(academicTrack);

      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(
        (err instanceof Error ? err.message : undefined) ?? "Could not update profile"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  /* ───────────────── Logout ───────────────── */

  const handleLogout = async () => {
    try {
      if (user) {
        await signOut();
      }

      toast.success("Logged out");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(
        (err instanceof Error ? err.message : undefined) ?? "Could not log out"
      );
    }
  };

  /* ───────────────── Shared Styles ───────────────── */

  const inputClass =
    "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors";

  const labelClass =
    "block text-xs font-medium text-muted-foreground mb-1.5";

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ═══════════════════════════════════════════════════════
          TOP NAVIGATION
      ═══════════════════════════════════════════════════════ */}

      <nav className="fixed top-0 z-50 w-full bg-background border-b border-border px-6">

        <div className="mx-auto flex h-[56px] max-w-[1200px] items-center justify-between">

          {/* Quizzo Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 -ml-0.5"
          >
            <StackedLogo size={16} />

            <span className="text-[14px] font-bold tracking-[0.08em] uppercase">
              QUIZZO
            </span>
          </Link>

          <div className="flex items-center gap-2">

            {/* Theme Toggle */}
            <button
              onClick={() =>
                setTheme(
                  theme === "dark"
                    ? "light"
                    : "dark"
                )
              }
              className="relative h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />

              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </button>

            <NavAuthArea />

          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════ */}

      <section className="pt-[104px] pb-24 px-6">

        <div className="mx-auto max-w-5xl">

          {/* ═══════════════════════════════════════════════════════
              BREADCRUMB
          ═══════════════════════════════════════════════════════ */}

          <div className="flex items-center gap-2 text-[13px] mb-12">

            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </Link>

            <span className="text-muted-foreground/50">
              /
            </span>

            <span className="font-medium text-foreground">
              Profile
            </span>

          </div>

          {/* ═══════════════════════════════════════════════════════
              PAGE HEADER
          ═══════════════════════════════════════════════════════ */}

          <div className="mb-8">

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Profile
            </h1>

            <p className="mt-1.5 text-sm text-muted-foreground">
              Manage your account and view your practice history.
            </p>

          </div>

          {/* ═══════════════════════════════════════════════════════
              TABS
          ═══════════════════════════════════════════════════════ */}

          <div className="border-b border-border mb-6">

            <div className="flex items-center gap-6">

              <button
                type="button"
                onClick={() => setActiveTab("account")}
                className={cn(
                  "relative pb-3 text-sm font-medium transition-colors",
                  activeTab === "account"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Account Settings

                {activeTab === "account" && (
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-primary" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "relative pb-3 text-sm font-medium transition-colors",
                  activeTab === "history"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Practice History

                {activeTab === "history" && (
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-primary" />
                )}
              </button>

            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              ACCOUNT SETTINGS TAB
          ═══════════════════════════════════════════════════════ */}

          {activeTab === "account" && (
            <div className="space-y-6">

              {/* ───────── Profile Information Card ───────── */}

              <section className="rounded-lg border border-border bg-transparent p-6">

                <div className="mb-7">

                  <h2 className="text-base font-semibold text-foreground">
                    Profile Information
                  </h2>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Manage your basic profile information.
                  </p>

                </div>

                {/* Avatar + Account */}
                <div className="flex items-center gap-4 mb-8">

                  <div className="h-14 w-14 shrink-0 rounded-full bg-primary flex items-center justify-center text-lg font-semibold text-primary-foreground">
                    {initials}
                  </div>

                  <div className="min-w-0">

                    <p className="text-base font-semibold text-foreground truncate">
                      {fullName}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1">

                      <p className="text-sm text-muted-foreground truncate">
                        {email}
                      </p>

                      

                    </div>

                  </div>

                </div>

                {/* Profile Form */}
                <div className="max-w-2xl space-y-5">

                  {/* Full Name */}
                  <div>

                    <label
                      htmlFor="full-name"
                      className={labelClass}
                    >
                      Full Name
                    </label>

                    <input
                      id="full-name"
                      value={fullName}
                      onChange={(e) =>
                        setFullName(e.target.value)
                      }
                      placeholder="Your full name"
                      className={inputClass}
                    />

                  </div>

                  {/* Academic Track */}
                  <div>

                    <label
                      htmlFor="academic-track"
                      className={labelClass}
                    >
                      Academic Track
                    </label>

                    <div className="relative">

                      <select
                        id="academic-track"
                        value={academicTrack}
                        onChange={(e) =>
                          setAcademicTrack(e.target.value)
                        }
                        className={cn(
                          inputClass,
                          "appearance-none pr-9 cursor-pointer"
                        )}
                      >

                        <option value="">Select your programme</option>

                        <option>
                          BS in Data Science and Applications
                        </option>

                        <option>
                          BS in Electronic Systems
                        </option>

                        <option>
                          BS in Management and Data Science
                        </option>

                        <option>
                          BS in Aeronautics and Space Technology
                        </option>

                      </select>

                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                      />

                    </div>

                  </div>

                </div>

                {/* Save */}
                <div className="flex justify-end max-w-2xl mt-6">

                  <button
                    onClick={handleSaveProfile}
                    disabled={
                      !hasProfileChanges ||
                      savingProfile
                    }
                    className={cn(
                      "rounded-md border text-sm font-medium px-4 py-2 transition-colors",
                      hasProfileChanges
                        ? "border-input bg-transparent text-foreground hover:bg-secondary"
                        : "border-border bg-secondary text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    {savingProfile
                      ? "Saving…"
                      : "Save"}
                  </button>

                </div>

              </section>

              {/* ───────── Session Card ───────── */}

              <section className="rounded-lg border border-border bg-transparent p-6">

                <div className="mb-5">

                  <h2 className="text-base font-semibold text-foreground">
                    Session
                  </h2>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Manage your current Quizzo session.
                  </p>

                </div>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 text-sm font-medium px-4 py-2 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>

              </section>

            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              PRACTICE HISTORY TAB
          ═══════════════════════════════════════════════════════ */}

          {activeTab === "history" && (
            <section className="rounded-lg border border-border bg-transparent p-6">

              {/* History Header */}
              <div className="mb-7">

                <h2 className="text-base font-semibold text-foreground">
                  Practice History
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Review your previous PYQ practice attempts and results.
                </p>

              </div>

              {/* Loading */}
              {attemptsLoading && (
                <div className="py-12 text-center">

                  <p className="text-sm text-muted-foreground">
                    Loading your history…
                  </p>

                </div>
              )}

              {/* Empty State */}
              {!attemptsLoading && attempts.length === 0 && (
                <div className="py-12 text-center">

                  <p className="text-sm text-muted-foreground opacity-80">
                    No attempts yet — sit a paper and it will show up here.
                  </p>

                  <Link
                    to="/"
                    className="inline-flex items-center justify-center mt-5 rounded-md border border-input bg-transparent hover:bg-secondary text-foreground text-sm font-medium px-5 py-2.5 transition-colors"
                  >
                    Browse Papers
                  </Link>

                </div>
              )}

              {/* History Table */}
              {!attemptsLoading && attempts.length > 0 && (
                <div className="overflow-x-auto">

                  <table className="w-full text-left">

                    {/* Table Header */}
                    <thead>

                      <tr className="border-b border-border">

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Course
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Exam Type
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Date
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground text-right">
                          Score
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground text-right">
                          Action
                        </th>

                      </tr>

                    </thead>

                    {/* Table Body */}
                    <tbody>

                      {attempts.map((attempt) => (
                        <tr
                          key={attempt.id}
                          className="border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors"
                        >

                          {/* Course */}
                          <td className="px-4 py-4">

                            <p className="text-sm font-medium text-foreground">
                              {attempt.courseName}
                            </p>

                          </td>

                          {/* Exam Type */}
                          <td className="px-4 py-4">

                            <span className="text-sm text-muted-foreground">
                              {examTypeLabel(
                                attempt.examType
                              )}
                            </span>

                          </td>

                          {/* Date */}
                          <td className="px-4 py-4">

                            <span className="text-sm text-muted-foreground">
                              {formatDate(
                                attempt.examDate
                              )}
                            </span>

                          </td>

                          {/* Score */}
                          <td className="px-4 py-4 text-right">

                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {attempt.score}/
                              {attempt.totalMarks}
                            </span>

                          </td>

                          {/* Action */}
                          <td className="px-4 py-4 text-right">

                            <Link
                              to={`/data-science-and-applications/${attempt.courseSlug}/report?attempt=${attempt.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent hover:bg-secondary text-foreground text-xs font-medium px-3 py-1.5 transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              View Report
                            </Link>

                          </td>

                        </tr>
                      ))}

                    </tbody>

                  </table>

                </div>
              )}

            </section>
          )}

        </div>
      </section>
    </div>
  );
}