import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCourses, type CourseSummary } from "@/lib/pyq-read";
import { iconForCourse } from "@/data/course-icons";

import { ArrowLeft, ArrowRight, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { StackedLogo } from "@/components/StackedLogo";
import { NavAuthArea } from "@/components/NavAuthArea";

const DEGREES: Record<string, string> = {
  "data-science-and-applications": "Data Science and Applications",
  "electronic-systems": "Electronic Systems",
  "management-and-data-science": "Management and Data Science",
  "aeronautics-and-space-technology": "Aeronautics and Space Technology",
};

type Level = "Foundation" | "Diploma" | "Degree";
type Exam = "Quiz 1" | "Quiz 2" | "End Term";

const LEVELS: Level[] = ["Foundation", "Diploma", "Degree"];

/** UI labels map onto the database enums. */
const LEVEL_KEY: Record<Level, CourseSummary["level"]> = {
  Foundation: "foundation",
  Diploma: "diploma",
  Degree: "degree",
};
const EXAM_KEY: Record<Exam, "quiz_1" | "quiz_2" | "end_term"> = {
  "Quiz 1": "quiz_1",
  "Quiz 2": "quiz_2",
  "End Term": "end_term",
};
const EXAMS: Exam[] = ["Quiz 1", "Quiz 2", "End Term"];

function Segmented<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { options, value, onChange } = props;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={
              "px-3.5 py-1.5 text-[12.5px] rounded-full transition-colors " +
              (active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

const Degree = () => {
  const { slug = "" } = useParams();
  const { theme, setTheme } = useTheme();
  const name = DEGREES[slug] ?? "Unknown Degree";

  const [level, setLevel] = useState<Level>("Foundation");
  const [exam, setExam] = useState<Exam>("Quiz 1");

  const isDS = slug === "data-science-and-applications";

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
  });

  // Only courses that actually have a paper for the selected exam are shown:
  // the filter used to be decorative, driven by a hash of the course name.
  const examKey = EXAM_KEY[exam];
  const filtered = useMemo(
    () =>
      courses.filter(
        (c) => c.level === LEVEL_KEY[level] && c.byExamType[examKey].papers > 0
      ),
    [courses, level, examKey]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 z-50 w-full bg-background border-b border-border px-6">
        <div className="mx-auto flex h-[56px] max-w-[1200px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2 -ml-0.5">
            <StackedLogo size={16} />
            <span className="text-[14px] font-bold text-foreground tracking-[0.08em] uppercase">QUIZZO</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative h-8 w-8 flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors"
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
        <div className="mx-auto max-w-[1200px]">
          {/* Breadcrumb */}
          <Link
            to="/"
            className="group inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Degrees
          </Link>

          {/* Title */}
          <h1 className="mt-6 text-[clamp(1.8rem,3.6vw,2.75rem)] font-[500] leading-[1.08] tracking-[-0.035em] text-foreground">
            {name}
          </h1>
          <p className="mt-3 text-[13.5px] text-muted-foreground max-w-[560px]">
            Browse courses, pick a paper set, and practice against the real exam pattern.
          </p>

          {isDS ? (
            <>
              {/* Toggles */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Segmented<Level> options={LEVELS} value={level} onChange={setLevel} />
                <Segmented<Exam> options={EXAMS} value={exam} onChange={setExam} />
              </div>
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                Showing {level} courses with {exam} papers
              </p>

              {isLoading && (
                <p className="mt-10 text-[13.5px] text-muted-foreground">Loading courses…</p>
              )}
              {!isLoading && filtered.length === 0 && (
                <p className="mt-10 text-[13.5px] text-muted-foreground">
                  No {exam} papers have been published for {level} level yet.
                </p>
              )}

              {/* Grid */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((c) => {
                  const Icon = iconForCourse(c.slug);
                  const { papers, questions } = c.byExamType[examKey];
                  return (
                    <div
                      key={c.id}
                      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:bg-secondary hover:border-foreground/20"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground group-hover:text-foreground transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                          {level}
                        </span>
                      </div>

                      <h3 className="mt-5 text-[15px] font-semibold leading-snug text-foreground">
                        {c.name}
                      </h3>

                      <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
                        <span>{papers} Paper{papers === 1 ? "" : "s"} Available</span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span>{questions} Total Questions</span>
                      </div>

                      <div className="mt-5 pt-4 border-t border-border">
                        <Link
                          to={`/${slug}/${c.slug}?exam=${encodeURIComponent(exam)}`}
                          className="group/btn inline-flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted hover:border-foreground/30"
                        >
                          Select Paper
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                        </Link>
                      </div>

                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-10 text-[13.5px] text-muted-foreground">Course catalog coming soon.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Degree;
