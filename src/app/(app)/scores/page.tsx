"use client";
import * as React from "react";
import {
  ClipboardList, Search, Save, Upload, Users, ScanLine, X, Download,
  FileSpreadsheet, FileText, FileType,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { BarcodeScannerModal } from "@/components/barcode-scanner";
import { ProtectedPage } from "@/lib/auth-gate";
import { maxQuestionsFor } from "@/lib/utils";
import {
  findStudentByCode, getStudentScores, listQuestionTypes, listScores,
  listStudents, listTrophyAllocations, listTrophyTypes, saveStudentScores,
} from "@/lib/data";
import {
  parseWorkbook, autoMapColumns, previewScoreImport, normalizeDob,
  type ParsedRow,
  downloadText, downloadWorkbook, leaderboardToCsv, leaderboardToWorkbook,
} from "@/lib/excel";
import { buildLeaderboard } from "@/lib/ranking";
import {
  saveStudentScores as saveScores, upsertStudent,
  bulkInsertStudentsReturning, bulkUpsertScores,
} from "@/lib/data";
import type {
  LeaderboardRow, QuestionType, Score, Student, StudentInsert,
  TrophyAllocation, TrophyType,
} from "@/lib/types";

export default function ScoresPage() {
  return (
    <ProtectedPage label="Scores">
      <ScoresInner />
    </ProtectedPage>
  );
}

function ScoresInner() {
  const [students, setStudents] = React.useState<Student[] | null>(null);
  const [questionTypes, setQuestionTypes] = React.useState<QuestionType[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  // Scores are tracked as raw string values so users can clear / re-type the
  // field without fighting a sticky leading 0. Numeric value is parsed on save.
  const [scoreText, setScoreText] = React.useState<Record<number, string>>({});
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);

  async function loadAll() {
    try {
      const [s, q] = await Promise.all([listStudents(), listQuestionTypes()]);
      setStudents(s);
      setQuestionTypes(q);
    } catch (e) {
      toast.error(asMsg(e, "Failed to load data"));
      setStudents([]);
    }
  }
  React.useEffect(() => {
    loadAll();
  }, []);

  React.useEffect(() => {
    if (selectedId == null) {
      setScoreText({});
      return;
    }
    getStudentScores(selectedId)
      .then((m) => {
        const text: Record<number, string> = {};
        for (const [k, v] of Object.entries(m)) text[Number(k)] = String(v ?? "");
        setScoreText(text);
      })
      .catch((e) => toast.error(asMsg(e, "Failed to load scores")));
  }, [selectedId]);

  const allCategories = React.useMemo(
    () => Array.from(new Set((students ?? []).map((s) => s.category ?? "").filter(Boolean))).sort(),
    [students]
  );

  const filtered = React.useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (categoryFilter.length > 0 && !categoryFilter.includes(s.category ?? "")) return false;
      if (q) {
        return [s.full_name, s.student_code, s.exam_code, s.barcode, s.category, s.centre, s.teacher]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
  }, [students, search, categoryFilter]);

  const selected = students?.find((s) => s.id === selectedId) ?? null;
  const selectedCategory = selected?.category ?? null;

  // value field stores the raw count of correct answers; display total
  // multiplies each by the question type's points_per_question.
  const total = questionTypes.reduce((sum, qt) => {
    const v = parseInt(scoreText[qt.id] ?? "", 10);
    return sum + (Number.isFinite(v) ? v : 0) * qt.points_per_question;
  }, 0);
  const max = questionTypes.reduce(
    (sum, q) => sum + q.points_per_question * maxQuestionsFor(q, selectedCategory),
    0
  );
  const pct = max > 0 ? (total / max) * 100 : 0;

  async function save() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const out: Record<number, number> = {};
      for (const qt of questionTypes) {
        const raw = scoreText[qt.id] ?? "";
        const n = raw === "" ? 0 : parseInt(raw, 10);
        const cap = maxQuestionsFor(qt, selectedCategory);
        out[qt.id] = Math.max(0, Math.min(cap, Number.isFinite(n) ? n : 0));
      }
      await saveStudentScores(selectedId, out);
      toast.success("Scores saved");
    } catch (e) {
      toast.error(asMsg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleScan(code: string) {
    setSearch(code);
    try {
      const found = await findStudentByCode(code);
      if (found) {
        setSelectedId(found.id);
        toast.success(`Selected ${found.full_name}`);
      } else {
        toast.error(`No student matching "${code}"`);
      }
    } catch (e) {
      toast.error(asMsg(e, "Lookup failed"));
    }
  }

  return (
    <div>
      <PageHeader
        title="Scores"
        description="Search by name, scan a barcode, or import scores in bulk. Each question type has a max — entries are clamped automatically."
        actions={
          <>
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Scan</span>
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Bulk Import</span>
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </>
        }
      />

      {students == null ? (
        <TableSkeleton rows={6} cols={3} />
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7]">
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Add students first before entering scores."
            action={<Button onClick={() => (window.location.href = "/students")}>Go to Students</Button>}
          />
        </div>
      ) : questionTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7]">
          <EmptyState
            icon={ClipboardList}
            title="No question types yet"
            description="Create question types in Setup before entering scores."
            action={<Button onClick={() => (window.location.href = "/setup")}>Go to Setup</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6">
          <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-[#E8E3D7] space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A39B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students…"
                  className="pl-9 pr-10"
                />
                <button
                  onClick={() => setScannerOpen(true)}
                  title="Scan barcode"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#7A7770] hover:bg-[#F4F1E8] hover:text-[#1B3A6B]"
                >
                  <ScanLine className="w-4 h-4" />
                </button>
              </div>
              <CategoryMultiSelect
                allCategories={allCategories}
                selected={categoryFilter}
                onChange={setCategoryFilter}
              />
            </div>
            <ul className="max-h-[60vh] lg:max-h-[600px] overflow-y-auto">
              {filtered.slice(0, 200).map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-3 sm:px-4 py-3 border-b border-[#E8E3D7] transition-colors ${
                      selectedId === s.id ? "bg-[#F4F1E8]" : "hover:bg-[#F5F2EB]"
                    }`}
                  >
                    <div className="text-sm font-medium text-[#1F1E1B] truncate">{s.full_name}</div>
                    <div className="text-xs text-[#7A7770] mt-0.5 truncate">
                      {[s.category, s.centre].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[#7A7770]">No matches</li>
              )}
              {filtered.length > 200 && (
                <li className="px-4 py-2 text-center text-[11px] text-[#A8A39B]">
                  Showing first 200 — refine your search to see more.
                </li>
              )}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
            {selected == null ? (
              <EmptyState
                icon={ClipboardList}
                title="Select a student"
                description="Pick a student on the left or scan a barcode."
              />
            ) : (
              <div>
                <div className="px-4 sm:px-6 py-4 border-b border-[#E8E3D7] flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base sm:text-lg font-bold text-[#1F1E1B] truncate">
                      {selected.full_name}
                    </h2>
                    <div className="text-[12px] sm:text-sm text-[#7A7770] mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {selected.category && <span>{selected.category}</span>}
                      {selected.centre && <span>· {selected.centre}</span>}
                      {selected.teacher && <span>· {selected.teacher}</span>}
                      {selected.exam_code && (
                        <span className="font-mono text-[#1B3A6B]">{selected.exam_code}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-[#7A7770] hover:text-[#1F1E1B] -mr-1 -mt-1 p-1.5"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {questionTypes.map((qt) => {
                    const raw = scoreText[qt.id] ?? "";
                    const n = parseInt(raw, 10);
                    const correct = Number.isFinite(n) ? n : 0;
                    const cap = maxQuestionsFor(qt, selectedCategory);
                    const points = correct * qt.points_per_question;
                    const maxPoints = qt.points_per_question * cap;
                    if (cap === 0) {
                      // Question type isn't part of this category's competition
                      // (e.g. Multiplication / Division for A1).
                      return (
                        <div key={qt.id} className="opacity-60">
                          <Label>
                            {qt.name}{" "}
                            <span className="text-xs text-[#7A7770] font-normal">
                              (not applicable for {selectedCategory})
                            </span>
                          </Label>
                          <div className="h-9 w-full rounded-md border border-[#E8E3D7] bg-[#F5F2EB] flex items-center px-3 text-[12px] text-[#7A7770]">
                            —
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={qt.id}>
                        <Label>
                          {qt.name}{" "}
                          <span className="text-xs text-[#7A7770] font-normal">
                            (correct out of {cap})
                          </span>
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={cap}
                          value={raw}
                          placeholder="0"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              setScoreText((m) => ({ ...m, [qt.id]: "" }));
                              return;
                            }
                            const num = parseInt(v, 10);
                            if (!Number.isFinite(num)) return;
                            const clamped = Math.max(0, Math.min(cap, num));
                            setScoreText((m) => ({ ...m, [qt.id]: String(clamped) }));
                          }}
                        />
                        <div className="text-[11px] text-[#7A7770] mt-1 tabular-nums">
                          = <span className="font-semibold text-[#1F1E1B]">{points}</span> /{" "}
                          {maxPoints} pts ({qt.points_per_question} per question)
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 sm:px-6 py-5 border-t border-[#E8E3D7] bg-[#FAF9F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#7A7770] uppercase tracking-wide">Total Score</div>
                    <div className="text-2xl sm:text-3xl font-bold text-[#1B3A6B]">
                      {total}{" "}
                      <span className="text-sm sm:text-base text-[#7A7770] font-normal">/ {max}</span>
                    </div>
                    <div className="text-xs text-[#7A7770] mt-1">{pct.toFixed(1)}%</div>
                  </div>
                  <Button onClick={save} disabled={busy} size="lg" className="w-full sm:w-auto">
                    <Save className="w-4 h-4" />
                    {busy ? "Saving…" : "Save Scores"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ScoreImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        students={students ?? []}
        questionTypes={questionTypes}
        onComplete={loadAll}
      />
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={handleScan}
      />
      <ScoresExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

// =============================================================
// Export modal — same options as Leaderboard (xlsx / csv / pdf / images)
// but pulls fresh data with trophies applied so the Trophy column is
// populated regardless of any on-screen toggle.
// =============================================================

type ExportFormat = "xlsx" | "csv" | "pdf" | "jpeg" | "png";

function ScoresExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = React.useState<ExportFormat>("xlsx");
  const [hideScores, setHideScores] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function buildRows(): Promise<{ rows: LeaderboardRow[]; questionTypes: QuestionType[] }> {
    const [students, scores, qts, trophyTypes, trophyAllocations]: [
      Student[], Score[], QuestionType[], TrophyType[], TrophyAllocation[]
    ] = await Promise.all([
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
    return { rows, questionTypes: qts };
  }

  async function run() {
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const { rows, questionTypes } = await buildRows();
      if (rows.length === 0) {
        toast.error("Nothing to export — no students yet.");
        return;
      }
      if (format === "xlsx") {
        downloadWorkbook(
          leaderboardToWorkbook(rows, questionTypes, { hideScores }),
          `tusgu-scores-${stamp}.xlsx`
        );
      } else if (format === "csv") {
        downloadText(
          leaderboardToCsv(rows, questionTypes, { hideScores }),
          `tusgu-scores-${stamp}.csv`
        );
      } else if (format === "pdf") {
        const { leaderboardToPdf } = await import("@/lib/pdf");
        const buf = leaderboardToPdf(rows, questionTypes, { hideScores });
        downloadBuf(buf, `tusgu-scores-${stamp}.pdf`, "application/pdf");
      } else {
        // jpeg / png — capture each on-page student card. There isn't an
        // export-section per student in this view, so for image exports we
        // fall back to capturing the visible scoring panel.
        const els = document.querySelectorAll<HTMLElement>("[data-export-section]");
        if (els.length === 0) {
          toast.error("Image export needs at least one visible scoring panel. Pick a student first.");
          return;
        }
        const [{ default: html2canvas }, { default: JSZip }] = await Promise.all([
          import("html2canvas-pro"),
          import("jszip"),
        ]);
        const zip = new JSZip();
        for (const el of Array.from(els)) {
          const name = el.dataset.exportName?.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "section";
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
          zip.file(`${name}.${format === "jpeg" ? "jpg" : "png"}`, blob);
        }
        const out = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tusgu-scores-${format}-${stamp}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("Export complete");
      onClose();
    } catch (e) {
      console.error("[scores.export]", e);
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Export scores"
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
            <Tile id="xlsx"  current={format} setCurrent={setFormat} icon={<FileSpreadsheet className="w-4 h-4" />} title="Excel" sub=".xlsx workbook" />
            <Tile id="csv"   current={format} setCurrent={setFormat} icon={<FileType className="w-4 h-4" />}        title="CSV" sub="Plain text" />
            <Tile id="pdf"   current={format} setCurrent={setFormat} icon={<FileText className="w-4 h-4" />}        title="PDF" sub="Print-ready" />
            <Tile id="jpeg"  current={format} setCurrent={setFormat} icon={<FileSpreadsheet className="w-4 h-4" />} title="JPEGs (zip)" sub="One per visible panel" />
            <Tile id="png"   current={format} setCurrent={setFormat} icon={<FileSpreadsheet className="w-4 h-4" />} title="PNGs (zip)" sub="Lossless" />
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
              <span className="text-[11px] text-[#7A7770]">Show only name / rank / trophy.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function Tile({
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

function downloadBuf(buf: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ScoreImportModal({
  open, onClose, students, questionTypes, onComplete,
}: {
  open: boolean;
  onClose: () => void;
  students: Student[];
  questionTypes: QuestionType[];
  onComplete: () => void;
}) {
  const [stage, setStage] = React.useState<"pick" | "map" | "done">("pick");
  const [data, setData] = React.useState<{
    headers: string[];
    rows: ParsedRow[];
    rowCount: number;
    sheetName: string;
    sheets: { name: string; rowCount: number }[];
    fileName: string;
  } | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [mapping, setMapping] = React.useState<{
    name: string | null;
    code: string | null;
    types: Record<number, string | null>;
    student: {
      full_name: string | null;
      dob: string | null;
      category: string | null;
      centre: string | null;
      teacher: string | null;
      student_code: string | null;
      exam_code: string | null;
      gender: string | null;
      email: string | null;
      phone: string | null;
    };
  }>({
    name: null,
    code: null,
    types: {},
    student: {
      full_name: null, dob: null, category: null, centre: null, teacher: null,
      student_code: null, exam_code: null, gender: null, email: null, phone: null,
    },
  });
  // When ON: any row that doesn't match an existing student becomes a NEW
  // student record. Useful when the user uploads the master list with score
  // columns added — students+scores import in one shot.
  const [createMissing, setCreateMissing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ phase: string; done: number; total: number } | null>(null);
  const [result, setResult] = React.useState<{
    created: number;
    matched: number;
    upserted: number;
    invalid: number;
    samples: { row: number; reason: string }[];
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // If the DB has no students AND the user hasn't enabled createMissing, the
  // import literally cannot succeed — every row would be skipped. Auto-flip
  // the toggle the first time the modal opens against an empty DB so the
  // user gets a useful import out of the box.
  React.useEffect(() => {
    if (open && students.length === 0 && !createMissing) {
      setCreateMissing(true);
    }
  }, [open, students.length, createMissing]);

  function reset() {
    setStage("pick");
    setData(null);
    setFile(null);
    setMapping({
      name: null, code: null, types: {},
      student: {
        full_name: null, dob: null, category: null, centre: null, teacher: null,
        student_code: null, exam_code: null, gender: null, email: null, phone: null,
      },
    });
    setResult(null);
  }

  async function pickFile(f: File) {
    setBusy(true);
    setFile(f);
    try {
      const wb = parseWorkbook(await f.arrayBuffer());
      const sheet = wb.best ?? wb.sheets[0];
      if (!sheet) {
        toast.error("Empty workbook");
        return;
      }
      const auto = autoMapColumns(sheet.headers);
      const types: Record<number, string | null> = {};
      for (const qt of questionTypes) {
        const lc = qt.name.toLowerCase();
        const matchedHeader = sheet.headers.find((h) =>
          h.toLowerCase().includes(lc) ||
          lc.split("/").some((part) => h.toLowerCase().includes(part.trim()))
        );
        types[qt.id] = matchedHeader ?? null;
      }
      setData({
        headers: sheet.headers,
        rows: sheet.rows,
        rowCount: sheet.rowCount,
        sheetName: sheet.sheetName,
        sheets: wb.sheets.map((s) => ({ name: s.sheetName, rowCount: s.rowCount })),
        fileName: f.name,
      });
      setMapping({
        name: auto.full_name ?? null,
        code: auto.exam_code ?? auto.student_code ?? auto.barcode ?? null,
        types,
        student: {
          full_name: auto.full_name ?? null,
          dob: auto.dob ?? null,
          category: auto.category ?? null,
          centre: auto.centre ?? null,
          teacher: auto.teacher ?? null,
          student_code: auto.student_code ?? null,
          exam_code: auto.exam_code ?? null,
          gender: auto.gender ?? null,
          email: auto.email ?? null,
          phone: auto.phone ?? null,
        },
      });
      setStage("map");
    } catch (e) {
      toast.error(asMsg(e, "Failed to parse file"));
    } finally {
      setBusy(false);
    }
  }

  async function selectSheet(name: string) {
    if (!file) return;
    setBusy(true);
    try {
      const wb = parseWorkbook(await file.arrayBuffer());
      const sheet = wb.sheets.find((s) => s.sheetName === name);
      if (!sheet) return;
      setData((d) => d ? { ...d, headers: sheet.headers, rows: sheet.rows, rowCount: sheet.rowCount, sheetName: name } : null);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Build the score rows for a given student id from a parsed sheet row,
   * clamping each value to the question type's max.
   */
  function scoresForRow(studentId: number, raw: ParsedRow): {
    student_id: number; question_type_id: number; value: number;
  }[] {
    const out: { student_id: number; question_type_id: number; value: number }[] = [];
    for (const [typeIdStr, col] of Object.entries(mapping.types)) {
      if (!col) continue;
      const v = Number(raw[col]);
      if (!Number.isFinite(v)) continue;
      const qt = questionTypes.find((q) => q.id === Number(typeIdStr));
      const max = qt ? qt.max_questions : Infinity;
      out.push({
        student_id: studentId,
        question_type_id: Number(typeIdStr),
        value: Math.max(0, Math.min(max, v)),
      });
    }
    return out;
  }

  async function commit() {
    if (!data) return;
    setBusy(true);
    setProgress({ phase: "Matching existing students", done: 0, total: data.rows.length });
    try {
      // ─────────────────────────────────────────────────────────────
      // Phase 1: match every row against existing students. This is
      // pure JS (no network), so it's fast even for 2.5k rows.
      // ─────────────────────────────────────────────────────────────
      const preview = previewScoreImport(data.rows, mapping, students, questionTypes);

      // ─────────────────────────────────────────────────────────────
      // Phase 2: for rows that didn't match an existing student, build
      // StudentInsert objects (if createMissing is on) and bulk-insert
      // them in one batched round trip. The previous code did 2,517
      // sequential POSTs ≈ 4–6 minutes. Batching cuts it to ~5 seconds.
      // ─────────────────────────────────────────────────────────────
      let created = 0;
      const stillInvalid: { row: number; reason: string }[] = [];
      const newStudentRows: { invIdx: number; insert: StudentInsert; rawRow: ParsedRow }[] = [];

      if (createMissing) {
        for (let i = 0; i < preview.invalid.length; i++) {
          const inv = preview.invalid[i];
          const raw = inv.raw;
          const get = (col: string | null) => (col ? String(raw[col] ?? "").trim() : "");
          const fullName = get(mapping.student.full_name) || get(mapping.name);
          if (!fullName) {
            stillInvalid.push({ row: inv.row, reason: "No name to create from" });
            continue;
          }
          const insert: StudentInsert = {
            student_code: get(mapping.student.student_code) || null,
            exam_code: get(mapping.student.exam_code) || get(mapping.code) || null,
            barcode: null,
            full_name: fullName,
            dob: normalizeDob(mapping.student.dob ? raw[mapping.student.dob] : ""),
            gender: get(mapping.student.gender) || null,
            category: get(mapping.student.category) || null,
            level: null,
            listening_category: null,
            listening_code: null,
            centre: get(mapping.student.centre) || null,
            teacher: get(mapping.student.teacher) || null,
            ci_code: null,
            tshirt_size: null,
            email: get(mapping.student.email) || null,
            phone: get(mapping.student.phone) || null,
            report_time: null,
            comp_time: null,
            deduction: null,
            notes: null,
            extra: {},
          };
          newStudentRows.push({ invIdx: i, insert, rawRow: raw });
        }
      } else {
        for (const inv of preview.invalid) {
          stillInvalid.push({ row: inv.row, reason: inv.reason });
        }
      }

      const insertedStudents: Student[] = [];
      if (newStudentRows.length > 0) {
        setProgress({
          phase: "Creating new students",
          done: 0,
          total: newStudentRows.length,
        });
        try {
          const inserted = await bulkInsertStudentsReturning(
            newStudentRows.map((r) => r.insert),
            (done, total) => setProgress({ phase: "Creating new students", done, total })
          );
          insertedStudents.push(...inserted);
          created = inserted.length;
        } catch (e) {
          // If bulk insert fails for any batch, mark all of them invalid.
          const msg = e instanceof Error ? e.message : "Couldn't create students";
          for (const r of newStudentRows) {
            stillInvalid.push({
              row: preview.invalid[r.invIdx].row,
              reason: `Couldn't create student: ${msg}`,
            });
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Phase 3: build the full list of score rows from BOTH the matched
      // students AND the newly inserted ones, then bulk-upsert in one
      // batched call. ~2.5k score rows = 5 round trips.
      // ─────────────────────────────────────────────────────────────
      const scoreRows: { student_id: number; question_type_id: number; value: number }[] = [];
      for (const r of preview.valid) {
        for (const [qid, value] of Object.entries(r.values)) {
          scoreRows.push({
            student_id: r.studentId,
            question_type_id: Number(qid),
            value,
          });
        }
      }
      // Walk the inserted students in the SAME order we sent them — Supabase
      // returns rows in insert order, so insertedStudents[i] corresponds to
      // newStudentRows[i].rawRow.
      for (let i = 0; i < insertedStudents.length; i++) {
        const newSt = insertedStudents[i];
        const raw = newStudentRows[i]?.rawRow;
        if (!raw) continue;
        scoreRows.push(...scoresForRow(newSt.id, raw));
      }

      let upserted = 0;
      if (scoreRows.length > 0) {
        setProgress({ phase: "Saving scores", done: 0, total: scoreRows.length });
        upserted = await bulkUpsertScores(scoreRows, (done, total) =>
          setProgress({ phase: "Saving scores", done, total })
        );
      }

      setProgress(null);
      setResult({
        created,
        matched: preview.valid.length,
        upserted,
        invalid: stillInvalid.length,
        samples: stillInvalid.slice(0, 10),
      });
      setStage("done");
      onComplete();
    } catch (e) {
      console.error("[scores.bulk-import] failed", e);
      toast.error(asMsg(e, "Import failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title="Bulk Import Scores"
      width="max-w-3xl"
      footer={
        stage === "pick" ? (
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        ) : stage === "map" ? (
          <>
            <Button variant="outline" onClick={() => { reset(); }} disabled={busy}>Back</Button>
            <Button onClick={commit} disabled={busy || !mapping.name}>
              {busy
                ? progress
                  ? `${progress.phase} (${progress.done}/${progress.total})`
                  : "Importing…"
                : "Import"}
            </Button>
          </>
        ) : (
          <Button onClick={() => { reset(); onClose(); }}>Done</Button>
        )
      }
    >
      {stage === "pick" && (
        <div className="space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) pickFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[#D9D2BE] hover:border-[#1B3A6B] hover:bg-[#F4F1E8] rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto text-[#A8A39B] mb-3" />
            <div className="text-sm font-medium text-[#1F1E1B] mb-1">Drop your scores Excel/.xlsm file here</div>
            <div className="text-xs text-[#7A7770]">or click to browse (.xlsx, .xlsm, .xls, .csv)</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
          </div>
          <div className="text-xs text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3">
            <strong className="text-[#1F1E1B]">Expected columns:</strong> Name (or Student Code / Exam Code / Barcode)
            and one column per question type matching the names in Setup.
          </div>
        </div>
      )}

      {stage === "map" && data && (
        <div className="space-y-4">
          {progress && (
            <div className="border border-[#1B3A6B]/20 bg-[#F4F1E8] rounded-md p-3">
              <div className="flex items-center justify-between text-[12.5px] text-[#1B3A6B] mb-2 font-medium">
                <span>{progress.phase}…</span>
                <span className="tabular-nums">
                  {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-white rounded overflow-hidden border border-[#E8E3D7]">
                <div
                  className="h-full bg-[#1B3A6B] transition-all"
                  style={{
                    width: `${progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="text-sm text-[#7A7770]">
            <span className="font-medium text-[#1F1E1B]">{data.fileName}</span> · sheet{" "}
            <span className="font-medium text-[#1F1E1B]">{data.sheetName}</span> ·{" "}
            <span className="font-medium text-[#1F1E1B]">{data.rowCount}</span> rows
          </div>
          {students.length === 0 && (
            <div className="text-[12px] text-[#B8651A] bg-[#FAF1E5] border border-[#F0DEB8] rounded-md p-3 leading-relaxed">
              <strong>The students table is empty.</strong> The "Also create missing students"
              option below has been turned on for you — every row in the sheet will be inserted
              as a new student before its scores are saved.
            </div>
          )}
          {data.sheets.length > 1 && (
            <div>
              <Label>Sheet</Label>
              <Select value={data.sheetName} onChange={(e) => selectSheet(e.target.value)}>
                {data.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} rows)
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Student Name *</Label>
              <Select
                value={mapping.name ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || null }))}
              >
                <option value="">— Select column —</option>
                {data.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Code (Exam / Student / Barcode)</Label>
              <Select
                value={mapping.code ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, code: e.target.value || null }))}
              >
                <option value="">— Not mapped —</option>
                {data.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="text-sm font-medium text-[#1F1E1B] mt-2">Score columns</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {questionTypes.map((qt) => (
              <div key={qt.id}>
                <Label>{qt.name}</Label>
                <Select
                  value={mapping.types[qt.id] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      types: { ...m.types, [qt.id]: e.target.value || null },
                    }))
                  }
                >
                  <option value="">— Skip —</option>
                  {data.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="border-t border-[#F0EDE5] pt-3 mt-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#1B3A6B]"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
              />
              <span>
                <span className="text-[13px] font-medium text-[#1F1E1B] block">
                  Also create missing students from this sheet
                </span>
                <span className="text-[11px] text-[#7A7770] block leading-relaxed">
                  Use this when the sheet is the master list with score columns added. Rows that
                  don&apos;t match an existing student will be inserted with the fields you map below,
                  then their scores are saved.
                </span>
              </span>
            </label>
          </div>

          {createMissing && (
            <div className="border border-[#E8E3D7] rounded-md p-3 space-y-3">
              <div className="text-[12px] uppercase tracking-wider text-[#7A7770]">
                Student field mapping (used only for newly created students)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StudentMap
                  label="Full Name *"
                  value={mapping.student.full_name}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, full_name: v } }))
                  }
                />
                <StudentMap
                  label="Date of Birth"
                  value={mapping.student.dob}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, dob: v } }))
                  }
                />
                <StudentMap
                  label="Category"
                  value={mapping.student.category}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, category: v } }))
                  }
                />
                <StudentMap
                  label="Centre"
                  value={mapping.student.centre}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, centre: v } }))
                  }
                />
                <StudentMap
                  label="Teacher"
                  value={mapping.student.teacher}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, teacher: v } }))
                  }
                />
                <StudentMap
                  label="Student Code"
                  value={mapping.student.student_code}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, student_code: v } }))
                  }
                />
                <StudentMap
                  label="Exam Code"
                  value={mapping.student.exam_code}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, exam_code: v } }))
                  }
                />
                <StudentMap
                  label="Gender"
                  value={mapping.student.gender}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, gender: v } }))
                  }
                />
                <StudentMap
                  label="Email"
                  value={mapping.student.email}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, email: v } }))
                  }
                />
                <StudentMap
                  label="Phone"
                  value={mapping.student.phone}
                  headers={data.headers}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, student: { ...m.student, phone: v } }))
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "done" && result && (
        <div className="space-y-4 py-2">
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="text-base font-semibold text-[#1F1E1B] mb-1">Import complete</div>
            <div className="text-sm text-[#7A7770]">
              {result.created > 0 && `${result.created} new student${result.created === 1 ? "" : "s"} created · `}
              {result.matched} matched · {result.upserted} score values written ·{" "}
              {result.invalid} skipped
            </div>
          </div>
          {result.invalid > 0 && (
            <div className="border border-[#F0DEB8] bg-[#FAF1E5] rounded-md p-3">
              <div className="text-[12.5px] font-medium text-[#7A4A0F] mb-1.5">
                Why rows were skipped
              </div>
              <ul className="text-[11.5px] text-[#7A4A0F] space-y-1 list-disc list-inside">
                {result.samples.map((s, i) => (
                  <li key={i}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
                {result.invalid > result.samples.length && (
                  <li className="list-none italic">
                    …and {result.invalid - result.samples.length} more.
                  </li>
                )}
              </ul>
              <div className="text-[11px] text-[#7A4A0F] mt-2 leading-relaxed">
                Tip: make sure the sheet has a column with student names <em>or</em> exam codes
                that match what&apos;s already in the database. Use the Code dropdown above to point
                at the right column.
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function asMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  return fallback;
}

function StudentMap({
  label, value, headers, onChange,
}: {
  label: string;
  value: string | null;
  headers: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] text-[#7A7770]">{label}</Label>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Not mapped —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </Select>
    </div>
  );
}

function CategoryMultiSelect({
  allCategories, selected, onChange,
}: {
  allCategories: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  if (allCategories.length === 0) return null;
  return (
    <details className="relative">
      <summary className="h-8 w-full rounded-md border border-[#E8E3D7] bg-[#FAF9F5] px-2.5 text-[12px] flex items-center justify-between cursor-pointer hover:border-[#D9D2BE] transition-colors list-none">
        <span className="text-[#1F1E1B]">
          {selected.length === 0 ? "All categories" : selected.length === 1 ? selected[0] : `${selected.length} categories`}
        </span>
        <span className="text-[#7A7770] text-[10px]">▼</span>
      </summary>
      <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-[#E8E3D7] rounded-md shadow-lg p-1.5">
        <div className="flex gap-1 px-1.5 py-1 border-b border-[#F0EDE5] mb-1">
          <button
            className="text-[11px] text-[#1B3A6B] hover:underline"
            onClick={() => onChange(allCategories)}
          >
            Select all
          </button>
          <span className="text-[#A8A39B]">·</span>
          <button
            className="text-[11px] text-[#7A7770] hover:underline"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
        {allCategories.map((c) => (
          <label key={c} className="flex items-center gap-2 px-2 py-1 hover:bg-[#F4F1E8] rounded cursor-pointer text-[12.5px]">
            <input
              type="checkbox"
              className="accent-[#1B3A6B]"
              checked={selected.includes(c)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, c] : selected.filter((x) => x !== c))
              }
            />
            <span className="truncate">{c}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
