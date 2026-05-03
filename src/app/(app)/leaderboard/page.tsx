"use client";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Award, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { ExportMenu } from "@/components/export-menu";
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

  const filtersActive =
    catFilter.length + centreFilter.length + teacherFilter.length + (minScore !== "" ? 1 : 0) + (maxScore !== "" ? 1 : 0);

  function clearFilters() {
    setCatFilter([]);
    setCentreFilter([]);
    setTeacherFilter([]);
    setMinScore("");
    setMaxScore("");
  }

  const grouped = useMemo(() => {
    const m = new Map<string, LeaderboardRow[]>();
    for (const r of filtered) {
      if (!m.has(r.student.category_name)) m.set(r.student.category_name, []);
      m.get(r.student.category_name)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        description="Rankings are grouped by category, ordered by score, then DOB (younger wins ties), then alphabetical."
        actions={
          <>
            <ExportMenu
              surface="leaderboard"
              trophiesApplied={trophiesApplied}
              imageSelector="[data-export-section]"
              filters={{
                categories: catFilter,
                centres: centreFilter,
                teachers: teacherFilter,
                min: minScore,
                max: maxScore,
              }}
            />
            <Button
              variant={trophiesApplied ? "subtle" : "primary"}
              onClick={async () => {
                const next = !trophiesApplied;
                setTrophiesApplied(next);
                setRows(null);
                await load(next);
                toast.success(next ? "Trophy positions applied" : "Trophy positions cleared");
              }}
            >
              <Award className="w-4 h-4" />
              {trophiesApplied ? "Hide trophies" : "Apply trophies"}
            </Button>
          </>
        }
      />

      <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-[#F0EDE5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Filters</h2>
            {filtersActive > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F4F1E8] text-[#1B3A6B] font-medium">
                {filtersActive} active
              </span>
            )}
          </div>
          {filtersActive > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <FilterChip label="Category" options={allCategories} selected={catFilter} onChange={setCatFilter} />
          <FilterChip label="Centre" options={allCentres} selected={centreFilter} onChange={setCentreFilter} />
          <FilterChip label="Teacher" options={allTeachers} selected={teacherFilter} onChange={setTeacherFilter} />
          <div>
            <Label>Min score</Label>
            <Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Max score</Label>
            <Input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="∞" />
          </div>
        </div>
        <div className="px-5 py-2.5 border-t border-[#F0EDE5] text-[11px] text-[#7A7770] bg-[#FAF9F5]">
          Showing {filtered.length} of {rows?.length ?? 0} students
        </div>
      </div>

      {rows == null ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7]">
          <TableSkeleton rows={8} cols={8} />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7]">
          <EmptyState icon={Trophy} title="No results" description="Add students and scores, or adjust filters." />
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, list]) => (
            <CategorySection
              key={cat}
              category={cat}
              rows={list}
              questionTypes={questionTypes}
              showTrophy={trophiesApplied}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  rows,
  questionTypes,
  showTrophy,
}: {
  category: string;
  rows: LeaderboardRow[];
  questionTypes: QuestionType[];
  showTrophy: boolean;
}) {
  const top = rows[0];
  return (
    <div
      data-export-section
      data-export-name={category}
      className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-[#F0EDE5] flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">Category</div>
          <h2 className="font-serif text-[20px] font-semibold text-[#1F1E1B] tracking-tight">{category}</h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">
            {rows.length} {rows.length === 1 ? "student" : "students"}
          </div>
          {top && (
            <div className="text-[12px] text-[#4A4843]">
              Top score: <span className="font-semibold text-[#1F1E1B]">{top.totalScore}</span>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tusgu-table">
          <thead>
            <tr>
              <th className="w-12">Rank</th>
              <th>Name</th>
              <th>DOB</th>
              <th>Age</th>
              <th>Centre</th>
              <th>Teacher</th>
              {questionTypes.map((qt) => (
                <th key={qt.id} className="text-right">{qt.name}</th>
              ))}
              <th className="text-right">Total</th>
              <th className="text-right">%</th>
              {showTrophy && <th>Trophy</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id}>
                <td>
                  <RankBadge rank={r.rank} />
                </td>
                <td className="font-medium">
                  {r.student.first_name} {r.student.last_name}
                </td>
                <td className="text-[#7A7770]">{formatDate(r.student.dob)}</td>
                <td className="text-[#4A4843]">{r.age}</td>
                <td className="text-[#4A4843]">{r.student.centre}</td>
                <td className="text-[#4A4843]">{r.student.teacher}</td>
                {questionTypes.map((qt) => (
                  <td key={qt.id} className="text-right tabular-nums">
                    {r.scoresByType[qt.id] ?? 0}
                  </td>
                ))}
                <td className="text-right font-semibold tabular-nums">{r.totalScore}</td>
                <td className="text-right text-[#7A7770] tabular-nums">{r.percentage.toFixed(1)}%</td>
                {showTrophy && (
                  <td>
                    {r.trophy ? <TrophyChip name={r.trophy.name} icon={r.trophy.icon} order={r.trophy.display_order} /> : <span className="text-[#A8A39B]">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const isPodium = rank <= 3;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[26px] h-[24px] px-1.5 rounded text-[12px] font-semibold tabular-nums ${
        isPodium ? "bg-[#1B3A6B] text-white" : "text-[#1F1E1B]"
      }`}
    >
      {rank}
    </span>
  );
}

function TrophyChip({ name, icon, order }: { name: string; icon: string | null; order: number }) {
  const palette =
    order === 1
      ? "bg-[#FAF3DC] text-[#7A5A1A] border-[#E5CE8A]"
      : order === 2
      ? "bg-[#F1F0EC] text-[#4A4843] border-[#D9D2BE]"
      : order === 3
      ? "bg-[#F6E9DC] text-[#8A4520] border-[#E0BB95]"
      : "bg-[#F4F1E8] text-[#1B3A6B] border-[#E5DECF]";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] font-medium border ${palette}`}>
      {icon && <span>{icon}</span>}
      {name}
    </span>
  );
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
      <details className="relative group">
        <summary className="h-9 w-full rounded-md border border-[#E8E3D7] bg-white px-3 text-[13px] flex items-center justify-between cursor-pointer hover:border-[#D9D2BE] transition-colors list-none">
          <span className="truncate text-[#1F1E1B]">
            {selected.length === 0 ? `All ${label.toLowerCase()}s` : `${selected.length} selected`}
          </span>
          <span className="text-[#7A7770] text-[10px]">▼</span>
        </summary>
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-[#E8E3D7] rounded-md shadow-lg p-1.5">
          {options.length === 0 ? (
            <div className="text-[12px] text-[#A8A39B] px-2 py-1.5">No options</div>
          ) : (
            options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F4F1E8] rounded cursor-pointer text-[13px]"
              >
                <input
                  type="checkbox"
                  className="accent-[#1B3A6B]"
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
