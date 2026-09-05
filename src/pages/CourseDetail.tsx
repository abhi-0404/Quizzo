import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { StackedLogo } from "@/components/StackedLogo";
import { NavAuthArea } from "@/components/NavAuthArea";
import { useQuery } from "@tanstack/react-query";
import { examTypeLabel, listPapersForCourse, type PaperSummary } from "@/lib/pyq-read";
import { formatDate } from "@/data/schedule";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEGREES: Record<string, string> = {
  "data-science-and-applications": "Data Science and Applications",
  "electronic-systems": "Electronic Systems",
  "management-and-data-science": "Management and Data Science",
  "aeronautics-and-space-technology": "Aeronautics and Space Technology",
};

type Term = "All" | "Jan" | "May" | "Sept";
type Year = string;

const TERMS: Term[] = ["All", "Jan", "May", "Sept"];

/** "May Term" -> "May", so a stored term matches the filter chips. */
const termChip = (term: string): Term => {
  const head = term.split(" ")[0];
  return (TERMS as string[]).includes(head) ? (head as Term) : "All";
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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

function CourseDetail() {
  const { slug = "", courseSlug = "" } = useParams();
  const { theme, setTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const degreeName = DEGREES[slug] ?? "Unknown Degree";

  const examFromQuery = searchParams.get("exam") ?? "";

  const [term, setTerm] = useState<Term>("All");
  const [year, setYear] = useState<Year>("All");

  const { data: papers = [], isLoading } = useQuery({
    queryKey: ["papers", courseSlug],
    queryFn: () => listPapersForCourse(courseSlug),
  });

  // The heading used to be recovered by matching the slug against a third copy
  // of the course list; it now comes back with the papers.
  const courseName = papers[0]?.courseName ?? courseSlug.replace(/-/g, " ");

  // Year options come from the papers that exist rather than a fixed list.
  const years = useMemo(
    () => ["All", ...[...new Set(papers.map((p) => String(p.year)))].sort((a, b) => b.localeCompare(a))],
    [papers]
  );

  const filteredPapers = useMemo(
    () =>
      papers.filter((p) => {
        const termMatch = term === "All" || termChip(p.term) === term;
        const yearMatch = year === "All" || String(p.year) === year;
        return termMatch && yearMatch;
      }),
    [papers, term, year]
  );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `Check out ${courseName} past papers on QUIZZO`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

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
            to={`/${slug}`}
            className="group inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to {degreeName}
          </Link>

          {/* Title block */}
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[clamp(1.8rem,3.6vw,2.75rem)] font-[500] leading-[1.08] tracking-[-0.035em] text-foreground">
                {courseName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {examFromQuery && (
                  <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium tracking-[0.06em] uppercase text-foreground">
                    {examFromQuery}
                  </span>
                )}
                <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium tracking-[0.06em] uppercase text-foreground">
                  {papers.length} paper{papers.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Share
            </a>
          </div>

          {/* Filters */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<Term> options={TERMS} value={term} onChange={setTerm} />
            <Select
              value={year}
              onValueChange={(v) => setYear(v as Year)}
            >
              <SelectTrigger className="w-full sm:w-[140px] h-9 text-[12.5px] bg-transparent border-border text-muted-foreground focus:ring-ring">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground">
                {years.map((y) => (
                  <SelectItem key={y} value={y} className="text-[12.5px]">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Paper grid */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredPapers.map((paper: PaperSummary) => (
              <div
                key={paper.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-secondary"
              >
                <h3 className="text-lg font-medium text-foreground">{formatDate(paper.examDate)}</h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {examTypeLabel(paper.examType)}
                  {paper.variantLabel ? ` · ${paper.variantLabel}` : ""}
                </p>
                <p className="text-[12.5px] text-muted-foreground capitalize">
                  {paper.programme} · {paper.term}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Duration: {paper.durationMinutes} min
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Questions: {paper.questionCount}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Marks: {paper.totalMarks}
                </p>

                <div className="my-4 border-t border-border" />

                <div className="flex flex-col gap-2">
                  <Link
                    to={`/${slug}/${courseSlug}/exam?paper=${paper.id}&mode=exam`}
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-[12.5px] text-foreground transition-colors hover:border-foreground/30 hover:bg-muted text-center"
                  >
                    Exam Mode
                  </Link>
                  <Link
                    to={`/${slug}/${courseSlug}/exam?paper=${paper.id}&mode=practice`}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground text-center"
                  >
                    Practice Mode
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {isLoading && (
            <p className="mt-10 text-[13.5px] text-muted-foreground">Loading papers…</p>
          )}
          {!isLoading && filteredPapers.length === 0 && (
            <p className="mt-10 text-[13.5px] text-muted-foreground">
              {papers.length === 0
                ? "No papers have been published for this course yet."
                : "No papers match the selected filters."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default CourseDetail;
