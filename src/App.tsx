import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PendingAttemptSync } from "@/components/PendingAttemptSync";
import { useGhostScrollbar } from "@/hooks/use-ghost-scrollbar";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Overview from "./pages/Dashboard";
import CreateContent from "./pages/BugCreate";
import QuestionBank from "./pages/BugList";
import Schedule from "./pages/Schedule";
import Performance from "./pages/Analytics";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Degree from "./pages/Degree";
import CourseDetail from "./pages/CourseDetail";
import Profile from "./pages/Profile";
import Exam from "./pages/Exam";
import ExamReport from "./pages/ExamReport";
import DevPyqLab from "./pages/DevPyqLab";
import DevPyqImportLab from "./pages/DevPyqImportLab";
import AuthCallback from "./pages/AuthCallback";


const queryClient = new QueryClient();

const App = () => {
  useGhostScrollbar();
  return (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PendingAttemptSync />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/" element={<Index />} />
              <Route path="/admin/overview" element={<ProtectedRoute requireAdmin><Overview /></ProtectedRoute>} />
              <Route path="/admin/create" element={<ProtectedRoute requireAdmin><CreateContent /></ProtectedRoute>} />
              <Route path="/admin/bank" element={<ProtectedRoute requireAdmin><QuestionBank /></ProtectedRoute>} />
              <Route path="/admin/schedule" element={<ProtectedRoute requireAdmin><Schedule /></ProtectedRoute>} />
              <Route path="/admin/performance" element={<ProtectedRoute requireAdmin><Performance /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/:slug/:courseSlug/exam" element={<Exam />} />
              <Route path="/:slug/:courseSlug/report" element={<ExamReport />} />
              <Route path="/:slug/:courseSlug" element={<CourseDetail />} />
              <Route path="/:slug" element={<Degree />} />

              {/* Extraction lab. Dev builds only — it runs the importer without
                  the admin gate, so it must never exist in production. */}
              {import.meta.env.DEV && <Route path="/dev/pyq" element={<DevPyqLab />} />}
              {import.meta.env.DEV && <Route path="/dev/pyq-import" element={<DevPyqImportLab />} />}

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  );
};

export default App;
