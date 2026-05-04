"use client";
import * as React from "react";
import {
  Download, FileSpreadsheet, FileText, Database, AlertTriangle, Trash2, Users, Trophy,
  GraduationCap, ListChecks,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import {
  listQuestionTypes, listScores, listStudents, listTrophyAllocations, listTrophyTypes,
  wipeEverything, wipeScores, wipeStudents, wipeTrophyAllocations,
} from "@/lib/data";
import { buildLeaderboard } from "@/lib/ranking";
import {
  awardsToWorkbook, coachesToWorkbook, downloadWorkbook, fullRosterToWorkbook,
  leaderboardToWorkbook, studentsToWorkbook,
} from "@/lib/excel";
import type {
  LeaderboardRow, QuestionType, Score, Student, TrophyAllocation, TrophyType,
} from "@/lib/types";

type ExportId =
  | "students-basic"
  | "students-with-scores"
  | "leaderboard-scores"
  | "leaderboard-trophies"
  | "coaches";
type ExportFormat = "xlsx" | "pdf";

const EXPORTS: {
  id: ExportId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "students-basic",
    title: "Student roster",
    description: "Every student with name, DOB, gender, category, centre, teacher.",
    icon: Users,
  },
  {
    id: "students-with-scores",
    title: "Full student roster with scores",
    description: "All student fields plus per-question correct count and points.",
    icon: ListChecks,
  },
  {
    id: "leaderboard-scores",
    title: "Leaderboard with scores",
    description: "Ranked by category. Includes per-question scores, total, and percentage.",
    icon: Trophy,
  },
  {
    id: "leaderboard-trophies",
    title: "Leaderboard - trophies only (no scores)",
    description: "Only trophy winners, by category, alphabetical within each trophy band. Name / Trophy / Centre / Teacher.",
    icon: Trophy,
  },
  {
    id: "coaches",
    title: "Coaches leaderboard",
    description: "Trophy roll-up by Teacher (CI) and by Centre, sorted by total points.",
    icon: GraduationCap,
  },
];

export default function SyncPage() {
  return (
    <ProtectedPage label="Sync">
      <SyncInner />
    </ProtectedPage>
  );
}

function SyncInner() {
  const [busy, setBusy] = React.useState<string | null>(null);

  // Cache the heavy pulls so a user clicking through several formats doesn't
  // re-fetch every time.
  const cacheRef = React.useRef<{
    students?: Student[];
    scores?: Score[];
    questionTypes?: QuestionType[];
    trophyTypes?: TrophyType[];
    trophyAllocations?: TrophyAllocation[];
  }>({});

  async function ensureData() {
    const c = cacheRef.current;
    if (
      !c.students || !c.scores || !c.questionTypes ||
      !c.trophyTypes || !c.trophyAllocations
    ) {
      const [students, scores, qts, types, allocs] = await Promise.all([
        listStudents(),
        listScores(),
        listQuestionTypes(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      c.students = students;
      c.scores = scores;
      c.questionTypes = qts;
      c.trophyTypes = types;
      c.trophyAllocations = allocs;
    }
    return c as Required<typeof c>;
  }

  function scoresMap(scores: Score[]): Map<number, Record<number, number>> {
    const map = new Map<number, Record<number, number>>();
    for (const s of scores) {
      let m = map.get(s.student_id);
      if (!m) { m = {}; map.set(s.student_id, m); }
      m[s.question_type_id] = s.value;
    }
    return map;
  }

  async function buildLeaderboardRows(applyTrophies: boolean): Promise<{
    rows: LeaderboardRow[];
    questionTypes: QuestionType[];
  }> {
    const d = await ensureData();
    return {
      rows: buildLeaderboard({
        students: d.students,
        scores: d.scores,
        questionTypes: d.questionTypes,
        trophyTypes: d.trophyTypes,
        trophyAllocations: d.trophyAllocations,
        applyTrophies,
      }),
      questionTypes: d.questionTypes,
    };
  }

  function rollupCoaches(rows: LeaderboardRow[], mode: "teachers" | "centres") {
    type GroupRow = {
      key: string;
      centres?: Set<string>;
      studentCount: number;
      totalTrophies: number;
      totalPoints: number;
      trophyCounts: Record<number, number>;
    };
    const map = new Map<string, GroupRow>();
    for (const r of rows) {
      const key = (mode === "teachers" ? r.student.teacher : r.student.centre) ?? "(unknown)";
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          centres: mode === "teachers" ? new Set() : undefined,
          studentCount: 0,
          totalTrophies: 0,
          totalPoints: 0,
          trophyCounts: {},
        };
        map.set(key, g);
      }
      g.studentCount += 1;
      if (mode === "teachers" && r.student.centre) g.centres!.add(r.student.centre);
      if (r.trophy) {
        g.trophyCounts[r.trophy.id] = (g.trophyCounts[r.trophy.id] ?? 0) + 1;
        g.totalTrophies += 1;
        g.totalPoints += r.trophy.points ?? 0;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((g) => ({ ...g, centres: g.centres ? Array.from(g.centres) : undefined }));
  }

  async function run(id: ExportId, format: ExportFormat) {
    setBusy(`${id}-${format}`);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const d = await ensureData();

      if (id === "students-basic") {
        if (d.students.length === 0) {
          toast.error("No students to export");
          return;
        }
        if (format === "xlsx") {
          downloadWorkbook(studentsToWorkbook(d.students), `tusgu-students-${stamp}.xlsx`);
        } else {
          const { studentsToPdf } = await import("@/lib/pdf");
          downloadPdf(studentsToPdf(d.students), `tusgu-students-${stamp}.pdf`);
        }
      } else if (id === "students-with-scores") {
        if (d.students.length === 0) {
          toast.error("No students to export");
          return;
        }
        const map = scoresMap(d.scores);
        if (format === "xlsx") {
          downloadWorkbook(
            fullRosterToWorkbook(d.students, d.questionTypes, map),
            `tusgu-roster-with-scores-${stamp}.xlsx`
          );
        } else {
          const { studentsToPdf } = await import("@/lib/pdf");
          downloadPdf(
            studentsToPdf(d.students, {
              withScores: true,
              questionTypes: d.questionTypes,
              scoresByStudent: map,
              title: "Student Roster with Scores",
            }),
            `tusgu-roster-with-scores-${stamp}.pdf`
          );
        }
      } else if (id === "leaderboard-scores") {
        const { rows, questionTypes } = await buildLeaderboardRows(false);
        if (rows.length === 0) {
          toast.error("Leaderboard is empty");
          return;
        }
        if (format === "xlsx") {
          downloadWorkbook(
            leaderboardToWorkbook(rows, questionTypes),
            `tusgu-leaderboard-${stamp}.xlsx`
          );
        } else {
          const { leaderboardToPdf } = await import("@/lib/pdf");
          downloadPdf(
            leaderboardToPdf(rows, questionTypes),
            `tusgu-leaderboard-${stamp}.pdf`
          );
        }
      } else if (id === "leaderboard-trophies") {
        const { rows } = await buildLeaderboardRows(true);
        const winners = rows.filter((r) => r.trophy != null);
        if (winners.length === 0) {
          toast.error("No trophy winners yet — configure quantities on the Awards page first.");
          return;
        }
        if (format === "xlsx") {
          downloadWorkbook(
            awardsToWorkbook(rows),
            `tusgu-awards-${stamp}.xlsx`
          );
        } else {
          const { awardsToPdf } = await import("@/lib/pdf");
          downloadPdf(awardsToPdf(rows), `tusgu-awards-${stamp}.pdf`);
        }
      } else if (id === "coaches") {
        const { rows } = await buildLeaderboardRows(true);
        const teachers = rollupCoaches(rows, "teachers");
        const centres = rollupCoaches(rows, "centres");
        if (teachers.length === 0 && centres.length === 0) {
          toast.error("No coaches data yet");
          return;
        }
        if (format === "xlsx") {
          // Two sheets in one workbook: Teachers + Centres.
          const XLSX = await import("xlsx");
          const wb = XLSX.utils.book_new();
          if (teachers.length > 0) {
            const ws = sheetFromRows(XLSX, teachers, d.trophyTypes, "teachers");
            XLSX.utils.book_append_sheet(wb, ws, "Teachers");
          }
          if (centres.length > 0) {
            const ws = sheetFromRows(XLSX, centres, d.trophyTypes, "centres");
            XLSX.utils.book_append_sheet(wb, ws, "Centres");
          }
          const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
          downloadWorkbook(buf, `tusgu-coaches-${stamp}.xlsx`);
        } else {
          // Two-page PDF: page 1 teachers, page 2 centres.
          const { coachesToPdf } = await import("@/lib/pdf");
          // Generate teachers PDF then merge with centres into one — easiest
          // path: just build a single PDF with both tables. The simplest
          // approach: call coachesToPdf twice and download separately.
          if (teachers.length > 0) {
            downloadPdf(
              coachesToPdf(teachers, d.trophyTypes, "teachers", { title: "Teacher (CI) Leaderboard" }),
              `tusgu-teachers-${stamp}.pdf`
            );
          }
          if (centres.length > 0) {
            downloadPdf(
              coachesToPdf(centres, d.trophyTypes, "centres", { title: "Centre Leaderboard" }),
              `tusgu-centres-${stamp}.pdf`
            );
          }
        }
      }
      toast.success("Export complete");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sync"
        description="Five exports, in PDF or Excel. Click a tile to download."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {EXPORTS.map((ex) => {
          const Icon = ex.icon;
          return (
            <Card key={ex.id} padded={false}>
              <div className="p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#F4F1E8] flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#1B3A6B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-[15px] font-semibold text-[#1F1E1B] tracking-tight">{ex.title}</div>
                  <div className="text-[12px] text-[#7A7770] mt-0.5 leading-relaxed">{ex.description}</div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(ex.id, "xlsx")}
                      disabled={busy !== null}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {busy === `${ex.id}-xlsx` ? "Working…" : "Excel"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(ex.id, "pdf")}
                      disabled={busy !== null}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {busy === `${ex.id}-pdf` ? "Working…" : "PDF"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card padded={false} className="mb-6">
        <CardHeader title="Live database" icon={Database} />
        <div className="p-5 text-[13px] text-[#4A4843] leading-relaxed space-y-2">
          <p>
            All edits sync immediately to your Supabase project, so multiple staff can work in
            parallel without conflict. There is no manual &ldquo;sync&rdquo; step.
          </p>
          <p className="text-[#7A7770]">
            To import scores or students from a spreadsheet, use the <strong>Import</strong> button on the
            respective page — it handles .xlsx, .xlsm, .xls, and .csv files.
          </p>
        </div>
      </Card>

      <ResetCard />
    </div>
  );
}

// =============================================================
// Helper for building the coaches workbook sheets inline
// =============================================================

type GroupExportRow = {
  key: string;
  centres?: string[];
  studentCount: number;
  totalTrophies: number;
  totalPoints: number;
  trophyCounts: Record<number, number>;
};

type XlsxApi = typeof import("xlsx");

function sheetFromRows(
  XLSX: XlsxApi,
  rows: GroupExportRow[],
  trophyTypes: TrophyType[],
  mode: "teachers" | "centres"
) {
  const sorted = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);
  const subject = mode === "teachers" ? "Teacher" : "Centre";
  const data = rows.map((r, i) => {
    const out: Record<string, string | number> = { Rank: i + 1, [subject]: r.key };
    if (mode === "teachers") out["Centres"] = (r.centres ?? []).join(", ");
    out["Students"] = r.studentCount;
    for (const t of sorted) out[t.name] = r.trophyCounts[t.id] ?? 0;
    out["Total Trophies"] = r.totalTrophies;
    out["Total Points"] = r.totalPoints;
    return out;
  });
  return XLSX.utils.json_to_sheet(data);
}

function downloadPdf(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================
// Reset card (unchanged from previous version)
// =============================================================

type ResetMode = "scores" | "students" | "allocations" | "everything" | "cache";

function ResetCard() {
  const [mode, setMode] = React.useState<ResetMode | null>(null);

  const variants: Record<ResetMode, { title: string; description: string; warning: string; phrase: string }> = {
    scores: {
      title: "Clear all scores",
      description: "Remove every recorded score. Students, categories, question types, and trophies stay.",
      warning: "All score entries across every category will be permanently deleted.",
      phrase: "DELETE SCORES",
    },
    students: {
      title: "Clear students + scores",
      description: "Remove every student. Their scores cascade away too. Use this before importing a fresh master list.",
      warning: "All students and all of their scores will be permanently deleted.",
      phrase: "DELETE STUDENTS",
    },
    allocations: {
      title: "Clear trophy allocations",
      description: "Reset per-category trophy quantities to zero. Trophy types themselves are kept.",
      warning: "Every per-category quantity will be removed; you'll need to re-allocate before previewing winners again.",
      phrase: "RESET ALLOCATIONS",
    },
    everything: {
      title: "Clear everything",
      description: "Wipe students, scores, and trophy allocations. Keeps question types and trophy types so you can immediately re-import a new roster.",
      warning: "Students, scores, and trophy allocations will all be permanently deleted.",
      phrase: "WIPE EVERYTHING",
    },
    cache: {
      title: "Clear local cache",
      description: "Sign out of the protected pages on this device by clearing the unlock state. Doesn't touch the database.",
      warning: "You'll need to enter the password again to access Scores / Leaderboard / Awards / Setup / Sync on this browser.",
      phrase: "CLEAR CACHE",
    },
  };

  const rows: { mode: ResetMode; subtle?: boolean }[] = [
    { mode: "scores" },
    { mode: "students" },
    { mode: "allocations" },
    { mode: "everything" },
    { mode: "cache", subtle: true },
  ];

  return (
    <Card padded={false} className="border-[#F0DEB8]">
      <CardHeader title="Reset" icon={AlertTriangle} />
      <div className="p-5 space-y-3">
        <div className="text-[12px] text-[#B8651A] bg-[#FAF1E5] border border-[#F0DEB8] rounded p-3 leading-relaxed">
          These actions are <strong>permanent</strong> on the live database and affect everyone using
          the app. Each one asks for a typed confirmation before running.
        </div>
        {rows.map(({ mode: m, subtle }) => (
          <div key={m} className="flex items-start gap-3 py-2 border-b border-[#F0EDE5] last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-[#1F1E1B]">{variants[m].title}</div>
              <div className="text-[11.5px] text-[#7A7770]">{variants[m].description}</div>
            </div>
            <Button variant={subtle ? "outline" : "danger"} size="sm" onClick={() => setMode(m)}>
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        ))}
      </div>
      {mode && (
        <ConfirmWipeModal mode={mode} variant={variants[mode]} onClose={() => setMode(null)} />
      )}
    </Card>
  );
}

function ConfirmWipeModal({
  mode, variant, onClose,
}: {
  mode: ResetMode;
  variant: { title: string; warning: string; phrase: string };
  onClose: () => void;
}) {
  const [phrase, setPhrase] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      if (mode === "cache") {
        sessionStorage.clear();
        localStorage.removeItem("tusgu.unlocked");
        toast.success("Local cache cleared. Reloading…");
        setTimeout(() => window.location.reload(), 600);
        return;
      }
      if (mode === "scores") {
        const n = await wipeScores();
        toast.success(`Deleted ${n} score${n === 1 ? "" : "s"}`);
      } else if (mode === "students") {
        const n = await wipeStudents();
        toast.success(`Deleted ${n} student${n === 1 ? "" : "s"} (and their scores)`);
      } else if (mode === "allocations") {
        const n = await wipeTrophyAllocations();
        toast.success(`Deleted ${n} allocation${n === 1 ? "" : "s"}`);
      } else if (mode === "everything") {
        const r = await wipeEverything();
        toast.success(`Deleted ${r.students} students and ${r.allocations} allocations`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={variant.title}
      width="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy || phrase.trim().toUpperCase() !== variant.phrase}
            onClick={run}
          >
            {busy ? "Working…" : "Confirm"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[13px] text-[#1F1E1B] bg-[#FAEEE9] border border-[#F0CABE] rounded p-3 leading-relaxed">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-[#B8341A] shrink-0" />
            <div>{variant.warning}</div>
          </div>
        </div>
        <div>
          <div className="text-[12px] text-[#4A4843] mb-1.5">
            Type <code className="bg-white px-1 rounded border border-[#E8E3D7] font-mono text-[12px]">{variant.phrase}</code> to confirm:
          </div>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={variant.phrase}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}
