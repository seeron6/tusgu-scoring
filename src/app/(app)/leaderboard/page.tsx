"use client";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Download, Award, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { formatDate } from "@/lib/utils";
import type { LeaderboardRow, QuestionType } from "@/lib/types";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [trophiesApplied, setTrophiesApplied] = useState(false);

  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [centreFilter, setCentreFilter] = useState<string[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string[]>([]);
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  async function load(applyTrophies: boolean) {
    const url = `/api/leaderboard${applyTrophies ? "?trophies=1" : ""}`;
    const [r, qt] = await Promise.all([
      fetch(url).then((r) => r.json()),
      fetch("/api/question-types").then((r) => r.json()),
    ]);
    setRows(r);
    setQuestionTypes(qt);
  }
  useEffect(() => {
    load(false);
  }, []);

  const allCategories = useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.category_name) ?? [])).sort(),
    [rows]
  );
  const allCentres = useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.centre) ?? [])).sort(),
    [rows]
  );
  const allTeachers = useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.teacher) ?? [])).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (catFilter.length && !catFilter.includes(r.student.category_name)) return false;
      if (centreFilter.length && !centreFilter.includes(r.student.centre)) return false;
      if (teacherFilter.length && !teacherFilter.includes(r.student.teacher)) return false;
      if (minScore !== "" && r.totalScore < Number(minScore)) return false;
      if (maxScore !== "" && r.totalScore > Number(maxScore)) return false;
      return true;
    });
  }, [rows, catFilter, centreFilter, teacherFilter, minScore, maxScore]);

  function clearFilters() {
    setCatFilter([]);
    setCentreFilter([]);
    setTeacherFilter([]);
    setMinScore("");
    setMaxScore("");
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (trophiesApplied) params.set("trophies", "1");
    if (catFilter.length) params.set("categories", catFilter.join(","));
    if (centreFilter.length) params.set("centres", centreFilter.join(","));
    if (teacherFilter.length) params.set("teachers", teacherFilter.join(","));
    if (minScore !== "") params.set("min", minScore);
    if (maxScore !== "") params.set("max", maxScore);
    window.open(`/api/export/leaderboard?${params.toString()}`, "_blank");
  }

  // Group filtered rows by category in display
  const grouped = useMemo(() => {
    const m = new Map<string, LeaderboardRow[]>();
    for (const r of filtered) {
      if (!m.has(r.student.category_name)) m.set(r.student.category_name, []);
      m.get(r.student.category_name)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const colCount = 8 + questionTypes.length + 2 + (trophiesApplied ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        description="Rankings are grouped by category, sorted by total score (younger student wins ties)."
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="w-4 h-4" />
              Export Excel
            </Button>
            <Button
              onClick={async () => {
                const next = !trophiesApplied;
                setTrophiesApplied(next);
                setRows(null);
                await load(next);
                toast.success(next ? "Trophy positions applied" : "Trophy positions cleared");
              }}
            >
              <Award className="w-4 h-4" />
              {trophiesApplied ? "Hide Trophies" : "Apply Trophy Positions"}
            </Button>
          </>
        }
      />

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#0F172A]">Filters</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <FilterChip label="Category" options={allCategories} selected={catFilter} onChange={setCatFilter} />
          <FilterChip label="Centre" options={allCentres} selected={centreFilter} onChange={setCentreFilter} />
          <FilterChip label="Teacher" options={allTeachers} selected={teacherFilter} onChange={setTeacherFilter} />
          <div>
            <Label>Min Score</Label>
            <Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Max Score</Label>
            <Input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="∞" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex items-center justify-between bg-slate-50">
          <div className="text-xs text-[#64748B]">
            Showing {filtered.length} of {rows?.length ?? 0}
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" />
            Clear All Filters
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {rows == null ? (
          <TableSkeleton rows={8} cols={8} />
        ) : grouped.length === 0 ? (
          <EmptyState icon={Trophy} title="No results" description="Add students and scores, or adjust filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tusgu-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>DOB</th>
                  <th>Age</th>
                  <th>Category</th>
                  <th>Centre</th>
                  <th>Teacher</th>
                  {questionTypes.map((qt) => (
                    <th key={qt.id}>{qt.name}</th>
                  ))}
                  <th>Total</th>
                  <th>%</th>
                  {trophiesApplied && <th>Trophy</th>}
                </tr>
              </thead>
              <tbody>
                {grouped.map(([cat, list]) => (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    rows={list}
                    questionTypes={questionTypes}
                    showTrophy={trophiesApplied}
                    colCount={colCount}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryGroup({
  category,
  rows,
  questionTypes,
  showTrophy,
  colCount,
}: {
  category: string;
  rows: LeaderboardRow[];
  questionTypes: QuestionType[];
  showTrophy: boolean;
  colCount: number;
}) {
  return (
    <>
      <tr>
        <td colSpan={colCount} className="!bg-[#1B3A6B] !text-white !font-semibold !py-2.5 !text-xs uppercase tracking-wider">
          {category} ({rows.length})
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.student.id}>
          <td className="font-bold text-[#1B3A6B]">{r.rank}</td>
          <td className="font-medium">
            {r.student.first_name} {r.student.last_name}
          </td>
          <td className="text-[#64748B]">{formatDate(r.student.dob)}</td>
          <td>{r.age}</td>
          <td>{r.student.category_name}</td>
          <td>{r.student.centre}</td>
          <td>{r.student.teacher}</td>
          {questionTypes.map((qt) => (
            <td key={qt.id}>{r.scoresByType[qt.id] ?? 0}</td>
          ))}
          <td className="font-semibold">{r.totalScore}</td>
          <td className="text-[#64748B]">{r.percentage.toFixed(1)}%</td>
          {showTrophy && (
            <td>
              {r.trophy ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${trophyColor(r.trophy.display_order)}`}>
                  {r.trophy.icon} {r.trophy.name}
                </span>
              ) : (
                <span className="text-[#94A3B8]">—</span>
              )}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function trophyColor(order: number): string {
  if (order === 1) return "bg-yellow-100 text-yellow-900 border border-yellow-300";
  if (order === 2) return "bg-slate-100 text-slate-700 border border-slate-300";
  if (order === 3) return "bg-orange-100 text-orange-900 border border-orange-300";
  return "bg-blue-50 text-blue-700 border border-blue-200";
}

function FilterChip({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <details className="relative">
        <summary className="h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm flex items-center justify-between cursor-pointer hover:border-[#94A3B8]">
          <span className="truncate text-[#0F172A]">
            {selected.length === 0 ? `All ${label.toLowerCase()}s` : `${selected.length} selected`}
          </span>
          <span className="text-[#94A3B8]">▾</span>
        </summary>
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-[#E2E8F0] rounded-md shadow-lg p-2">
          {options.length === 0 ? (
            <div className="text-xs text-[#94A3B8] px-2 py-1">No options</div>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...selected, opt] : selected.filter((x) => x !== opt))
                  }
                />
                <span className="truncate">{opt}</span>
              </label>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
