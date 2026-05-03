"use client";
import * as React from "react";
import {
  Download, FileSpreadsheet, FileText, Database, AlertTriangle, Trash2,
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

        <ResetCard />
      </div>
    </div>
  );
}

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
    <Card padded={false} className="md:col-span-2 border-[#F0DEB8]">
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
            <Button
              variant={subtle ? "outline" : "danger"}
              size="sm"
              onClick={() => setMode(m)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        ))}
      </div>
      {mode && (
        <ConfirmWipeModal
          mode={mode}
          variant={variants[mode]}
          onClose={() => setMode(null)}
        />
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
