"use client";
import * as React from "react";
import {
  ClipboardList, Search, Save, Upload, Users, ScanLine, X,
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
  findStudentByCode, getStudentScores, listQuestionTypes, listStudents,
  saveStudentScores,
} from "@/lib/data";
import {
  parseWorkbook, autoMapColumns, previewScoreImport,
  type ParsedRow,
} from "@/lib/excel";
import { saveStudentScores as saveScores } from "@/lib/data";
import type { QuestionType, Student } from "@/lib/types";

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
    </div>
  );
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
  }>({ name: null, code: null, types: {} });
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ matched: number; upserted: number; invalid: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setStage("pick");
    setData(null);
    setFile(null);
    setMapping({ name: null, code: null, types: {} });
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

  async function commit() {
    if (!data) return;
    setBusy(true);
    try {
      const preview = previewScoreImport(data.rows, mapping, students, questionTypes);
      let upserted = 0;
      for (const r of preview.valid) {
        await saveScores(r.studentId, r.values);
        upserted += Object.keys(r.values).length;
      }
      setResult({
        matched: preview.valid.length,
        upserted,
        invalid: preview.invalid.length,
      });
      setStage("done");
      onComplete();
    } catch (e) {
      toast.error(asMsg(e, "Import failed"));
    } finally {
      setBusy(false);
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
              {busy ? "Importing…" : "Import"}
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
          <div className="text-sm text-[#7A7770]">
            <span className="font-medium text-[#1F1E1B]">{data.fileName}</span> · sheet{" "}
            <span className="font-medium text-[#1F1E1B]">{data.sheetName}</span> ·{" "}
            <span className="font-medium text-[#1F1E1B]">{data.rowCount}</span> rows
          </div>
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
        </div>
      )}

      {stage === "done" && result && (
        <div className="text-center py-6">
          <div className="text-4xl mb-2">✓</div>
          <div className="text-base font-semibold text-[#1F1E1B] mb-1">Import complete</div>
          <div className="text-sm text-[#7A7770]">
            {result.matched} students matched · {result.upserted} score values written ·{" "}
            {result.invalid} rows skipped
          </div>
        </div>
      )}
    </Modal>
  );
}

function asMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  return fallback;
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
