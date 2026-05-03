"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Layers, Calculator } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import type { Category, QuestionType } from "@/lib/types";

export default function SetupPage() {
  return (
    <div>
      <PageHeader
        title="Setup"
        description="Configure competition categories and the mental math question types used for scoring."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoriesCard />
        <QuestionTypesCard />
      </div>
    </div>
  );
}

function CategoriesCard() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  async function load() {
    const r = await fetch("/api/categories");
    setItems(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function save(name: string, description: string) {
    if (!name.trim()) return toast.error("Name is required");
    const url = editing ? `/api/categories/${editing.id}` : "/api/categories";
    const method = editing ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || "Save failed");
    toast.success(editing ? "Category updated" : "Category added");
    setEditOpen(false);
    setEditing(null);
    load();
  }

  async function doDelete(c: Category) {
    const r = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error || "Delete failed");
    toast.success("Category deleted");
    load();
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#1B3A6B]" />
          <h2 className="text-sm font-semibold text-[#0F172A]">Competition Categories</h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setEditOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Add Category
        </Button>
      </div>
      {items == null ? (
        <TableSkeleton rows={3} cols={2} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No categories yet"
          description="Create your first competition category (e.g. Junior, Senior)."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setEditOpen(true);
              }}
            >
              <Plus className="w-4 h-4" /> Add Category
            </Button>
          }
        />
      ) : (
        <table className="tusgu-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td className="text-[#64748B]">{c.description || "—"}</td>
                <td>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(c);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(c)}>
                      <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CategoryModal
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
        title="Delete category?"
        message={`This will delete "${confirmDelete?.name}". You cannot delete a category with students assigned.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function CategoryModal({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  onSave: (name: string, description: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  useEffect(() => {
    setName(editing?.name ?? "");
    setDesc(editing?.description ?? "");
  }, [editing, open]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Category" : "Add Category"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name, desc);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Junior, Senior, Open" />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  );
}

function QuestionTypesCard() {
  const [items, setItems] = useState<QuestionType[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuestionType | null>(null);

  async function load() {
    const r = await fetch("/api/question-types");
    setItems(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function save(name: string, points: number, max: number) {
    if (!name.trim()) return toast.error("Name is required");
    const payload = { name: name.trim(), points_per_question: points, max_questions: max };
    const url = editing ? `/api/question-types/${editing.id}` : "/api/question-types";
    const method = editing ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || "Save failed");
    toast.success(editing ? "Question type updated" : "Question type added");
    setEditOpen(false);
    setEditing(null);
    load();
  }

  async function doDelete(qt: QuestionType) {
    const r = await fetch(`/api/question-types/${qt.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return toast.error(d.error || "Delete failed");
    }
    toast.success("Question type deleted");
    load();
  }

  const totalMax = items?.reduce((sum, q) => sum + q.points_per_question * q.max_questions, 0) ?? 0;

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#1B3A6B]" />
          <h2 className="text-sm font-semibold text-[#0F172A]">Question Types (Mental Math)</h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setEditOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Add Type
        </Button>
      </div>
      {items == null ? (
        <TableSkeleton rows={4} cols={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No question types yet"
          description="Add the question types used in your competition (Addition, Multiplication, etc.)."
        />
      ) : (
        <>
          <table className="tusgu-table">
            <thead>
              <tr>
                <th>Question Type</th>
                <th>Points Each</th>
                <th>Max Questions</th>
                <th>Max Score</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td className="font-medium">{q.name}</td>
                  <td>{q.points_per_question}</td>
                  <td>{q.max_questions}</td>
                  <td className="font-semibold">{q.points_per_question * q.max_questions}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(q);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(q)}>
                        <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-[#EFF6FF] border-t border-[#E2E8F0] text-sm flex items-center justify-between">
            <span className="text-[#64748B]">Total max possible score</span>
            <span className="text-lg font-bold text-[#1B3A6B]">{totalMax}</span>
          </div>
        </>
      )}

      <QuestionTypeModal
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
        title="Delete question type?"
        message={`This will delete "${confirmDelete?.name}" and all related score entries.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function QuestionTypeModal({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: QuestionType | null;
  onSave: (name: string, points: number, max: number) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState(0);
  const [max, setMax] = useState(0);
  useEffect(() => {
    setName(editing?.name ?? "");
    setPoints(editing?.points_per_question ?? 10);
    setMax(editing?.max_questions ?? 10);
  }, [editing, open]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Question Type" : "Add Question Type"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name, points, max);
              } finally {
                setBusy(false);
              }
            }}
          >
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Addition" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Points per question</Label>
            <Input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div>
            <Label>Max questions</Label>
            <Input
              type="number"
              min={0}
              value={max}
              onChange={(e) => setMax(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>
        <div className="text-xs text-[#64748B] bg-slate-50 rounded p-3">
          Max possible score for this type: <strong className="text-[#0F172A]">{points * max}</strong>
        </div>
      </div>
    </Modal>
  );
}
