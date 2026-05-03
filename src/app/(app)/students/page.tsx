"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Upload, Users, Search, Download } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { calculateAge, formatDate } from "@/lib/utils";
import type { Category, StudentWithCategory } from "@/lib/types";
import { STUDENT_FIELDS, type StudentField } from "@/lib/excel-types";

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithCategory[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StudentWithCategory | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StudentWithCategory | null>(null);

  async function load() {
    const [s, c] = await Promise.all([
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]);
    setStudents(s);
    setCategories(c);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.first_name, s.last_name, s.centre, s.teacher, s.category_name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [students, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  async function save(payload: Omit<StudentWithCategory, "id" | "category_name" | "created_at">) {
    const url = editing ? `/api/students/${editing.id}` : "/api/students";
    const method = editing ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || "Save failed");
    toast.success(editing ? "Student updated" : "Student added");
    setEditOpen(false);
    setEditing(null);
    load();
  }

  async function doDelete(s: StudentWithCategory) {
    const r = await fetch(`/api/students/${s.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Delete failed");
    toast.success("Student deleted");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description="Import students from Excel or add them manually. Each student belongs to one competition category."
        actions={
          <>
            <Button variant="outline" onClick={() => window.open("/api/export/students", "_blank")}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              Import Excel
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Student
            </Button>
          </>
        }
      />

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, centre, teacher, category…"
              className="pl-9"
            />
          </div>
          <div className="text-sm text-[#64748B] ml-auto">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          </div>
          <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-24">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </Select>
        </div>

        {students == null ? (
          <TableSkeleton rows={6} cols={7} />
        ) : students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Add your first student or import from Excel."
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4" /> Import Excel
                </Button>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setEditOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> Add Student
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tusgu-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Age</th>
                    <th>Category</th>
                    <th>Centre</th>
                    <th>Teacher</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">
                        {s.first_name} {s.last_name}
                      </td>
                      <td className="text-[#64748B]">{formatDate(s.dob)}</td>
                      <td>{calculateAge(s.dob)}</td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#EFF6FF] text-[#1B3A6B]">
                          {s.category_name}
                        </span>
                      </td>
                      <td>{s.centre}</td>
                      <td>{s.teacher}</td>
                      <td>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(s);
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(s)}>
                            <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[#E2E8F0] flex items-center justify-between">
              <div className="text-xs text-[#64748B]">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <StudentModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        editing={editing}
        categories={categories}
        onSave={save}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        title="Delete student?"
        message={`This will delete ${confirmDelete?.first_name} ${confirmDelete?.last_name} and all their score entries.`}
        confirmLabel="Delete"
        destructive
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onComplete={load} />
    </div>
  );
}

function StudentModal({
  open,
  onClose,
  editing,
  categories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: StudentWithCategory | null;
  categories: Category[];
  onSave: (payload: Omit<StudentWithCategory, "id" | "category_name" | "created_at">) => Promise<unknown>;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [centre, setCentre] = useState("");
  const [teacher, setTeacher] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFirst(editing?.first_name ?? "");
    setLast(editing?.last_name ?? "");
    setDob(editing?.dob ?? "");
    setCategoryId(editing?.category_id ?? (categories[0]?.id ?? ""));
    setCentre(editing?.centre ?? "");
    setTeacher(editing?.teacher ?? "");
  }, [editing, open, categories]);

  async function submit() {
    if (!first || !last || !dob || !categoryId || !centre || !teacher) {
      return toast.error("All fields are required");
    }
    setBusy(true);
    try {
      await onSave({
        first_name: first,
        last_name: last,
        dob,
        category_id: Number(categoryId),
        centre,
        teacher,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Student" : "Add Student"}
      width="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      {categories.length === 0 ? (
        <div className="text-sm text-[#D97706] bg-amber-50 border border-amber-200 rounded p-3">
          You need to create at least one category in Setup before adding students.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name *</Label>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date of Birth *</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Centre *</Label>
              <Input value={centre} onChange={(e) => setCentre(e.target.value)} />
            </div>
            <div>
              <Label>Teacher *</Label>
              <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

type ImportPreview = {
  headers: string[];
  mapping: Record<StudentField, string | null>;
  rowCount: number;
  rows: Record<string, unknown>[];
  preview: {
    valid: unknown[];
    invalid: { row: number; reason: string }[];
    duplicates: { row: number; existingId: number; data: { first_name: string; last_name: string } }[];
  };
};

function ImportModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "map" | "confirm" | "done">("pick");
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<StudentField, string | null>>({
    first_name: null,
    last_name: null,
    dob: null,
    category: null,
    centre: null,
    teacher: null,
  });
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite">("skip");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; invalid: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setStage("pick");
    setFile(null);
    setData(null);
    setResult(null);
    setMapping({ first_name: null, last_name: null, dob: null, category: null, centre: null, teacher: null });
  }

  async function uploadFile(f: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/students/import", { method: "POST", body: fd });
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
    if (!data) return;
    // re-preview client-side based on adjusted mapping
    setBusy(true);
    try {
      const r = await fetch("/api/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: data.rows, mapping, duplicateMode }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Import failed");
        return;
      }
      setResult(d);
      setStage("done");
      onComplete();
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
      title="Import Students from Excel"
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
            <Button onClick={() => setStage("confirm")} disabled={busy}>
              Continue
            </Button>
          </>
        ) : stage === "confirm" ? (
          <>
            <Button variant="outline" onClick={() => setStage("map")} disabled={busy}>
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
              if (f) {
                setFile(f);
                uploadFile(f);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] hover:bg-[#EFF6FF] rounded-lg p-10 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto text-[#94A3B8] mb-3" />
            <div className="text-sm font-medium text-[#0F172A] mb-1">Drop your Excel file here</div>
            <div className="text-xs text-[#64748B]">or click to browse (.xlsx, .xls)</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  uploadFile(f);
                }
              }}
            />
            {file && <div className="text-xs text-[#64748B] mt-3">{file.name}</div>}
          </div>
          <div className="text-xs text-[#64748B] bg-slate-50 border border-[#E2E8F0] rounded p-3">
            <strong className="text-[#0F172A]">Expected columns:</strong> First Name, Last Name, Date of Birth, Category,
            Centre, Teacher. Column names don&apos;t need to match exactly — they&apos;ll be auto-detected and you can adjust the
            mapping in the next step.
          </div>
        </div>
      )}

      {stage === "map" && data && (
        <div className="space-y-4">
          <div className="text-sm text-[#64748B]">
            Detected <strong className="text-[#0F172A]">{data.rowCount}</strong> rows. Confirm column mapping:
          </div>
          <div className="grid grid-cols-2 gap-3">
            {STUDENT_FIELDS.map((f) => (
              <div key={f}>
                <Label>{labelFor(f)}</Label>
                <Select
                  value={mapping[f] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || null }))}
                >
                  <option value="">— Not mapped —</option>
                  {data.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <details className="text-xs text-[#64748B]">
            <summary className="cursor-pointer text-[#0F172A] font-medium mb-2">Preview first 5 rows</summary>
            <div className="overflow-x-auto mt-2 border border-[#E2E8F0] rounded">
              <table className="tusgu-table">
                <thead>
                  <tr>
                    {data.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {data.headers.map((h) => (
                        <td key={h}>{String(r[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {stage === "confirm" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Valid" value={data.preview.valid.length} color="text-[#16A34A]" />
            <Stat label="Duplicates" value={data.preview.duplicates.length} color="text-[#D97706]" />
            <Stat label="Invalid" value={data.preview.invalid.length} color="text-[#DC2626]" />
          </div>
          {data.preview.duplicates.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded p-3">
              <div className="text-sm font-medium text-[#0F172A] mb-2">Duplicates detected (matched on name + DOB)</div>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={duplicateMode === "skip"}
                    onChange={() => setDuplicateMode("skip")}
                  />
                  Skip duplicates
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={duplicateMode === "overwrite"}
                    onChange={() => setDuplicateMode("overwrite")}
                  />
                  Overwrite existing
                </label>
              </div>
            </div>
          )}
          {data.preview.invalid.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[#DC2626] font-medium">
                {data.preview.invalid.length} invalid rows will be skipped
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-[#64748B] space-y-1 list-disc list-inside">
                {data.preview.invalid.slice(0, 30).map((iv, i) => (
                  <li key={i}>
                    Row {iv.row}: {iv.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="text-xs text-[#64748B]">
            Categories not yet present will be created automatically.
          </div>
        </div>
      )}

      {stage === "done" && result && (
        <div className="text-center py-6">
          <div className="text-4xl mb-2">✓</div>
          <div className="text-base font-semibold text-[#0F172A] mb-1">Import complete</div>
          <div className="text-sm text-[#64748B]">
            {result.inserted} added · {result.updated} updated · {result.skipped} skipped · {result.invalid} invalid
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-50 border border-[#E2E8F0] rounded p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[#64748B] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function labelFor(f: StudentField): string {
  const map: Record<StudentField, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    dob: "Date of Birth",
    category: "Category",
    centre: "Centre",
    teacher: "Teacher",
  };
  return map[f] + " *";
}
