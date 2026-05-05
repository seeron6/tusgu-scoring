"use client";
import * as React from "react";
import { Trophy, Award, X, Download, FileText, FileSpreadsheet, ImageIcon, FileType } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import { formatDate } from "@/lib/utils";
import {
  listQuestionTypes, listScores, listStudents, listTrophyAllocations, listTrophyTypes,
} from "@/lib/data";
import { buildLeaderboard, buildPositionLeaderboard, type PositionLeaderboardRow } from "@/lib/ranking";
import type { Score, Student, TrophyAllocation, TrophyType } from "@/lib/types";
import {
  downloadText, downloadWorkbook, leaderboardToCsv, leaderboardToWorkbook,
} from "@/lib/excel";
import { maxQuestionsFor } from "@/lib/utils";
import { ColumnsMenu, useHiddenColumns } from "@/components/columns-menu";
import type { LeaderboardRow, QuestionType } from "@/lib/types";

export default function LeaderboardPage() {
  return (
    <ProtectedPage label="Leaderboard">
      <LeaderboardInner />
    </ProtectedPage>
  );
}

type LBTab = "visual" | "listening" | "flash";

function LeaderboardInner() {
  const [tab, setTab] = React.useState<LBTab>("visual");
  const [rows, setRows] = React.useState<LeaderboardRow[] | null>(null);
  const [listeningRows, setListeningRows] = React.useState<PositionLeaderboardRow[]>([]);
  const [flashRows, setFlashRows] = React.useState<PositionLeaderboardRow[]>([]);
  const [questionTypes, setQuestionTypes] = React.useState<QuestionType[]>([]);
  const [trophiesApplied, setTrophiesApplied] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Cached source data for exports — exports rebuild with applyTrophies: true
  // regardless of the on-page toggle so the Trophy column is always populated.
  const sourceRef = React.useRef<{
    students: Student[]; scores: Score[]; questionTypes: QuestionType[];
    trophyTypes: TrophyType[]; trophyAllocations: TrophyAllocation[];
  } | null>(null);

  const [catFilter, setCatFilter] = React.useState<string[]>([]);
  const [centreFilter, setCentreFilter] = React.useState<string[]>([]);
  const [teacherFilter, setTeacherFilter] = React.useState<string[]>([]);
  const [minScore, setMinScore] = React.useState("");
  const [maxScore, setMaxScore] = React.useState("");
  const [topN, setTopN] = React.useState<number>(10); // 10 = top-10 per cat by default; 0 = show all
  const [exportOpen, setExportOpen] = React.useState(false);
  const cols = useHiddenColumns("tusgu.leaderboard.hidden-columns");

  async function load(applyTrophies: boolean) {
    setLoading(true);
    try {
      const [students, scores, qts, trophyTypes, trophyAllocations] = await Promise.all([
        listStudents(),
        listScores(),
        listQuestionTypes(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      sourceRef.current = { students, scores, questionTypes: qts, trophyTypes, trophyAllocations };
      setRows(
        buildLeaderboard({
          students, scores, questionTypes: qts, trophyTypes, trophyAllocations, applyTrophies,
        })
      );
      setListeningRows(
        buildPositionLeaderboard({
          students, trophyTypes, trophyAllocations, competition: "listening",
        })
      );
      setFlashRows(
        buildPositionLeaderboard({
          students, trophyTypes, trophyAllocations, competition: "flash",
        })
      );
      setQuestionTypes(qts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-build the leaderboard fresh with trophies applied so exports always
   * reflect the latest scores AND have the Trophy column populated, even if
   * the on-page "Apply trophies" toggle is off.
   */
  function buildExportRows(): LeaderboardRow[] {
    const src = sourceRef.current;
    if (!src) return [];
    const fresh = buildLeaderboard({
      students: src.students,
      scores: src.scores,
      questionTypes: src.questionTypes,
      trophyTypes: src.trophyTypes,
      trophyAllocations: src.trophyAllocations,
      applyTrophies: true,
    });
    // Apply the same filters used on the page so the export matches what the
    // user is looking at.
    return fresh.filter((r) => {
      const cat = r.student.category ?? "(uncategorised)";
      if (catFilter.length && !catFilter.includes(cat)) return false;
      if (centreFilter.length && !centreFilter.includes(r.student.centre ?? "")) return false;
      if (teacherFilter.length && !teacherFilter.includes(r.student.teacher ?? "")) return false;
      if (minScore !== "" && r.totalScore < Number(minScore)) return false;
      if (maxScore !== "" && r.totalScore > Number(maxScore)) return false;
      return true;
    });
  }
  React.useEffect(() => {
    load(false);
  }, []);

  const allCategories = React.useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.category ?? "(uncategorised)") ?? [])).sort(),
    [rows]
  );
  const allCentres = React.useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.centre ?? "").filter(Boolean) ?? [])).sort(),
    [rows]
  );
  const allTeachers = React.useMemo(
    () => Array.from(new Set(rows?.map((r) => r.student.teacher ?? "").filter(Boolean) ?? [])).sort(),
    [rows]
  );

  const filtered = React.useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      const cat = r.student.category ?? "(uncategorised)";
      if (catFilter.length && !catFilter.includes(cat)) return false;
      if (centreFilter.length && !centreFilter.includes(r.student.centre ?? "")) return false;
      if (teacherFilter.length && !teacherFilter.includes(r.student.teacher ?? "")) return false;
      if (minScore !== "" && r.totalScore < Number(minScore)) return false;
      if (maxScore !== "" && r.totalScore > Number(maxScore)) return false;
      return true;
    });
  }, [rows, catFilter, centreFilter, teacherFilter, minScore, maxScore]);

  const filtersActive =
    catFilter.length + centreFilter.length + teacherFilter.length +
    (minScore !== "" ? 1 : 0) + (maxScore !== "" ? 1 : 0);

  function clearFilters() {
    setCatFilter([]);
    setCentreFilter([]);
    setTeacherFilter([]);
    setMinScore("");
    setMaxScore("");
  }

  const grouped = React.useMemo(() => {
    const m = new Map<string, LeaderboardRow[]>();
    for (const r of filtered) {
      const cat = r.student.category ?? "(uncategorised)";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(r);
    }
    const limit = topN > 0 ? topN : Infinity;
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.slice(0, limit)] as [string, LeaderboardRow[]]);
  }, [filtered, topN]);

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        description="Rankings group by category. Visual ranks by score; Listening and Flash rank by the live position you entered."
        actions={
          <>
            <div className="flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
              {(["visual", "listening", "flash"] as LBTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors capitalize ${
                    tab === t ? "bg-[#1B3A6B] text-white" : "text-[#4A4843] hover:bg-[#F5F2EB]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "visual" && <ColumnsMenu
              columns={[
                { key: "rank", label: "Rank" },
                { key: "name", label: "Name" },
                ...questionTypes.map((qt) => ({ key: `qt-${qt.id}`, label: qt.name })),
                { key: "total", label: "Total" },
                { key: "percentage", label: "%" },
                { key: "trophy", label: "Trophy" },
                { key: "dob", label: "DOB" },
                { key: "age", label: "Age" },
                { key: "centre", label: "Centre" },
                { key: "teacher", label: "Teacher" },
              ]}
              hidden={cols.hidden}
              onToggle={cols.toggle}
              onResetAll={cols.reset}
            />}
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant={trophiesApplied ? "subtle" : "primary"}
              onClick={async () => {
                const next = !trophiesApplied;
                setTrophiesApplied(next);
                await load(next);
                toast.success(next ? "Trophy positions applied" : "Trophy positions cleared");
              }}
            >
              <Award className="w-4 h-4" />
              <span className="hidden sm:inline">
                {trophiesApplied ? "Hide trophies" : "Apply trophies"}
              </span>
            </Button>
          </>
        }
      />

      <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden mb-6">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#F0EDE5] flex items-center justify-between">
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
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
          <div>
            <Label>Top per category</Label>
            <Select
              value={String(topN)}
              onChange={(e) => setTopN(Number(e.target.value))}
            >
              <option value="6">Top 6</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="0">Show all</option>
            </Select>
          </div>
        </div>
        <div className="px-4 sm:px-5 py-2.5 border-t border-[#F0EDE5] text-[11px] text-[#7A7770] bg-[#FAF9F5]">
          Showing {grouped.reduce((n, [, v]) => n + v.length, 0)} of {filtered.length} filtered students
          {topN > 0 ? ` (top ${topN} per category)` : ""}
        </div>
      </div>

      {tab === "visual" && (
        rows == null || loading ? (
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
                isVisible={cols.isVisible}
              />
            ))}
          </div>
        )
      )}

      {tab === "listening" && (
        <PositionLeaderboardView
          competitionLabel="Listening"
          rows={listeningRows}
        />
      )}
      {tab === "flash" && (
        <PositionLeaderboardView
          competitionLabel="Flash"
          rows={flashRows}
        />
      )}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        getRows={buildExportRows}
        questionTypes={questionTypes}
      />
    </div>
  );
}

function CategorySection({
  category, rows, questionTypes, showTrophy, isVisible,
}: {
  category: string;
  rows: LeaderboardRow[];
  questionTypes: QuestionType[];
  showTrophy: boolean;
  isVisible: (key: string) => boolean;
}) {
  const top = rows[0];
  return (
    <div
      data-export-section
      data-export-name={category}
      className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-[#F0EDE5] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">Category</div>
          <h2 className="font-serif text-lg sm:text-[20px] font-semibold text-[#1F1E1B] tracking-tight">{category}</h2>
        </div>
        <div className="sm:text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">
            {rows.length} {rows.length === 1 ? "student" : "students"}
          </div>
          {top && (
            <div className="text-[12px] text-[#4A4843]">
              Top: <span className="font-semibold text-[#1F1E1B]">{top.totalScore}</span>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tusgu-table">
          <thead>
            <tr>
              {isVisible("rank") && <th className="w-12">Rank</th>}
              {isVisible("name") && <th>Name</th>}
              {questionTypes.map((qt) =>
                isVisible(`qt-${qt.id}`) ? (
                  <th key={qt.id} className="text-right">{qt.name}</th>
                ) : null
              )}
              {isVisible("total") && <th className="text-right">Total</th>}
              {isVisible("percentage") && <th className="text-right">%</th>}
              {showTrophy && isVisible("trophy") && <th>Trophy</th>}
              {isVisible("dob") && <th>DOB</th>}
              {isVisible("age") && <th>Age</th>}
              {isVisible("centre") && <th>Centre</th>}
              {isVisible("teacher") && <th>Teacher</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id}>
                {isVisible("rank") && <td><RankBadge rank={r.rank} /></td>}
                {isVisible("name") && <td className="font-medium">{r.student.full_name}</td>}
                {questionTypes.map((qt) => {
                  if (!isVisible(`qt-${qt.id}`)) return null;
                  const cap = maxQuestionsFor(qt, r.student.category);
                  if (cap === 0) {
                    return (
                      <td key={qt.id} className="text-right text-[#A8A39B]">—</td>
                    );
                  }
                  const correct = r.scoresByType[qt.id] ?? 0;
                  const points = correct * qt.points_per_question;
                  return (
                    <td key={qt.id} className="text-right tabular-nums">
                      <span className="font-medium">{points}</span>
                      <span className="text-[10.5px] text-[#A8A39B] ml-1">({correct})</span>
                    </td>
                  );
                })}
                {isVisible("total") && (
                  <td className="text-right font-semibold tabular-nums">{r.totalScore}</td>
                )}
                {isVisible("percentage") && (
                  <td className="text-right text-[#7A7770] tabular-nums">
                    {r.percentage.toFixed(1)}%
                  </td>
                )}
                {showTrophy && isVisible("trophy") && (
                  <td>
                    {r.trophy ? (
                      <TrophyChip name={r.trophy.name} icon={r.trophy.icon} order={r.trophy.display_order} />
                    ) : (
                      <span className="text-[#A8A39B]">—</span>
                    )}
                  </td>
                )}
                {isVisible("dob") && (
                  <td className="text-[#7A7770]">{formatDate(r.student.dob)}</td>
                )}
                {isVisible("age") && <td className="text-[#4A4843]">{r.age ?? ""}</td>}
                {isVisible("centre") && (
                  <td className="text-[#4A4843]">{r.student.centre ?? ""}</td>
                )}
                {isVisible("teacher") && (
                  <td className="text-[#4A4843]">{r.student.teacher ?? ""}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PositionLeaderboardView({
  competitionLabel, rows,
}: {
  competitionLabel: string;
  rows: PositionLeaderboardRow[];
}) {
  const grouped = React.useMemo(() => {
    const m = new Map<string, PositionLeaderboardRow[]>();
    for (const r of rows) {
      if (!m.has(r.category)) m.set(r.category, []);
      m.get(r.category)!.push(r);
    }
    for (const v of m.values()) v.sort((a, b) => a.position - b.position);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  if (grouped.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState
          icon={Trophy}
          title={`No ${competitionLabel} entries yet`}
          description="Use the Live (L/F) page to enter positions for ranked students."
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {grouped.map(([cat, list]) => (
        <div
          key={cat}
          data-export-section
          data-export-name={`${competitionLabel}-${cat}`}
          className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden"
        >
          <div className="px-5 sm:px-6 py-4 border-b border-[#F0EDE5] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">
                {competitionLabel}
              </div>
              <h2 className="font-serif text-lg sm:text-[20px] font-semibold text-[#1F1E1B] tracking-tight">
                {cat}
              </h2>
            </div>
            <div className="text-[12px] text-[#4A4843]">
              {list.length} ranked
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="tusgu-table">
              <thead>
                <tr>
                  <th className="w-16">Position</th>
                  <th>Name</th>
                  <th>Trophy</th>
                  <th>Centre</th>
                  <th>Teacher</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.student.id}>
                    <td><RankBadge rank={r.position} /></td>
                    <td className="font-medium">{r.student.full_name}</td>
                    <td>
                      {r.trophy ? (
                        <TrophyChip
                          name={r.trophy.name}
                          icon={r.trophy.icon}
                          order={r.trophy.display_order}
                        />
                      ) : (
                        <span className="text-[#A8A39B]">—</span>
                      )}
                    </td>
                    <td className="text-[#4A4843]">{r.student.centre ?? ""}</td>
                    <td className="text-[#4A4843]">{r.student.teacher ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
  label, options, selected, onChange,
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
            {selected.length === 0 ? `All` : `${selected.length} selected`}
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

type ExportFormat = "xlsx" | "csv" | "pdf" | "jpeg" | "png";

function ExportModal({
  open, onClose, getRows, questionTypes,
}: {
  open: boolean;
  onClose: () => void;
  getRows: () => LeaderboardRow[];
  questionTypes: QuestionType[];
}) {
  const [format, setFormat] = React.useState<ExportFormat>("xlsx");
  const [hideScores, setHideScores] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      // Build fresh on every export so trophies are applied and ranks reflect
      // the latest score edits — never the stale on-page snapshot.
      const rows = getRows();
      if (format === "xlsx") {
        const buf = leaderboardToWorkbook(rows, questionTypes, { hideScores });
        downloadWorkbook(buf, `tusgu-leaderboard-${stamp}.xlsx`);
      } else if (format === "csv") {
        const csv = leaderboardToCsv(rows, questionTypes, { hideScores });
        downloadText(csv, `tusgu-leaderboard-${stamp}.csv`);
      } else if (format === "pdf") {
        const { leaderboardToPdf } = await import("@/lib/pdf");
        const buf = leaderboardToPdf(rows, questionTypes, { hideScores });
        const blob = new Blob([buf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tusgu-leaderboard-${stamp}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // jpeg / png — capture each on-page category section, bundle as a zip
        const els = document.querySelectorAll<HTMLElement>("[data-export-section]");
        if (els.length === 0) {
          toast.error("Nothing to capture — the leaderboard is empty.");
          return;
        }
        const [{ default: html2canvas }, { default: JSZip }] = await Promise.all([
          import("html2canvas-pro"),
          import("jszip"),
        ]);
        const zip = new JSZip();
        for (const el of Array.from(els)) {
          const baseName =
            el.dataset.exportName?.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "section";
          const canvas = await html2canvas(el, {
            backgroundColor: "#FFFFFF",
            scale: 2,
            useCORS: true,
          });
          const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Canvas to blob failed"))),
              format === "jpeg" ? "image/jpeg" : "image/png",
              format === "jpeg" ? 0.92 : undefined
            );
          });
          zip.file(`${baseName}.${format === "jpeg" ? "jpg" : "png"}`, blob);
        }
        const out = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tusgu-leaderboard-${format}-${stamp}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${els.length} image${els.length === 1 ? "" : "s"} exported`);
      }
      if (format === "xlsx" || format === "csv" || format === "pdf") toast.success("Export complete");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export leaderboard"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy}>{busy ? "Exporting…" : "Export"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Format</Label>
          <div className="grid grid-cols-2 gap-2">
            <FormatTile id="xlsx" current={format} setCurrent={setFormat} icon={<FileSpreadsheet className="w-4 h-4" />} title="Excel" sub=".xlsx workbook" />
            <FormatTile id="csv" current={format} setCurrent={setFormat} icon={<FileType className="w-4 h-4" />} title="CSV" sub="Plain text, opens in Excel" />
            <FormatTile id="pdf" current={format} setCurrent={setFormat} icon={<FileText className="w-4 h-4" />} title="PDF" sub="Print-ready" />
            <FormatTile id="jpeg" current={format} setCurrent={setFormat} icon={<ImageIcon className="w-4 h-4" />} title="JPEGs (zip)" sub="One per category" />
            <FormatTile id="png" current={format} setCurrent={setFormat} icon={<ImageIcon className="w-4 h-4" />} title="PNGs (zip)" sub="Lossless, larger" />
          </div>
        </div>
        {(format === "xlsx" || format === "csv" || format === "pdf") && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hideScores}
              onChange={(e) => setHideScores(e.target.checked)}
              className="mt-0.5 accent-[#1B3A6B]"
            />
            <span>
              <span className="text-[13px] font-medium text-[#1F1E1B] block">Hide individual scores</span>
              <span className="text-[11px] text-[#7A7770]">Useful for public-facing summaries.</span>
            </span>
          </label>
        )}
        {(format === "jpeg" || format === "png") && (
          <div className="text-[11.5px] text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3 leading-relaxed">
            Captures each category section currently on the page (apply trophies first if you want them visible). The images are bundled into a single .zip download.
          </div>
        )}
      </div>
    </Modal>
  );
}

function FormatTile({
  id, current, setCurrent, icon, title, sub,
}: {
  id: ExportFormat;
  current: ExportFormat;
  setCurrent: (v: ExportFormat) => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      onClick={() => setCurrent(id)}
      className={`text-left p-3 rounded-lg border transition-all ${
        active
          ? "border-[#1B3A6B] bg-[#F4F1E8] ring-[3px] ring-[#1B3A6B]/12"
          : "border-[#E8E3D7] hover:border-[#D9D2BE] bg-white"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={active ? "text-[#1B3A6B]" : "text-[#7A7770]"}>{icon}</span>
        <span className="text-[13px] font-semibold text-[#1F1E1B]">{title}</span>
      </div>
      <div className="text-[11px] text-[#7A7770]">{sub}</div>
    </button>
  );
}
