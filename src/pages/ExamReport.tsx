import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Search, LayoutGrid, List, Moon, Sun, Clock } from "lucide-react";

import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  PieChart, Pie, LineChart, Line, AreaChart, Area, Tooltip, ResponsiveContainer,
} from "recharts";
import { NeonPatternDefs, neonPatternId } from "@/components/NeonPatternDefs";

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-md border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1E1E24]"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

const STATUS_COLORS = {
  correct: "#10b981",
  incorrect: "#f43f5e",
  skipped: "#9ca3af",
  marked: "#8b5cf6",
};
const SECTION_COLORS = ["#eab308", "#10b981", "#f43f5e"];
const LINE_COLOR = "#6366f1";
const AREA_COLOR = "#eab308";

interface Row {
  qno: number;
  type: string;
  status: "correct" | "incorrect" | "skipped";
  marks: number;
  time: number;
}

function makeRows(): Row[] {
  const types = ["Single", "Multi", "Comprehension", "Integer"];
  const rows: Row[] = [];
  for (let i = 1; i <= 30; i++) {
    const seed = (i * 7) % 10;
    const status: Row["status"] = seed < 7 ? "correct" : seed < 9 ? "incorrect" : "skipped";
    const marks = status === "correct" ? 4 : status === "incorrect" ? -1 : 0;
    rows.push({
      qno: i,
      type: types[i % types.length],
      status,
      marks,
      time: 30 + ((i * 13) % 90),
    });
  }
  return rows;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4 bg-white dark:bg-transparent">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{subtitle}</p>
      <div className="h-[240px] w-full">
        <ResponsiveContainer>{children as any}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ExamReport() {
  const { slug, courseSlug } = useParams();
  const [searchParams] = useSearchParams();
  const sessionMode: "exam" | "practice" =
    searchParams.get("mode") === "practice" ? "practice" : "exam";
  const isPractice = sessionMode === "practice";
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");

  const rows = useMemo(() => makeRows(), []);
  const subject = (courseSlug ?? "subject").split("-").map(s => s[0]?.toUpperCase() + s.slice(1)).join(" ");

  const totals = useMemo(() => {
    const correct = rows.filter(r => r.status === "correct").length;
    const incorrect = rows.filter(r => r.status === "incorrect").length;
    const skipped = rows.filter(r => r.status === "skipped").length;
    const attempted = correct + incorrect;
    const score = rows.reduce((a, r) => a + r.marks, 0);
    const totalTime = rows.reduce((a, r) => a + r.time, 0);
    const mm = Math.floor(totalTime / 60).toString().padStart(2, "0");
    const ss = (totalTime % 60).toString().padStart(2, "0");
    const acc = attempted ? Math.round((correct / attempted) * 100) : 0;
    return { correct, incorrect, skipped, attempted, score, timeStr: `${mm}:${ss}`, acc };
  }, [rows]);

  const statusData = [
    { name: "Correct", value: totals.correct, color: STATUS_COLORS.correct },
    { name: "Incorrect", value: totals.incorrect, color: STATUS_COLORS.incorrect },
    { name: "Skipped", value: totals.skipped, color: STATUS_COLORS.skipped },
    { name: "Marked", value: 3, color: STATUS_COLORS.marked },
  ];

  const sectionData = [
    { name: "Section A", value: 40, color: SECTION_COLORS[0] },
    { name: "Section B", value: 44, color: SECTION_COLORS[1] },
    { name: "Section C", value: 20, color: SECTION_COLORS[2] },
  ];

  const timeData = rows.map(r => ({ q: `Q${r.qno}`, time: r.time }));

  const cumulative = useMemo(() => {
    let s = 0;
    return rows.map(r => {
      s += Math.max(0, r.marks);
      return { q: `Q${r.qno}`, score: s };
    });
  }, [rows]);

  const filtered = rows.filter(r =>
    r.qno.toString().includes(search) ||
    r.type.toLowerCase().includes(search.toLowerCase()) ||
    r.status.includes(search.toLowerCase())
  );

  const allColors = [
    ...Object.values(STATUS_COLORS),
    ...SECTION_COLORS,
    AREA_COLOR,
    LINE_COLOR,
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0B0F] text-gray-900 dark:text-white">
      <NeonPatternDefs colors={allColors} />

      {/* Header */}
      <header className="bg-white dark:bg-[#16161D] border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 h-14 flex items-center justify-between">
        <Link
          to={`/${slug}/${courseSlug}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ChevronLeft size={16} /> Back to {subject}
        </Link>
        <div className="text-sm font-semibold">
          {isPractice ? "Practice Session Report" : "Exam Performance Report"}
        </div>
        <div className="flex items-center gap-2">
          <ThemeButton />
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-semibold">
            {isPractice ? "Practice Session Report" : "Exam Performance Report"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isPractice ? "Post-practice review and summary" : "Post-exam performance summary"}
          </p>
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
          {[
            { label: "Total Score", value: totals.score, subtitle: "Marks scored" },
            { label: "Accuracy", value: `${totals.acc}%`, subtitle: "Correct vs attempted" },
            { label: "Time Taken", value: totals.timeStr, subtitle: isPractice ? "Total elapsed time" : "Out of 60 mins" },
            { label: "Questions Attempted", value: `${totals.attempted} / 30`, subtitle: "Attempted out of 30" },
          ].map((m, i) => (
            <div
              key={m.label}
              className={`flex-1 min-w-[160px] p-5 ${i > 0 ? "border-l border-gray-200 dark:border-gray-800" : ""}`}
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">{m.label}</p>
              <p className="text-3xl font-bold mt-1">{m.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{m.subtitle}</p>
            </div>
          ))}
        </div>

        {/* Row 2: Distributions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Questions by status" subtitle="Distribution across exam states">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Bar dataKey="value" radius={0}>
                {statusData.map((e, i) => (
                  <Cell key={i} fill={`url(#${neonPatternId(e.color)})`} stroke={e.color} strokeWidth={1.5} />
                ))}
              </Bar>
            </BarChart>
          </Panel>

          <Panel title="Section distribution" subtitle="Score breakdown by subject">
            <PieChart>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Pie data={sectionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                {sectionData.map((e, i) => (
                  <Cell key={i} fill={`url(#${neonPatternId(e.color)})`} stroke={e.color} strokeWidth={1.5} />
                ))}
              </Pie>
            </PieChart>
          </Panel>
        </div>

        {/* Row 3: Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Time per question" subtitle="Seconds spent on each question">
            <LineChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="q" tick={{ fontSize: 10 }} interval={2} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Line type="linear" dataKey="time" stroke={LINE_COLOR} strokeWidth={1.5} dot={{ r: 2.5, fill: LINE_COLOR }} />
            </LineChart>
          </Panel>

          <Panel title="Score progression" subtitle="Cumulative marks over time">
            <AreaChart data={cumulative}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="q" tick={{ fontSize: 10 }} interval={2} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area
                type="linear"
                dataKey="score"
                stroke={AREA_COLOR}
                strokeWidth={1.5}
                fill={`url(#${neonPatternId(AREA_COLOR)})`}
                fillOpacity={1}
              />
            </AreaChart>
          </Panel>
        </div>

        {/* Row 4: Question Log */}
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#16161D] border border-gray-200 dark:border-gray-800 rounded-md p-2 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-2">
              <Search size={14} className="text-gray-500 dark:text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-500"
              />
            </div>
            <button
              onClick={() => setView("list")}
              className={`p-2 rounded transition-colors ${
                view === "list"
                  ? "bg-gray-200 dark:bg-[#27272A] text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
              aria-label="List view"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-2 rounded transition-colors ${
                view === "grid"
                  ? "bg-gray-200 dark:bg-[#27272A] text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {view === "list" ? (
            <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                    <th className="px-4 py-3 font-medium">Q.No</th>
                    <th className="px-4 py-3 font-medium">Question Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Marks</th>
                    <th className="px-4 py-3 font-medium">Time Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const dot =
                      r.status === "correct"
                        ? "bg-emerald-500"
                        : r.status === "incorrect"
                        ? "bg-rose-500"
                        : "bg-gray-400";
                    const label = r.status[0].toUpperCase() + r.status.slice(1);
                    const markClass =
                      r.marks > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : r.marks < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-gray-500 dark:text-gray-400";
                    return (
                      <tr
                        key={r.qno}
                        className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-[#1E1E24]"
                      >
                        <td className="px-4 py-3">{r.qno}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.type}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${markClass}`}>
                            {r.marks > 0 ? `+${r.marks}` : r.marks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.time}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((r) => {
                const dot =
                  r.status === "correct"
                    ? "bg-emerald-500"
                    : r.status === "incorrect"
                    ? "bg-rose-500"
                    : "bg-gray-400";
                const label = r.status[0].toUpperCase() + r.status.slice(1);
                const markClass =
                  r.marks > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : r.marks < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-500 dark:text-gray-400";
                return (
                  <div
                    key={r.qno}
                    className="bg-white dark:bg-[#16161D] border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex flex-col gap-3 shadow-none"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Q. {r.qno}</span>
                      <span className="bg-gray-100 dark:bg-[#1E1E24] text-xs text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                        {r.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
                      </span>
                      <span className={`text-sm font-medium ${markClass}`}>
                        {r.marks > 0 ? `+${r.marks}` : r.marks}
                      </span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-2 mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Clock size={14} />
                      <span>{r.time}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
