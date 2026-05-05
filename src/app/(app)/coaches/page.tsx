"use client";
import * as React from "react";
import { GraduationCap, Building2, Download, FileSpreadsheet, FileType } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import { ColumnsMenu, useHiddenColumns } from "@/components/columns-menu";
import {
  listQuestionTypes, listScores, listStudents, listTrophyAllocations, listTrophyTypes,
} from "@/lib/data";
import { buildLeaderboard } from "@/lib/ranking";
import { downloadText, downloadWorkbook } from "@/lib/excel";
import * as XLSX from "xlsx";
import type { LeaderboardRow, TrophyType } from "@/lib/types";

type Tab = "teachers" | "centres";

type GroupRow = {
  key: string;        // teacher / centre name
  centres?: Set<string>; // teacher tab only
  totalPoints: number;
  studentCount: number;
  trophyCounts: Record<number, number>; // trophy_type_id -> count
  totalTrophies: number;
};

export default function CoachesPage() {
  return (
    <ProtectedPage label="Coaches">
      <CoachesInner />
    </ProtectedPage>
  );
}

function CoachesInner() {
  const [tab, setTab] = React.useState<Tab>("teachers");
  const [rows, setRows] = React.useState<LeaderboardRow[] | null>(null);
  const [trophyTypes, setTrophyTypes] = React.useState<TrophyType[]>([]);
  const [search, setSearch] = React.useState("");
  const [minPoints, setMinPoints] = React.useState("");
  // Per-tab column prefs so users can hide e.g. specific trophy columns.
  const cols = useHiddenColumns(`tusgu.coaches.${tab}.hidden-columns`);

  async function load() {
    try {
      const [students, scores, qts, types, allocs] = await Promise.all([
        listStudents(),
        listScores(),
        listQuestionTypes(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      setTrophyTypes(types);
      setRows(
        buildLeaderboard({
          students,
          scores,
          questionTypes: qts,
          trophyTypes: types,
          trophyAllocations: allocs,
          applyTrophies: true,
        })
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load coaches data");
    }
  }
  React.useEffect(() => { load(); }, []);

  const grouped = React.useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, GroupRow>();
    for (const r of rows) {
      const key = (tab === "teachers" ? r.student.teacher : r.student.centre) ?? "(unknown)";
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          centres: tab === "teachers" ? new Set() : undefined,
          totalPoints: 0,
          studentCount: 0,
          trophyCounts: {},
          totalTrophies: 0,
        };
        map.set(key, g);
      }
      g.studentCount += 1;
      if (tab === "teachers" && r.student.centre) g.centres?.add(r.student.centre);
      if (r.trophy) {
        g.trophyCounts[r.trophy.id] = (g.trophyCounts[r.trophy.id] ?? 0) + 1;
        g.totalTrophies += 1;
        g.totalPoints += r.trophy.points ?? 0;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [rows, tab]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = parseFloat(minPoints);
    return grouped.filter((g) => {
      if (q && !g.key.toLowerCase().includes(q)) return false;
      if (Number.isFinite(min) && g.totalPoints < min) return false;
      return true;
    });
  }, [grouped, search, minPoints]);

  const sortedTrophies = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);

  function exportData(format: "xlsx" | "csv") {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const headers = [tab === "teachers" ? "Teacher (CI)" : "Centre"];
    if (tab === "teachers") headers.push("Centres", "Students");
    else headers.push("Students");
    for (const t of sortedTrophies) headers.push(t.name);
    headers.push("Total trophies", "Total points");

    const data = filtered.map((g) => {
      const arr: (string | number)[] = [g.key];
      if (tab === "teachers") arr.push(Array.from(g.centres ?? []).join(", "));
      arr.push(g.studentCount);
      for (const t of sortedTrophies) arr.push(g.trophyCounts[t.id] ?? 0);
      arr.push(g.totalTrophies, g.totalPoints);
      return arr;
    });

    if (format === "csv") {
      const lines = [headers, ...data].map((row) =>
        row.map((c) => csvEscape(String(c ?? ""))).join(",")
      );
      downloadText(lines.join("\n"), `tusgu-${tab}-points-${stamp}.csv`);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tab === "teachers" ? "Teachers" : "Centres");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      downloadWorkbook(buf, `tusgu-${tab}-points-${stamp}.xlsx`);
    }
    toast.success("Export complete");
  }

  return (
    <div>
      <PageHeader
        title="CI & Centre Points"
        description="Trophy points roll up by Teacher (CI) and by Centre. Edit point values per trophy on the Setup page."
        actions={
          <>
            <div className="flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
              {(["teachers", "centres"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors ${
                    tab === t ? "bg-[#1B3A6B] text-white" : "text-[#4A4843] hover:bg-[#F5F2EB]"
                  }`}
                >
                  {t === "teachers" ? "Teachers" : "Centres"}
                </button>
              ))}
            </div>
            <ColumnsMenu
              columns={[
                { key: "rank", label: "Rank" },
                { key: "subject", label: tab === "teachers" ? "Teacher" : "Centre" },
                ...(tab === "teachers" ? [{ key: "centres", label: "Centres" }] : []),
                { key: "students", label: "Students" },
                ...sortedTrophies.map((t) => ({ key: `trophy-${t.id}`, label: t.name })),
                { key: "trophies-total", label: "Total trophies" },
                { key: "points-total", label: "Total points" },
              ]}
              hidden={cols.hidden}
              onToggle={cols.toggle}
              onResetAll={cols.reset}
            />
            <Button variant="outline" size="sm" onClick={() => exportData("xlsx")}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">xlsx</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData("csv")}>
              <FileType className="w-3.5 h-3.5" /> <span className="hidden sm:inline">csv</span>
            </Button>
          </>
        }
      />

      <Card padded={false}>
        <CardHeader
          title={tab === "teachers" ? "Teacher leaderboard" : "Centre leaderboard"}
          icon={tab === "teachers" ? GraduationCap : Building2}
          actions={
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${tab === "teachers" ? "teacher" : "centre"}…`}
                className="h-8 w-44"
              />
              <Input
                type="number"
                value={minPoints}
                onChange={(e) => setMinPoints(e.target.value)}
                placeholder="min pts"
                className="h-8 w-24 text-right"
              />
            </div>
          }
        />
        {rows == null ? (
          <TableSkeleton rows={8} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={tab === "teachers" ? GraduationCap : Building2}
            title="No data yet"
            description="Apply trophies on the Awards page first, then come back here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tusgu-table">
              <thead>
                <tr>
                  {cols.isVisible("rank") && <th className="w-12">Rank</th>}
                  {cols.isVisible("subject") && (
                    <th>{tab === "teachers" ? "Teacher (CI)" : "Centre"}</th>
                  )}
                  {tab === "teachers" && cols.isVisible("centres") && <th>Centres</th>}
                  {cols.isVisible("students") && <th className="text-right">Students</th>}
                  {sortedTrophies.map((t) =>
                    cols.isVisible(`trophy-${t.id}`) ? (
                      <th key={t.id} className="text-right">
                        <span className="block text-[10px] text-[#A8A39B] font-normal">{t.points} pts</span>
                        <span>{t.name.replace("Runner Up", "RU")}</span>
                      </th>
                    ) : null
                  )}
                  {cols.isVisible("trophies-total") && <th className="text-right">Total trophies</th>}
                  {cols.isVisible("points-total") && <th className="text-right">Total points</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => (
                  <tr key={g.key}>
                    {cols.isVisible("rank") && (
                      <td>
                        <span className={`inline-flex items-center justify-center min-w-[26px] h-[24px] px-1.5 rounded text-[12px] font-semibold tabular-nums ${
                          i < 3 ? "bg-[#1B3A6B] text-white" : "text-[#1F1E1B]"
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                    )}
                    {cols.isVisible("subject") && <td className="font-medium">{g.key}</td>}
                    {tab === "teachers" && cols.isVisible("centres") && (
                      <td className="text-[12px] text-[#7A7770] truncate max-w-xs">
                        {Array.from(g.centres ?? []).slice(0, 3).join(", ")}
                        {(g.centres?.size ?? 0) > 3 ? `, +${(g.centres?.size ?? 0) - 3} more` : ""}
                      </td>
                    )}
                    {cols.isVisible("students") && (
                      <td className="text-right tabular-nums">{g.studentCount}</td>
                    )}
                    {sortedTrophies.map((t) =>
                      cols.isVisible(`trophy-${t.id}`) ? (
                        <td key={t.id} className="text-right tabular-nums">
                          {g.trophyCounts[t.id] ? (
                            <span className="font-medium">{g.trophyCounts[t.id]}</span>
                          ) : (
                            <span className="text-[#A8A39B]">—</span>
                          )}
                        </td>
                      ) : null
                    )}
                    {cols.isVisible("trophies-total") && (
                      <td className="text-right font-semibold tabular-nums">{g.totalTrophies}</td>
                    )}
                    {cols.isVisible("points-total") && (
                      <td className="text-right font-bold tabular-nums text-[#1B3A6B]">{g.totalPoints}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
