"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Award, GripVertical, Save, Copy, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import type { Category, TrophyAllocation, TrophyType, StudentWithCategory } from "@/lib/types";

export default function AwardsPage() {
  const [trophies, setTrophies] = useState<TrophyType[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allocations, setAllocations] = useState<TrophyAllocation[]>([]);

  async function load() {
    const [t, c, a] = await Promise.all([
      fetch("/api/trophy-types").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/trophy-allocations").then((r) => r.json()),
    ]);
    setTrophies(t);
    setCategories(c);
    setAllocations(a);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Awards"
        description="Define trophy types and how many of each are given per category. Trophies are awarded by canonical rank (category → score → DOB tiebreaker)."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrophyTypesCard trophies={trophies} reload={load} />
        <AllocationsCard
          trophies={trophies ?? []}
          categories={categories}
          allocations={allocations}
          reload={load}
        />
      </div>
    </div>
  );
}

function TrophyTypesCard({ trophies, reload }: { trophies: TrophyType[] | null; reload: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TrophyType | null>(null);
  const [confirmDel, setConfirmDel] = useState<TrophyType | null>(null);
  const [order, setOrder] = useState<TrophyType[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (trophies) {
      setOrder(trophies);
      setDirty(false);
    }
  }, [trophies]);

  function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setOrder(next);
    setDirty(true);
  }

  async function saveOrder() {
    const r = await fetch("/api/trophy-types/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: order.map((o) => o.id) }),
    });
    if (!r.ok) return toast.error("Reorder failed");
    toast.success("Order saved");
    setDirty(false);
    reload();
  }

  async function save(name: string, icon: string, description: string) {
    if (!name.trim()) return toast.error("Name is required");
    const url = editing ? `/api/trophy-types/${editing.id}` : "/api/trophy-types";
    const r = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        icon: icon.trim() || null,
        description: description.trim() || null,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error || "Save failed");
    toast.success(editing ? "Trophy updated" : "Trophy added");
    setEditOpen(false);
    setEditing(null);
    reload();
  }

  async function doDelete(t: TrophyType) {
    const r = await fetch(`/api/trophy-types/${t.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Delete failed");
    toast.success("Trophy deleted");
    reload();
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-[#1B3A6B]" />
          <h2 className="text-sm font-semibold text-[#0F172A]">Trophy Types</h2>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button size="sm" variant="secondary" onClick={saveOrder}>
              <Save className="w-3.5 h-3.5" />
              Save Order
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      {trophies == null ? (
        <TableSkeleton rows={4} cols={3} />
      ) : trophies.length === 0 ? (
        <EmptyState icon={Award} title="No trophy types" description="Add at least one trophy type to allocate awards." />
      ) : (
        <ul>
          {order.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#E2E8F0] last:border-b-0">
              <div className="flex flex-col">
                <button
                  className="text-[#94A3B8] hover:text-[#0F172A] disabled:opacity-30 leading-none"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  className="text-[#94A3B8] hover:text-[#0F172A] disabled:opacity-30 leading-none"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <GripVertical className="w-3.5 h-3.5 text-[#94A3B8]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {t.icon && <span className="text-base">{t.icon}</span>}
                  <span className="text-sm font-medium text-[#0F172A]">{t.name}</span>
                  <span className="text-xs text-[#94A3B8]">#{i + 1}</span>
                </div>
                {t.description && <div className="text-xs text-[#64748B] truncate">{t.description}</div>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(t);
                  setEditOpen(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(t)}>
                <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TrophyModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        editing={editing}
        onSave={save}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && doDelete(confirmDel)}
        title="Delete trophy?"
        message={`This will delete "${confirmDel?.name}" and any allocations using it.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function TrophyModal({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: TrophyType | null;
  onSave: (name: string, icon: string, description: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "");
    setDesc(editing?.description ?? "");
  }, [editing, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Trophy Type" : "Add Trophy Type"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name, icon, desc);
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Trophy" />
        </div>
        <div>
          <Label>Icon (emoji, optional)</Label>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🥇" maxLength={4} />
        </div>
        <div>
          <Label>Description (optional)</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function AllocationsCard({
  trophies,
  categories,
  allocations,
  reload,
}: {
  trophies: TrophyType[];
  categories: Category[];
  allocations: TrophyAllocation[];
  reload: () => void;
}) {
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (categories.length && activeCat == null) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  useEffect(() => {
    const d: Record<string, number> = {};
    for (const a of allocations) d[`${a.category_id}-${a.trophy_type_id}`] = a.quantity;
    setDraft(d);
  }, [allocations]);

  function setQty(catId: number, ttId: number, qty: number) {
    setDraft((d) => ({ ...d, [`${catId}-${ttId}`]: Math.max(0, qty) }));
  }

  function applyToAll() {
    if (activeCat == null) return;
    const next = { ...draft };
    for (const c of categories) {
      for (const t of trophies) {
        const v = draft[`${activeCat}-${t.id}`] ?? 0;
        next[`${c.id}-${t.id}`] = v;
      }
    }
    setDraft(next);
    toast.success("Quantities copied to all categories");
  }

  async function save() {
    setBusy(true);
    try {
      const items: { trophy_type_id: number; category_id: number; quantity: number }[] = [];
      for (const c of categories) {
        for (const t of trophies) {
          items.push({
            trophy_type_id: t.id,
            category_id: c.id,
            quantity: draft[`${c.id}-${t.id}`] ?? 0,
          });
        }
      }
      const r = await fetch("/api/trophy-allocations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) return toast.error("Save failed");
      toast.success("Allocations saved");
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
        <EmptyState
          icon={Award}
          title="No categories yet"
          description="Create categories in Setup before allocating trophies."
        />
      </div>
    );
  }
  if (trophies.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
        <EmptyState icon={Award} title="No trophy types" description="Add trophy types on the left first." />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#0F172A]">Allocations Per Category</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={applyToAll}>
            <Copy className="w-3.5 h-3.5" />
            Apply to All Categories
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="w-3.5 h-3.5" />
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap gap-1.5 bg-slate-50">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeCat === c.id ? "bg-[#1B3A6B] text-white" : "bg-white text-[#0F172A] border border-[#E2E8F0] hover:border-[#94A3B8]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {activeCat != null && (
        <CategoryAllocation
          categoryId={activeCat}
          categoryName={categories.find((c) => c.id === activeCat)?.name ?? ""}
          trophies={trophies}
          draft={draft}
          setQty={setQty}
        />
      )}
    </div>
  );
}

function CategoryAllocation({
  categoryId,
  categoryName,
  trophies,
  draft,
  setQty,
}: {
  categoryId: number;
  categoryName: string;
  trophies: TrophyType[];
  draft: Record<string, number>;
  setQty: (catId: number, ttId: number, qty: number) => void;
}) {
  const [preview, setPreview] = useState<{
    rows: { student: StudentWithCategory; totalScore: number; trophy: TrophyType | null }[];
  } | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // To make preview reflect current draft, refetch when trophies change (after save)
  useEffect(() => {
    fetch(`/api/trophy-allocations/preview?category_id=${categoryId}`)
      .then((r) => r.json())
      .then(setPreview);
  }, [categoryId]);

  const totalAllocated = trophies.reduce((sum, t) => sum + (draft[`${categoryId}-${t.id}`] ?? 0), 0);
  const studentCount = preview?.rows.length ?? 0;
  const overAllocated = totalAllocated > studentCount && studentCount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0]">
      <div className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wide text-[#64748B]">{categoryName} — quantities</div>
        {trophies.map((t) => (
          <div key={t.id} className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {t.icon && <span>{t.icon}</span>}
              <span className="text-sm text-[#0F172A] truncate">{t.name}</span>
            </div>
            <Input
              type="number"
              min={0}
              value={draft[`${categoryId}-${t.id}`] ?? 0}
              onChange={(e) => setQty(categoryId, t.id, parseInt(e.target.value || "0", 10))}
              className="w-20 text-center"
            />
          </div>
        ))}
        <div
          className={`text-xs px-3 py-2 rounded ${
            overAllocated
              ? "bg-amber-50 border border-amber-200 text-[#D97706]"
              : "bg-slate-50 border border-[#E2E8F0] text-[#64748B]"
          }`}
        >
          {totalAllocated} of {studentCount} students will receive a trophy
          {overAllocated && " — over-allocated"}.
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-[#64748B] flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Preview (saved allocations)
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide" : "Show"}
          </Button>
        </div>
        {showPreview && (
          <div className="max-h-80 overflow-y-auto border border-[#E2E8F0] rounded">
            {preview == null ? (
              <div className="p-4 text-sm text-[#64748B]">Loading…</div>
            ) : preview.rows.length === 0 ? (
              <div className="p-4 text-sm text-[#64748B]">No students in this category</div>
            ) : (
              <ul>
                {preview.rows.map((r, i) => (
                  <li
                    key={r.student.id}
                    className="flex items-center gap-2 px-3 py-2 border-b border-[#E2E8F0] last:border-b-0 text-sm"
                  >
                    <span className="text-xs text-[#94A3B8] w-6">{i + 1}.</span>
                    <span className="flex-1 truncate text-[#0F172A]">
                      {r.student.first_name} {r.student.last_name}
                    </span>
                    <span className="text-xs text-[#64748B]">{r.totalScore}</span>
                    {r.trophy ? (
                      <span className="text-xs">{r.trophy.icon ?? "🏅"}</span>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">—</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="text-xs text-[#94A3B8] mt-2">Save to refresh the preview.</div>
      </div>
    </div>
  );
}
