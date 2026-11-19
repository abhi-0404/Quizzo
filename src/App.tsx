import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QuizzoLoader } from "@/components/QuizzoLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PendingAttemptSync } from "@/components/PendingAttemptSync";
import { useGhostScrollbar } from "@/hooks/use-ghost-scrollbar";
const Auth = lazy(() => import("./pages/Auth"));
const Index = lazy(() => import("./pages/Index"));
const Overview = lazy(() => import("./pages/Dashboard"));
const CreateContent = lazy(() => import("./pages/BugCreate"));
const QuestionBank = lazy(() => import("./pages/BugList"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Performance = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Degree = lazy(() => import("./pages/Degree"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Exam = lazy(() => import("./pages/Exam"));
const ExamReport = lazy(() => import("./pages/ExamReport"));
const DevPyqLab = lazy(() => import("./pages/DevPyqLab"));
const DevPyqImportLab = lazy(() => import("./pages/DevPyqImportLab"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Contributors = lazy(() => import("./pages/Contributors"));
const ReviewInbox = lazy(() => import("./pages/ReviewInbox"));
const ContributorOverview = lazy(() => import("./pages/contributor/Overview"));
const ContributorPapers = lazy(() => import("./pages/contributor/Papers"));
const ContributorReviewPaper = lazy(() => import("./pages/contributor/ReviewPaper"));
const ContributorSubmissions = lazy(() => import("./pages/contributor/Submissions"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const PageFallback = () => <QuizzoLoader fullscreen />;

const App = () => {
  useGhostScrollbar();
  return (
  <ErrorBoundary>
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PendingAttemptSync />
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/" element={<Index />} />
              <Route path="/admin/overview" element={<ProtectedRoute requireAdmin><Overview /></ProtectedRoute>} />
              <Route path="/admin/create" element={<ProtectedRoute requireAdmin><CreateContent /></ProtectedRoute>} />
              <Route path="/admin/bank" element={<ProtectedRoute requireAdmin><QuestionBank /></ProtectedRoute>} />
              <Route path="/admin/schedule" element={<ProtectedRoute requireAdmin><Schedule /></ProtectedRoute>} />
              <Route path="/admin/performance" element={<ProtectedRoute requireAdmin><Performance /></ProtectedRoute>} />
              <Route path="/admin/contributors" element={<ProtectedRoute requireAdmin><Contributors /></ProtectedRoute>} />
              <Route path="/admin/reviews" element={<ProtectedRoute requireAdmin><ReviewInbox /></ProtectedRoute>} />

              {/* Contributor portal: reviewers check answer keys and submit solutions. */}
              <Route path="/contributor/overview" element={<ProtectedRoute requireReviewer><ContributorOverview /></ProtectedRoute>} />
              <Route path="/contributor/papers" element={<ProtectedRoute requireReviewer><ContributorPapers /></ProtectedRoute>} />
              <Route path="/contributor/papers/:paperId" element={<ProtectedRoute requireReviewer><ContributorReviewPaper /></ProtectedRoute>} />
              <Route path="/contributor/submissions" element={<ProtectedRoute requireReviewer><ContributorSubmissions /></ProtectedRoute>} />

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
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </ErrorBoundary>
  );
};

export default App;
