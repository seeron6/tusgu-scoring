"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Search, Save, Upload, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import type { QuestionType, StudentWithCategory } from "@/lib/types";

export default function ScoresPage() {
  const [students, setStudents] = useState<StudentWithCategory[] | null>(null);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function loadAll() {
    const [s, q] = await Promise.all([
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/question-types").then((r) => r.json()),
    ]);
    setStudents(s);
    setQuestionTypes(q);
  }
  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setScores({});
      return;
    }
    fetch(`/api/scores/${selectedId}`)
      .then((r) => r.json())
      .then(setScores);
  }, [selectedId]);

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.category_name} ${s.centre} ${s.teacher}`.toLowerCase().includes(q)
    );
  }, [students, search]);

  const selected = students?.find((s) => s.id === selectedId) ?? null;
  const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
  const max = questionTypes.reduce((sum, q) => sum + q.points_per_question * q.max_questions, 0);
  const pct = max > 0 ? (total / max) * 100 : 0;

  async function save() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/scores/${selectedId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(d.error || "Save failed");
      toast.success("Scores saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scores"
        description="Enter scores by question type for each student. Bulk import from Excel for large competitions."
        actions={
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            Bulk Import
          </Button>
        }
      />

      {students == null ? (
        <TableSkeleton rows={6} cols={3} />
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm">
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Add students first before entering scores."
            action={
              <Button onClick={() => (window.location.href = "/students")}>Go to Students</Button>
            }
          />
        </div>
      ) : questionTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm">
          <EmptyState
            icon={ClipboardList}
            title="No question types yet"
            description="Create question types in Setup before entering scores."
            action={<Button onClick={() => (window.location.href = "/setup")}>Go to Setup</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8E3D7]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A39B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students…"
                  className="pl-9"
                />
              </div>
            </div>
            <ul className="max-h-[600px] overflow-y-auto">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[#E8E3D7] transition-colors ${
                      selectedId === s.id ? "bg-[#F4F1E8]" : "hover:bg-[#F5F2EB]"
                    }`}
                  >
                    <div className="text-sm font-medium text-[#1F1E1B]">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="text-xs text-[#7A7770] mt-0.5">
                      {s.category_name} · {s.centre}
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[#7A7770]">No matches</li>
              )}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
            {selected == null ? (
              <EmptyState
                icon={ClipboardList}
                title="Select a student"
                description="Pick a student on the left to enter or edit their scores."
              />
            ) : (
              <div>
                <div className="px-6 py-4 border-b border-[#E8E3D7]">
                  <h2 className="text-lg font-bold text-[#1F1E1B]">
                    {selected.first_name} {selected.last_name}
                  </h2>
                  <div className="text-sm text-[#7A7770] mt-1">
                    {selected.category_name} · {selected.centre} · Teacher: {selected.teacher}
                  </div>
                </div>
                <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {questionTypes.map((qt) => {
                    const maxQt = qt.points_per_question * qt.max_questions;
                    const v = scores[qt.id] ?? 0;
                    return (
                      <div key={qt.id}>
                        <Label>
                          {qt.name}{" "}
                          <span className="text-xs text-[#7A7770] font-normal">(max {maxQt})</span>
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={maxQt}
                          value={v}
                          onChange={(e) => {
                            const n = Math.max(0, Math.min(maxQt, parseInt(e.target.value || "0", 10)));
                            setScores((m) => ({ ...m, [qt.id]: Number.isFinite(n) ? n : 0 }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-5 border-t border-[#E8E3D7] bg-[#FAF9F5] flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#7A7770] uppercase tracking-wide">Total Score</div>
                    <div className="text-3xl font-bold text-[#1B3A6B]">
                      {total}{" "}
                      <span className="text-base text-[#7A7770] font-normal">/ {max}</span>
                    </div>
                    <div className="text-xs text-[#7A7770] mt-1">{pct.toFixed(1)}%</div>
                  </div>
                  <Button onClick={save} disabled={busy} size="lg">
                    <Save className="w-4 h-4" />
                    {busy ? "Saving…" : "Save Scores"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ScoreImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

type ImportData = {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mapping: { name: string | null; dob: string | null; types: Record<number, string | null> };
  questionTypes: QuestionType[];
};

function ScoreImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<"pick" | "map" | "done">("pick");
  const [data, setData] = useState<ImportData | null>(null);
  const [mapping, setMapping] = useState<{ name: string | null; dob: string | null; types: Record<number, string | null> }>({
    name: null,
    dob: null,
    types: {},
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ upserted: number; matched: number; invalid: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setStage("pick");
    setData(null);
    setResult(null);
    setMapping({ name: null, dob: null, types: {} });
  }

  async function upload(f: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/scores/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Failed to parse file");
        return;
      }
      setData(d);
      setMapping(d.mapping);
      setStage("map");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!data || !mapping.name) {
      toast.error("Please choose the student name column");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/scores/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: data.rows, mapping }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Import failed");
        return;
      }
      setResult(d);
      setStage("done");
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
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
        ) : stage === "map" ? (
          <>
            <Button variant="outline" onClick={() => setStage("pick")} disabled={busy}>
              Back
            </Button>
            <Button onClick={commit} disabled={busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </Button>
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
              if (f) upload(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[#D9D2BE] hover:border-[#1B3A6B] hover:bg-[#F4F1E8] rounded-lg p-10 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto text-[#A8A39B] mb-3" />
            <div className="text-sm font-medium text-[#1F1E1B] mb-1">Drop your scores Excel file here</div>
            <div className="text-xs text-[#7A7770]">or click to browse (.xlsx, .xls)</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </div>
          <div className="text-xs text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3">
            <strong className="text-[#1F1E1B]">Expected columns:</strong> a Name column (full name as
            <code className="bg-white px-1 mx-1 rounded">First Last</code>), optionally Date of Birth (helps disambiguate
            duplicate names), and one column per question type matching the names in Setup.
          </div>
        </div>
      )}

      {stage === "map" && data && (
        <div className="space-y-4">
          <div className="text-sm text-[#7A7770]">
            Detected <strong className="text-[#1F1E1B]">{data.rowCount}</strong> rows.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Student Name *</Label>
              <Select
                value={mapping.name ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || null }))}
              >
                <option value="">— Select column —</option>
                {data.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Date of Birth (optional)</Label>
              <Select
                value={mapping.dob ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, dob: e.target.value || null }))}
              >
                <option value="">— Not mapped —</option>
                {data.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="text-sm font-medium text-[#1F1E1B] mt-2">Score columns</div>
          <div className="grid grid-cols-2 gap-3">
            {data.questionTypes.map((qt) => (
              <div key={qt.id}>
                <Label>{qt.name}</Label>
                <Select
                  value={mapping.types[qt.id] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, types: { ...m.types, [qt.id]: e.target.value || null } }))
                  }
                >
                  <option value="">— Skip —</option>
                  {data.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
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
            {result.matched} students matched · {result.upserted} score values written · {result.invalid} rows skipped
          </div>
        </div>
      )}
    </Modal>
  );
}
