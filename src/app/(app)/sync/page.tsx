"use client";
import * as React from "react";
import {
  Download, FileSpreadsheet, FileText, Database,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import {
  listQuestionTypes, listScores, listStudents, listTrophyAllocations, listTrophyTypes,
} from "@/lib/data";
import { buildLeaderboard } from "@/lib/ranking";
import {
  downloadWorkbook, leaderboardToWorkbook, studentsToWorkbook,
} from "@/lib/excel";

export default function SyncPage() {
  return (
    <ProtectedPage label="Sync">
      <SyncInner />
    </ProtectedPage>
  );
}

function SyncInner() {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function exportStudents() {
    setBusy("students");
    try {
      const students = await listStudents();
      if (students.length === 0) {
        toast.error("No students to export");
        return;
      }
      downloadWorkbook(studentsToWorkbook(students), `tusgu-students-${stamp()}.xlsx`);
      toast.success(`Exported ${students.length} students`);
    } catch (e) {
      toast.error(asMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportLeaderboard(applyTrophies: boolean) {
    setBusy(applyTrophies ? "leaderboard-trophy" : "leaderboard");
    try {
      const [students, scores, qts, trophyTypes, trophyAllocations] = await Promise.all([
        listStudents(),
        listScores(),
        listQuestionTypes(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      const rows = buildLeaderboard({
        students, scores, questionTypes: qts, trophyTypes, trophyAllocations,
        applyTrophies,
      });
      downloadWorkbook(leaderboardToWorkbook(rows, qts), `tusgu-leaderboard-${stamp()}.xlsx`);
      toast.success(`Exported ${rows.length} rows`);
    } catch (e) {
      toast.error(asMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      const [students, scores, qts, trophyTypes, trophyAllocations] = await Promise.all([
        listStudents(),
        listScores(),
        listQuestionTypes(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      const rows = buildLeaderboard({
        students, scores, questionTypes: qts, trophyTypes, trophyAllocations,
        applyTrophies: true,
      });
      const { leaderboardToPdf } = await import("@/lib/pdf");
      const buf = leaderboardToPdf(rows, qts, {});
      const blob = new Blob([buf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tusgu-leaderboard-${stamp()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF generated");
    } catch (e) {
      toast.error(asMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sync"
        description="Export your competition data as Excel or PDF. To import, use the Import button on the Students or Scores page."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card padded={false}>
          <CardHeader title="Excel exports" icon={FileSpreadsheet} />
          <div className="p-5 space-y-3">
            <ExportRow
              title="Students roster"
              description="All students as an Excel workbook."
              onClick={exportStudents}
              busy={busy === "students"}
            />
            <ExportRow
              title="Leaderboard"
              description="Ranked listing per category, with all scores."
              onClick={() => exportLeaderboard(false)}
              busy={busy === "leaderboard"}
            />
            <ExportRow
              title="Leaderboard with trophies"
              description="As above, with trophy column populated."
              onClick={() => exportLeaderboard(true)}
              busy={busy === "leaderboard-trophy"}
            />
          </div>
        </Card>

        <Card padded={false}>
          <CardHeader title="PDF reports" icon={FileText} />
          <div className="p-5 space-y-3">
            <ExportRow
              title="Leaderboard PDF"
              description="Print-ready, one section per category, trophies highlighted."
              onClick={exportPdf}
              busy={busy === "pdf"}
            />
            <div className="text-[11.5px] text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3 leading-relaxed">
              Awards-style PDF (one section per trophy band) is available from the Awards page → Export PDF.
            </div>
          </div>
        </Card>

        <Card padded={false} className="md:col-span-2">
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
      </div>
    </div>
  );
}

function ExportRow({
  title, description, onClick, busy,
}: {
  title: string;
  description: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#F0EDE5] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-[#1F1E1B]">{title}</div>
        <div className="text-[11.5px] text-[#7A7770]">{description}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
        <Download className="w-3.5 h-3.5" />
        {busy ? "…" : "Download"}
      </Button>
    </div>
  );
}

function asMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Failed";
}
function stamp() {
  return new Date().toISOString().slice(0, 10);
}
