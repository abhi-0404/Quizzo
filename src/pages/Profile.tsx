import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Sun, FileText, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { StackedLogo } from "@/components/StackedLogo";
import { NavAuthArea } from "@/components/NavAuthArea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/utils";

interface PyqAttempt {
  id: string;
  subject: string;
  paper: string;
  courseSlug: string;
  date: string;
  score: number;
  total: number;
}

// Recent practice sessions. Static sample history until attempts are persisted.
const PYQ_HISTORY: PyqAttempt[] = [
  { id: "a1", subject: "Statistics I", paper: "Midterm 2023", courseSlug: "statistics-i", date: "12 May 2025", score: 34, total: 40 },
  { id: "a2", subject: "Mathematics II", paper: "End Term 2024", courseSlug: "mathematics-ii", date: "28 Apr 2025", score: 41, total: 50 },
  { id: "a3", subject: "Programming in Python", paper: "Quiz 2 2024", courseSlug: "programming-in-python", date: "09 Apr 2025", score: 27, total: 30 },
  { id: "a4", subject: "Database Management Systems", paper: "Quiz 1 2025", courseSlug: "database-management-systems", date: "21 Mar 2025", score: 22, total: 30 },
  { id: "a5", subject: "Machine Learning Foundations", paper: "End Term 2023", courseSlug: "machine-learning-foundations", date: "02 Mar 2025", score: 38, total: 50 },
];

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AK";
  const letters = (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "");
  return letters.toUpperCase() || "AK";
}

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();


  if (!user) {
    // Not signed in — bounce home
    navigate("/", { replace: true });
    return null;
  }

  const [fullName, setFullName] = useState(profile?.full_name || "Abhishek Kumar");
  const [academicTrack, setAcademicTrack] = useState("BS in Data Science and Applications");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const email = user?.email || "abhishek@example.com";
  const initials = useMemo(() => initialsFrom(fullName), [fullName]);

  const handleSaveProfile = async () => {
    if (!user) {
      toast.success("Profile saved");
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      toast.success("Password updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update password");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (user) await signOut();
      toast.success("Logged out");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not log out");
    }
  };

  const inputClass =
    "w-full h-9 rounded-md border border-gray-300 dark:border-gray-800 bg-white dark:bg-[#16161D] px-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors";
  const labelClass = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";
  const sectionTitleClass = "text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0B0F] text-gray-900 dark:text-white">
      {/* Top nav */}
      <nav className="fixed top-0 z-50 w-full bg-white dark:bg-[#0B0B0F] border-b border-gray-200 dark:border-gray-800 px-6">
        <div className="mx-auto flex h-[56px] max-w-[1200px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2 -ml-0.5">
            <StackedLogo size={16} />
            <span className="text-[14px] font-bold tracking-[0.08em] uppercase">QUIZZO</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              title="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </button>
            <NavAuthArea />
          </div>
        </div>
      </nav>

      <section className="pt-[104px] pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>

          {/* ---------- 1. Profile Information ---------- */}
          <h2 className={sectionTitleClass}>Profile Information</h2>

          {/* Avatar row */}
          <div className="flex items-center gap-4 mb-6">
            <div className="h-14 w-14 shrink-0 rounded-full bg-gray-700 flex items-center justify-center text-lg font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{fullName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</p>
            </div>
          </div>

          {/* Form grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="full-name" className={labelClass}>Full Name</label>
              <input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="academic-track" className={labelClass}>Academic Track</label>
              <input
                id="academic-track"
                value={academicTrack}
                onChange={(e) => setAcademicTrack(e.target.value)}
                placeholder="Your academic track"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 font-medium px-4 py-1.5 rounded disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {savingProfile ? "Saving…" : "Save"}
            </button>
          </div>

          {/* ---------- 2. PYQ Practice History ---------- */}
          <hr className="border-t border-gray-200 dark:border-gray-800 my-8" />

          <h2 className={sectionTitleClass}>PYQ Practice History</h2>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#16161D] overflow-hidden">
            {PYQ_HISTORY.map((attempt, i) => (
              <div
                key={attempt.id}
                className={`flex items-center gap-4 px-4 py-3 bg-white dark:bg-[#16161D] hover:bg-gray-50 dark:hover:bg-[#1C1C24] transition-colors ${
                  i > 0 ? "border-t border-gray-200 dark:border-gray-800" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {attempt.subject} — {attempt.paper}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{attempt.date}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {attempt.score}/{attempt.total}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Score</p>
                </div>

                <Link
                  to={`/data-science-and-applications/${slugify(attempt.subject)}/report?mode=practice`}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#27272A] hover:bg-gray-200 dark:hover:bg-[#323238] text-gray-900 dark:text-white text-xs font-medium px-3 py-1.5 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Report
                </Link>
              </div>
            ))}
          </div>

          {/* ---------- 3. Account Management ---------- */}
          <hr className="border-t border-gray-200 dark:border-gray-800 my-8" />

          <h2 className={sectionTitleClass}>Account Management</h2>

          {/* Change password */}
          <div className="mb-8">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">Change Password</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-sm">
                <label htmlFor="new-password" className={labelClass}>New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className={inputClass}
                />
              </div>
              <button
                onClick={handleUpdatePassword}
                disabled={updatingPassword}
                className="h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#16161D] hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium px-4 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {updatingPassword ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>

          {/* Log out */}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">Session</p>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-[#2A1111] text-sm font-medium px-4 py-2 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
