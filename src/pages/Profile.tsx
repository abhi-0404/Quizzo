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

  if (parts.length === 0) return "AK";

  const letters =
    (parts[0][0] ?? "") +
    (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "");

  return letters.toUpperCase() || "AK";
}

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const { data: attempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ["attempts", user?.id],
    queryFn: () => listAttempts(user!.id),
    enabled: !!user,
  });

  /* ───────────────── Profile State ───────────────── */

  const [fullName, setFullName] = useState(
    profile?.full_name || "Abhishek Kumar"
  );

  const [academicTrack, setAcademicTrack] = useState(
    "BS in Data Science and Applications"
  );

  const [savingProfile, setSavingProfile] = useState(false);

  const [initialFullName, setInitialFullName] = useState(
    profile?.full_name || "Abhishek Kumar"
  );

  const initialAcademicTrack =
    "BS in Data Science and Applications";

  /* ───────────────── Tab State ───────────────── */

  const [activeTab, setActiveTab] = useState<
    "account" | "history"
  >("account");

  /* ───────────────── Authentication Redirect ───────────────── */

  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  /* ───────────────── Sync Profile ───────────────── */

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
      setInitialFullName(profile.full_name);
    }
  }, [profile?.full_name]);

  /* ───────────────── Derived Values ───────────────── */

  const email = user?.email || "abhishek@example.com";

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
          full_name: fullName,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();

      setInitialFullName(fullName);

      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(
        err?.message ?? "Could not update profile"
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
    } catch (err: any) {
      toast.error(
        err?.message ?? "Could not log out"
      );
    }
  };

  /* ───────────────── Shared Styles ───────────────── */

  const inputClass =
    "w-full h-9 rounded-md border border-gray-300 dark:border-gray-800 bg-white dark:bg-[#16161D] px-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors";

  const labelClass =
    "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0B0F] text-gray-900 dark:text-white">

      {/* ═══════════════════════════════════════════════════════
          TOP NAVIGATION
      ═══════════════════════════════════════════════════════ */}

      <nav className="fixed top-0 z-50 w-full bg-white dark:bg-[#0B0B0F] border-b border-gray-200 dark:border-gray-800 px-6">

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
              className="relative h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
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
              className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              Home
            </Link>

            <span className="text-gray-300 dark:text-gray-700">
              /
            </span>

            <span className="font-medium text-gray-900 dark:text-white">
              Profile
            </span>

          </div>

          {/* ═══════════════════════════════════════════════════════
              PAGE HEADER
          ═══════════════════════════════════════════════════════ */}

          <div className="mb-8">

            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
              Profile
            </h1>

            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              Manage your account and view your practice history.
            </p>

          </div>

          {/* ═══════════════════════════════════════════════════════
              TABS
          ═══════════════════════════════════════════════════════ */}

          <div className="border-b border-gray-200 dark:border-gray-800 mb-6">

            <div className="flex items-center gap-6">

              <button
                type="button"
                onClick={() => setActiveTab("account")}
                className={cn(
                  "relative pb-3 text-sm font-medium transition-colors",
                  activeTab === "account"
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                Account Settings

                {activeTab === "account" && (
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-gray-900 dark:bg-white" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "relative pb-3 text-sm font-medium transition-colors",
                  activeTab === "history"
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                Practice History

                {activeTab === "history" && (
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-gray-900 dark:bg-white" />
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

              <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-6">

                <div className="mb-7">

                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Profile Information
                  </h2>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Manage your basic profile information.
                  </p>

                </div>

                {/* Avatar + Account */}
                <div className="flex items-center gap-4 mb-8">

                  <div className="h-14 w-14 shrink-0 rounded-full bg-gray-700 flex items-center justify-center text-lg font-semibold text-white">
                    {initials}
                  </div>

                  <div className="min-w-0">

                    <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                      {fullName}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1">

                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
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
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
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
                        ? "border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#16161D]"
                        : "border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#18181D] text-gray-400 dark:text-gray-600 cursor-not-allowed"
                    )}
                  >
                    {savingProfile
                      ? "Saving…"
                      : "Save"}
                  </button>

                </div>

              </section>

              {/* ───────── Session Card ───────── */}

              <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-6">

                <div className="mb-5">

                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Session
                  </h2>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Manage your current Quizzo session.
                  </p>

                </div>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-[#2A1111] text-sm font-medium px-4 py-2 transition-colors"
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
            <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-6">

              {/* History Header */}
              <div className="mb-7">

                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Practice History
                </h2>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Review your previous PYQ practice attempts and results.
                </p>

              </div>

              {/* Loading */}
              {attemptsLoading && (
                <div className="py-12 text-center">

                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Loading your history…
                  </p>

                </div>
              )}

              {/* Empty State */}
              {!attemptsLoading && attempts.length === 0 && (
                <div className="py-12 text-center">

                  <p className="text-sm text-gray-500 dark:text-gray-400 opacity-80">
                    No attempts yet — sit a paper and it will show up here.
                  </p>

                  <Link
                    to="/"
                    className="inline-flex items-center justify-center mt-5 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-[#16161D] text-gray-900 dark:text-white text-sm font-medium px-5 py-2.5 transition-colors"
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

                      <tr className="border-b border-gray-200 dark:border-gray-800">

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                          Course
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                          Exam Type
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                          Date
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 text-right">
                          Score
                        </th>

                        <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 text-right">
                          Action
                        </th>

                      </tr>

                    </thead>

                    {/* Table Body */}
                    <tbody>

                      {attempts.map((attempt) => (
                        <tr
                          key={attempt.id}
                          className="border-b border-gray-200 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                        >

                          {/* Course */}
                          <td className="px-4 py-4">

                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attempt.courseName}
                            </p>

                          </td>

                          {/* Exam Type */}
                          <td className="px-4 py-4">

                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {examTypeLabel(
                                attempt.examType
                              )}
                            </span>

                          </td>

                          {/* Date */}
                          <td className="px-4 py-4">

                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {formatDate(
                                attempt.examDate
                              )}
                            </span>

                          </td>

                          {/* Score */}
                          <td className="px-4 py-4 text-right">

                            <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                              {attempt.score}/
                              {attempt.totalMarks}
                            </span>

                          </td>

                          {/* Action */}
                          <td className="px-4 py-4 text-right">

                            <Link
                              to={`/data-science-and-applications/${attempt.courseSlug}/report?attempt=${attempt.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-800 bg-transparent hover:bg-gray-100 dark:hover:bg-[#16161D] text-gray-900 dark:text-white text-xs font-medium px-3 py-1.5 transition-colors"
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