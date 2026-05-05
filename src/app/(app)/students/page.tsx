"use client";
import * as React from "react";
import {
  Plus, Pencil, Trash2, Upload, Users, Search, Download, ScanLine,
} from "lucide-react";
import { ColumnsMenu, useHiddenColumns } from "@/components/columns-menu";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { BarcodeScannerModal } from "@/components/barcode-scanner";
import { calculateAge, formatDate } from "@/lib/utils";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth, PasswordModal } from "@/lib/auth-gate";
import {
  bulkInsertStudents, deleteStudent, listStudents, updateStudent, upsertStudent,
} from "@/lib/data";
import type { Student, StudentInsert } from "@/lib/types";
import {
  autoMapColumns, downloadWorkbook, parseWorkbook, previewStudentImport,
  STUDENT_FIELDS, studentsToWorkbook, type ParsedRow, type StudentField,
} from "@/lib/excel";
import { STUDENT_FIELD_LABELS } from "@/lib/excel-types";

// Columns the table will display IF the data has at least one non-null value.
const TABLE_COLUMNS: { key: keyof Student; label: string; render?: (s: Student) => React.ReactNode }[] = [
  { key: "student_code", label: "Student Code" },
  { key: "exam_code", label: "Exam Code" },
  { key: "full_name", label: "Name", render: (s) => <span className="font-medium">{s.full_name}</span> },
  { key: "dob", label: "DOB", render: (s) => <span className="text-[#7A7770]">{formatDate(s.dob)}</span> },
  { key: "gender", label: "Gender" },
  { key: "category", label: "Category", render: (s) => s.category ? <CategoryChip value={s.category} /> : null },
  { key: "level", label: "Level" },
  { key: "centre", label: "Centre" },
  { key: "teacher", label: "Teacher" },
  { key: "listening_category", label: "Listening" },
  { key: "tshirt_size", label: "T-Shirt" },
  { key: "email", label: "Email", render: (s) => s.email ? <a href={`mailto:${s.email}`} className="text-[#1B3A6B] hover:underline">{s.email}</a> : null },
  { key: "phone", label: "Phone" },
];

export default function StudentsPage() {
  const [students, setStudents] = React.useState<Student[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const cols = useHiddenColumns("tusgu.students.hidden-columns");
  const [editing, setEditing] = React.useState<Student | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Student | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<null | (() => void)>(null);
  const [detailOf, setDetailOf] = React.useState<Student | null>(null);
  const { unlocked } = useAuth();

  async function load() {
    if (!SUPABASE_CONFIGURED) {
      setStudents([]);
      return;
    }
    try {
      const data = await listStudents();
      setStudents(data);
    } catch (e) {
      toast.error(asMsg(e, "Failed to load students"));
      setStudents([]);
    }
  }
  React.useEffect(() => {
    load();
  }, []);

  // Columns we COULD show (those with at least one populated row, or sensible defaults).
  const availableColumns = React.useMemo(() => {
    if (!students || students.length === 0) {
      return TABLE_COLUMNS.filter((c) =>
        ["full_name", "dob", "gender", "category", "centre", "teacher", "email"].includes(c.key as string)
      );
    }
    return TABLE_COLUMNS.filter((c) =>
      students.some((s) => {
        const v = s[c.key];
        return v != null && v !== "";
      })
    );
  }, [students]);

  // Columns the user actually wants on screen (after their hide toggle).
  const visibleColumns = React.useMemo(
    () => availableColumns.filter((c) => cols.isVisible(c.key as string)),
    [availableColumns, cols]
  );

  const filtered = React.useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [
        s.full_name,
        s.student_code,
        s.exam_code,
        s.barcode,
        s.category,
        s.centre,
        s.teacher,
        s.email,
        s.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [students, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  React.useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  function gateThen(action: () => void) {
    if (unlocked) {
      action();
    } else {
      setPendingAction(() => action);
    }
  }

  async function save(payload: Partial<StudentInsert>) {
    try {
      let createdName: string | null = null;
      if (editing) {
        await updateStudent(editing.id, payload);
        toast.success("Student updated");
      } else {
        const inserted = await upsertStudent({
          student_code: null, exam_code: null, barcode: null, full_name: "",
          dob: null, gender: null, category: null, level: null, listening_category: null,
          listening_code: null, listening_position: null, listening_trophy_id: null,
          flash_category: null, flash_position: null, flash_trophy_id: null,
          centre: null, teacher: null, ci_code: null, ci_category: null, franchisee_category: null,
          tshirt_size: null, email: null, phone: null, report_time: null,
          comp_time: null, deduction: null, notes: null, extra: {},
          ...payload,
        } as StudentInsert);
        createdName = inserted.full_name;
        toast.success(`Added "${inserted.full_name}"`);
      }
      setEditOpen(false);
      setEditing(null);
      await load();
      // Surface the new row immediately so the user sees confirmation: drop
      // the search filter onto the new name and jump to page 1 of those
      // results. Without this, a freshly added "Zaheer" lives on page 26 and
      // looks like the save silently failed.
      if (createdName) {
        setSearch(createdName);
        setPage(1);
      }
    } catch (e) {
      console.error("[students.save] failed", e);
      toast.error(asMsg(e, "Save failed"));
    }
  }

  async function doDelete(s: Student) {
    try {
      await deleteStudent(s.id);
      toast.success("Student deleted");
      load();
    } catch (e) {
      toast.error(asMsg(e, "Delete failed"));
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description="Search the roster, scan a barcode to find a student, or import the master list from Excel/.xlsm."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!students || students.length === 0) {
                  toast.error("No students to export");
                  return;
                }
                downloadWorkbook(studentsToWorkbook(students), `tusgu-students-${stamp()}.xlsx`);
              }}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button variant="outline" onClick={() => gateThen(() => setImportOpen(true))}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button
              onClick={() =>
                gateThen(() => {
                  setEditing(null);
                  setEditOpen(true);
                })
              }
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </>
        }
      />

      {!SUPABASE_CONFIGURED && <ConfigBanner />}

      <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
        <div className="px-3 sm:px-5 py-3 border-b border-[#E8E3D7] flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A39B]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, centre, teacher…"
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
          <div className="text-sm text-[#7A7770] sm:ml-auto">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          </div>
          <ColumnsMenu
            columns={availableColumns.map((c) => ({ key: c.key as string, label: c.label }))}
            hidden={cols.hidden}
            onToggle={cols.toggle}
            onResetAll={cols.reset}
          />
          <Select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-24"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </Select>
        </div>

        {students == null ? (
          <TableSkeleton rows={6} cols={visibleColumns.length + 1} />
        ) : students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Import your master Excel/.xlsm file or add a student manually."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={() => gateThen(() => setImportOpen(true))}>
                  <Upload className="w-4 h-4" /> Import
                </Button>
                <Button
                  onClick={() =>
                    gateThen(() => {
                      setEditing(null);
                      setEditOpen(true);
                    })
                  }
                >
                  <Plus className="w-4 h-4" /> Add
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
                    {visibleColumns.map((c) => (
                      <th key={String(c.key)}>{c.label}</th>
                    ))}
                    {visibleColumns.some((c) => c.key === "dob") && <th>Age</th>}
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setDetailOf(s)}
                      className="cursor-pointer"
                    >
                      {visibleColumns.map((c) => (
                        <td key={String(c.key)}>
                          {c.render
                            ? c.render(s)
                            : (s[c.key] as string | number | null) ?? ""}
                        </td>
                      ))}
                      {visibleColumns.some((c) => c.key === "dob") && (
                        <td>{calculateAge(s.dob) ?? ""}</td>
                      )}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              gateThen(() => {
                                setEditing(s);
                                setEditOpen(true);
                              })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => gateThen(() => setConfirmDelete(s))}>
                            <Trash2 className="w-3.5 h-3.5 text-[#B8341A]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 sm:px-5 py-3 border-t border-[#E8E3D7] flex items-center justify-between">
              <div className="text-xs text-[#7A7770]">
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
        onSave={save}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        title="Delete student?"
        message={`This deletes ${confirmDelete?.full_name} and all their score entries.`}
        confirmLabel="Delete"
        destructive
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onComplete={load} />
      <StudentDetailModal
        student={detailOf}
        onClose={() => setDetailOf(null)}
        onEdit={(s) =>
          gateThen(() => {
            setDetailOf(null);
            setEditing(s);
            setEditOpen(true);
          })
        }
      />
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(text) => {
          setSearch(text);
          toast.success(`Scanned: ${text}`);
        }}
      />
      <PasswordModal
        open={pendingAction !== null}
        label="Edit roster"
        onClose={() => setPendingAction(null)}
        onSuccess={() => {
          const fn = pendingAction;
          setPendingAction(null);
          fn?.();
        }}
      />
    </div>
  );
}

function CategoryChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#F4F1E8] text-[#1B3A6B] font-medium">
      {value}
    </span>
  );
}

function ConfigBanner() {
  return (
    <div className="mb-6 px-4 py-3 rounded-xl border border-[#F0DEB8] bg-[#FAF1E5] text-[#7A4A0F]">
      <div className="font-semibold text-sm mb-1">Supabase isn&apos;t configured</div>
      <div className="text-xs leading-relaxed">
        Set <code className="px-1 rounded bg-white/70">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="px-1 rounded bg-white/70">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
        <code className="px-1 rounded bg-white/70">.env.local</code> and restart the dev server. See README for the full
        setup guide.
      </div>
    </div>
  );
}

function StudentModal({
  open, onClose, editing, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: Student | null;
  onSave: (payload: Partial<StudentInsert>) => Promise<unknown>;
}) {
  const [fullName, setFullName] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [centre, setCentre] = React.useState("");
  const [teacher, setTeacher] = React.useState("");
  const [studentCode, setStudentCode] = React.useState("");
  const [examCode, setExamCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [listeningCategory, setListeningCategory] = React.useState("");
  const [flashCategory, setFlashCategory] = React.useState("");
  const [ciCategory, setCiCategory] = React.useState("");
  const [franchiseeCategory, setFranchiseeCategory] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setFullName(editing?.full_name ?? "");
    setDob(editing?.dob ?? "");
    setGender(editing?.gender ?? "");
    setCategory(editing?.category ?? "");
    setCentre(editing?.centre ?? "");
    setTeacher(editing?.teacher ?? "");
    setStudentCode(editing?.student_code ?? "");
    setExamCode(editing?.exam_code ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setListeningCategory(editing?.listening_category ?? "");
    setFlashCategory(editing?.flash_category ?? "");
    setCiCategory(editing?.ci_category ?? "");
    setFranchiseeCategory(editing?.franchisee_category ?? "");
  }, [editing, open]);

  async function submit() {
    if (!fullName.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await onSave({
        full_name: fullName.trim(),
        dob: dob || null,
        gender: gender.trim() || null,
        category: category.trim() || null,
        centre: centre.trim() || null,
        teacher: teacher.trim() || null,
        student_code: studentCode.trim() || null,
        exam_code: examCode.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        listening_category: listeningCategory.trim() || null,
        flash_category: flashCategory.trim() || null,
        ci_category: ciCategory.trim() || null,
        franchisee_category: franchiseeCategory.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  // Pressing Enter in any field saves the form (unless focus is in a textarea)
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !(e.target as HTMLElement).tagName.match(/^TEXTAREA$/i)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Student" : "Add Student"}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {editing ? "Save" : "Create"} <span className="text-[10px] opacity-60 ml-1">⏎</span>
          </Button>
        </>
      }
    >
      <div className="space-y-3" onKeyDown={onKeyDown}>
        <div>
          <Label>Full Name *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Student Fullname" autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Date of Birth</Label>
            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
          </div>
          <div>
            <Label>Category (Visual)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="A1, B2, Z3" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Listening Category</Label>
            <Input value={listeningCategory} onChange={(e) => setListeningCategory(e.target.value)} placeholder="Novice / Competent…" />
          </div>
          <div>
            <Label>Flash Category</Label>
            <Input value={flashCategory} onChange={(e) => setFlashCategory(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Centre</Label>
            <Input value={centre} onChange={(e) => setCentre(e.target.value)} />
          </div>
          <div>
            <Label>Teacher (CI Name)</Label>
            <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>CI Category</Label>
            <Input value={ciCategory} onChange={(e) => setCiCategory(e.target.value)} placeholder="Mid Career, Franchisees Who are CI's…" />
          </div>
          <div>
            <Label>Franchisee Category</Label>
            <Input value={franchiseeCategory} onChange={(e) => setFranchiseeCategory(e.target.value)} placeholder="Emerging, Mid Career…" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Student Code</Label>
            <Input value={studentCode} onChange={(e) => setStudentCode(e.target.value)} placeholder="SL-NP-…" />
          </div>
          <div>
            <Label>Exam Code (barcode)</Label>
            <Input value={examCode} onChange={(e) => setExamCode(e.target.value)} placeholder="VA3-039" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07x-xxx-xxxx" />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" />
        </div>
      </div>
    </Modal>
  );
}

// =============================================================
// Student detail modal — read-only view of every populated field
// =============================================================

function StudentDetailModal({
  student, onClose, onEdit,
}: {
  student: Student | null;
  onClose: () => void;
  onEdit: (s: Student) => void;
}) {
  if (!student) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={student.full_name}
      width="max-w-2xl"
      description={[student.category, student.centre, student.teacher].filter(Boolean).join(" · ") || undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(student)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <DetailGroup title="Identity">
          <DetailField label="Full Name" value={student.full_name} />
          <DetailField label="Student Code" value={student.student_code} />
          <DetailField label="Exam Code (barcode)" value={student.exam_code} mono />
          <DetailField label="Barcode" value={student.barcode} mono />
          <DetailField label="Date of Birth" value={formatDate(student.dob) || student.dob} />
          <DetailField label="Age" value={calculateAge(student.dob) ?? null} />
          <DetailField label="Gender" value={student.gender} />
        </DetailGroup>

        <DetailGroup title="Visual competition">
          <DetailField label="Category" value={student.category} />
          <DetailField label="Level" value={student.level} />
        </DetailGroup>

        <DetailGroup title="Listening competition">
          <DetailField label="Category" value={student.listening_category} />
          <DetailField label="Listening Code" value={student.listening_code} />
          <DetailField label="Position (legacy)" value={student.listening_position} />
        </DetailGroup>

        <DetailGroup title="Flash competition">
          <DetailField label="Category" value={student.flash_category} />
          <DetailField label="Position (legacy)" value={student.flash_position} />
        </DetailGroup>

        <DetailGroup title="Centre & teacher">
          <DetailField label="Centre" value={student.centre} />
          <DetailField label="Teacher (CI)" value={student.teacher} />
          <DetailField label="CI Code" value={student.ci_code} />
          <DetailField label="CI Category" value={student.ci_category} />
          <DetailField label="Franchisee Category" value={student.franchisee_category} />
        </DetailGroup>

        <DetailGroup title="Contact & logistics">
          <DetailField label="Email" value={student.email} />
          <DetailField label="Phone" value={student.phone} />
          <DetailField label="T-Shirt Size" value={student.tshirt_size} />
          <DetailField label="Report Time" value={student.report_time} />
          <DetailField label="Comp Time" value={student.comp_time} />
          <DetailField label="Deduction" value={student.deduction} />
        </DetailGroup>

        {student.extra && Object.keys(student.extra).length > 0 && (
          <DetailGroup title="Extra (unmapped columns from import)">
            {Object.entries(student.extra).map(([k, v]) => (
              <DetailField key={k} label={k} value={v == null ? null : String(v)} />
            ))}
          </DetailGroup>
        )}
      </div>
    </Modal>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  // Hide the group entirely if every child reports it has nothing to show.
  const arr = React.Children.toArray(children);
  const hasAny = arr.some((c) => {
    if (!React.isValidElement<{ value?: unknown }>(c)) return false;
    const v = c.props?.value;
    return v != null && v !== "";
  });
  if (!hasAny) return null;
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-[#7A7770] font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
        {children}
      </div>
    </section>
  );
}

function DetailField({
  label, value, mono,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline gap-2 border-b border-[#F0EDE5] py-1.5">
      <span className="text-[#7A7770] min-w-[8rem] shrink-0">{label}</span>
      <span className={`text-[#1F1E1B] font-medium ${mono ? "font-mono" : ""}`}>{String(value)}</span>
    </div>
  );
}

type ImportData = {
  fileName: string;
  sheets: { name: string; rowCount: number }[];
  selectedSheet: string;
  headers: string[];
  rows: ParsedRow[];
  mapping: Record<StudentField, string | null>;
};

function ImportModal({
  open, onClose, onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [stage, setStage] = React.useState<"pick" | "map" | "confirm" | "done">("pick");
  const [file, setFile] = React.useState<File | null>(null);
  const [data, setData] = React.useState<ImportData | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [duplicateMode, setDuplicateMode] = React.useState<"skip" | "overwrite">("skip");
  const [preview, setPreview] = React.useState<ReturnType<typeof previewStudentImport> | null>(null);
  const [result, setResult] = React.useState<{ inserted: number; updated: number; skipped: number; invalid: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setStage("pick");
    setFile(null);
    setData(null);
    setPreview(null);
    setResult(null);
  }

  async function pickFile(f: File) {
    setBusy(true);
    setFile(f);
    try {
      const buffer = await f.arrayBuffer();
      const wb = parseWorkbook(buffer);
      const best = wb.best ?? wb.sheets.find((s) => s.headers.length > 0) ?? wb.sheets[0];
      if (!best) {
        toast.error("Couldn't find any data in this workbook");
        return;
      }
      setData({
        fileName: f.name,
        sheets: wb.sheets.map((s) => ({ name: s.sheetName, rowCount: s.rowCount })),
        selectedSheet: best.sheetName,
        headers: best.headers,
        rows: best.rows,
        mapping: autoMapColumns(best.headers),
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
      const buffer = await file.arrayBuffer();
      const wb = parseWorkbook(buffer);
      const sheet = wb.sheets.find((s) => s.sheetName === name);
      if (!sheet) return;
      setData({
        fileName: file.name,
        sheets: wb.sheets.map((s) => ({ name: s.sheetName, rowCount: s.rowCount })),
        selectedSheet: name,
        headers: sheet.headers,
        rows: sheet.rows,
        mapping: autoMapColumns(sheet.headers),
      });
    } finally {
      setBusy(false);
    }
  }

  async function buildPreview() {
    if (!data) return;
    setBusy(true);
    try {
      const existing = SUPABASE_CONFIGURED ? await listStudents() : [];
      const p = previewStudentImport(data.rows, data.mapping, existing);
      setPreview(p);
      setStage("confirm");
    } catch (e) {
      toast.error(asMsg(e, "Preview failed"));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      if (preview.valid.length > 0) {
        inserted = await bulkInsertStudents(preview.valid);
      }
      if (duplicateMode === "overwrite") {
        for (const dup of preview.duplicates) {
          await updateStudent(dup.existingId, dup.data);
          updated++;
        }
      } else {
        skipped = preview.duplicates.length;
      }
      setResult({ inserted, updated, skipped, invalid: preview.invalid.length });
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
      title="Import Students"
      description="Drop your Excel/.xlsm file. The importer auto-detects columns and skips columns that don't apply."
      width="max-w-3xl"
      footer={
        stage === "pick" ? (
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        ) : stage === "map" ? (
          <>
            <Button variant="outline" onClick={() => { reset(); }} disabled={busy}>Back</Button>
            <Button onClick={buildPreview} disabled={busy}>Continue</Button>
          </>
        ) : stage === "confirm" ? (
          <>
            <Button variant="outline" onClick={() => setStage("map")} disabled={busy}>Back</Button>
            <Button onClick={commit} disabled={busy}>{busy ? "Importing…" : `Import ${preview?.valid.length ?? 0} students`}</Button>
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
            <div className="text-sm font-medium text-[#1F1E1B] mb-1">Drop your spreadsheet here</div>
            <div className="text-xs text-[#7A7770]">or click to browse — supports .xlsx, .xlsm, .xls, .csv</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
            {busy && <div className="text-xs text-[#7A7770] mt-3">Reading file…</div>}
          </div>
          <div className="text-xs text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3 leading-relaxed">
            The importer reads <strong>.xlsm</strong> macro workbooks the same as plain .xlsx — macros are
            ignored, sheet data is parsed normally. Columns like &ldquo;Student Fullname&rdquo;, &ldquo;Visual 2025
            Category&rdquo;, &ldquo;CI Name&rdquo;, &ldquo;Centre Name&rdquo;, &ldquo;Exam Code&rdquo; are auto-mapped. Anything else is preserved
            on each student record under <code>extra</code> so no data is lost.
          </div>
        </div>
      )}

      {stage === "map" && data && (
        <div className="space-y-4">
          <div className="text-sm text-[#7A7770]">
            <span className="font-medium text-[#1F1E1B]">{data.fileName}</span> · sheet{" "}
            <span className="font-medium text-[#1F1E1B]">{data.selectedSheet}</span> ·{" "}
            <span className="font-medium text-[#1F1E1B]">{data.rows.length}</span> rows
          </div>
          {data.sheets.length > 1 && (
            <div>
              <Label>Sheet</Label>
              <Select value={data.selectedSheet} onChange={(e) => selectSheet(e.target.value)}>
                {data.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} rows)
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Column mapping</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-1">
              {STUDENT_FIELDS.map((f) => (
                <div key={f}>
                  <Label className="text-[11px] text-[#7A7770]">{STUDENT_FIELD_LABELS[f]}</Label>
                  <Select
                    value={data.mapping[f] ?? ""}
                    onChange={(e) =>
                      setData({ ...data, mapping: { ...data.mapping, [f]: e.target.value || null } })
                    }
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
          </div>
          <details className="text-xs text-[#7A7770]">
            <summary className="cursor-pointer text-[#1F1E1B] font-medium mb-2">Preview first 5 rows</summary>
            <div className="overflow-x-auto mt-2 border border-[#E8E3D7] rounded">
              <table className="tusgu-table">
                <thead>
                  <tr>
                    {data.headers.slice(0, 12).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {data.headers.slice(0, 12).map((h) => (
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

      {stage === "confirm" && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Valid" value={preview.valid.length} color="text-[#5A8E54]" />
            <Stat label="Duplicates" value={preview.duplicates.length} color="text-[#B8651A]" />
            <Stat label="Invalid" value={preview.invalid.length} color="text-[#B8341A]" />
          </div>
          {preview.duplicates.length > 0 && (
            <div className="border border-[#F0DEB8] bg-[#FAF1E5] rounded p-3">
              <div className="text-sm font-medium text-[#1F1E1B] mb-2">Duplicates (matched by student code, exam code, or name + DOB)</div>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={duplicateMode === "skip"} onChange={() => setDuplicateMode("skip")} />
                  Skip
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={duplicateMode === "overwrite"} onChange={() => setDuplicateMode("overwrite")} />
                  Overwrite
                </label>
              </div>
            </div>
          )}
          {preview.invalid.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[#B8341A] font-medium">
                {preview.invalid.length} invalid rows will be skipped
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-[#7A7770] space-y-1 list-disc list-inside">
                {preview.invalid.slice(0, 30).map((iv, i) => (
                  <li key={i}>Row {iv.row}: {iv.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {stage === "done" && result && (
        <div className="text-center py-6">
          <div className="text-4xl mb-2">✓</div>
          <div className="text-base font-semibold text-[#1F1E1B] mb-1">Import complete</div>
          <div className="text-sm text-[#7A7770]">
            {result.inserted} added · {result.updated} updated · {result.skipped} skipped · {result.invalid} invalid
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[#7A7770] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function asMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  return fallback;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}
