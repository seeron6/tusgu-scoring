"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Award, GripVertical, Save, Copy, Eye, Settings, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { ExportMenu } from "@/components/export-menu";
import { formatDate } from "@/lib/utils";
import type {
  Category,
  LeaderboardRow,
  TrophyAllocation,
  TrophyType,
} from "@/lib/types";

type Tab = "preview" | "configure";

export default function AwardsPage() {
  const [tab, setTab] = useState<Tab>("preview");
  const [trophies, setTrophies] = useState<TrophyType[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allocations, setAllocations] = useState<TrophyAllocation[]>([]);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  async function load() {
    const [t, c, a, r] = await Promise.all([
      fetch("/api/trophy-types").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/trophy-allocations").then((r) => r.json()),
      fetch("/api/leaderboard?trophies=1").then((r) => r.json()),
    ]);
    setTrophies(t);
    setCategories(c);
    setAllocations(a);
    setRows(r);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Awards"
        description="Allocate trophies and preview winners. Tied positions are listed alphabetically by surname."
        actions={
          <>
            <div className="hidden md:flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
              {(["preview", "configure"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors ${
                    tab === t ? "bg-[#1B3A6B] text-white" : "text-[#4A4843] hover:bg-[#F5F2EB]"
                  }`}
                >
                  {t === "preview" ? "Preview" : "Configure"}
                </button>
              ))}
            </div>
            <ExportMenu surface="awards" imageSelector="[data-export-section]" trophiesApplied />
          </>
        }
      />

      <div className="md:hidden mb-4 flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5 w-fit">
        {(["preview", "configure"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              tab === t ? "bg-[#1B3A6B] text-white" : "text-[#4A4843]"
            }`}
          >
            {t === "preview" ? "Preview" : "Configure"}
          </button>
        ))}
      </div>

      {tab === "preview" ? (
        <PreviewSection rows={rows} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TrophyTypesCard trophies={trophies} reload={load} />
          <AllocationsCard
            trophies={trophies ?? []}
            categories={categories}
            allocations={allocations}
            reload={load}
          />
        </div>
      )}
    </div>
  );
}

function PreviewSection({ rows }: { rows: LeaderboardRow[] | null }) {
  const grouped = useMemo(() => {
    if (!rows) return [] as { category: string; trophies: { trophy: TrophyType; rows: LeaderboardRow[] }[] }[];
    const byCat = new Map<string, LeaderboardRow[]>();
    for (const r of rows) {
      if (!byCat.has(r.student.category_name)) byCat.set(r.student.category_name, []);
      byCat.get(r.student.category_name)!.push(r);
    }
    return Array.from(byCat.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, list]) => {
        const tMap = new Map<number, { trophy: TrophyType; rows: LeaderboardRow[] }>();
        for (const r of list) {
          if (!r.trophy) continue;
          if (!tMap.has(r.trophy.id)) tMap.set(r.trophy.id, { trophy: r.trophy, rows: [] });
          tMap.get(r.trophy.id)!.rows.push(r);
        }
        const trophies = Array.from(tMap.values())
          .sort((a, b) => a.trophy.display_order - b.trophy.display_order)
          .map((g) => ({
            trophy: g.trophy,
            rows: g.rows.slice().sort((a, b) => {
              const ln = a.student.last_name.localeCompare(b.student.last_name);
              return ln !== 0 ? ln : a.student.first_name.localeCompare(b.student.first_name);
            }),
          }));
        return { category, trophies };
      });
  }, [rows]);

  if (rows == null) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (grouped.length === 0 || grouped.every((g) => g.trophies.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState
          icon={Award}
          title="No award winners yet"
          description="Configure trophy types and allocations, then save to see winners here."
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {grouped.map(({ category, trophies }) => (
        <div
          key={category}
          data-export-section
          data-export-name={category}
          className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden"
        >
          <div className="px-7 py-5 border-b border-[#F0EDE5] flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">Category</div>
              <h2 className="font-serif text-[22px] font-semibold text-[#1F1E1B] tracking-tight">{category}</h2>
            </div>
            <div className="text-[11px] text-[#7A7770]">
              {trophies.reduce((sum, g) => sum + g.rows.length, 0)} winners across {trophies.length} trophies
            </div>
          </div>
          <div className="px-7 py-6 space-y-7">
            {trophies.length === 0 && (
              <div className="text-[13px] text-[#7A7770] italic">
                No trophies allocated for this category. Use Configure to set quantities.
              </div>
            )}
            {trophies.map(({ trophy, rows: winners }) => (
              <TrophyBand key={trophy.id} trophy={trophy} rows={winners} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrophyBand({ trophy, rows }: { trophy: TrophyType; rows: LeaderboardRow[] }) {
  const palette =
    trophy.display_order === 1
      ? "from-[#FAF3DC] to-[#F5E9C4] border-[#E5CE8A] text-[#7A5A1A]"
      : trophy.display_order === 2
      ? "from-[#F1F0EC] to-[#E8E6DF] border-[#D9D2BE] text-[#4A4843]"
      : trophy.display_order === 3
      ? "from-[#F6E9DC] to-[#EFD9C2] border-[#E0BB95] text-[#8A4520]"
      : "from-[#F4F1E8] to-[#EBE6D2] border-[#E5DECF] text-[#1B3A6B]";
  return (
    <section>
      <header className={`flex items-baseline gap-3 pb-3 mb-4 border-b border-[#F0EDE5]`}>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border bg-gradient-to-b ${palette}`}
        >
          {trophy.icon && <span>{trophy.icon}</span>}
          {trophy.name}
        </span>
        <span className="text-[11px] text-[#7A7770]">
          {rows.length} {rows.length === 1 ? "recipient" : "recipients"} · alphabetical
        </span>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((r) => (
          <li
            key={r.student.id}
            className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#F0EDE5] last:border-b-0"
          >
            <div>
              <div className="text-[14px] text-[#1F1E1B]">
                {r.student.first_name}{" "}
                <span className="font-semibold">{r.student.last_name}</span>
              </div>
              <div className="text-[11px] text-[#7A7770] mt-0.5">
                {r.student.centre} · {r.student.teacher} · DOB {formatDate(r.student.dob)}
              </div>
            </div>
            <div className="text-[13px] text-[#1F1E1B] font-semibold tabular-nums shrink-0">{r.totalScore}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Configure tab ─────────────────────────────────────────────── */

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
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Trophy Types</h2>
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
            <li
              key={t.id}
              className="flex items-center gap-3 px-5 py-3 border-b border-[#F0EDE5] last:border-b-0"
            >
              <div className="flex flex-col">
                <button
                  className="text-[#A8A39B] hover:text-[#1F1E1B] disabled:opacity-30 leading-none text-[10px]"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  className="text-[#A8A39B] hover:text-[#1F1E1B] disabled:opacity-30 leading-none text-[10px]"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <GripVertical className="w-3.5 h-3.5 text-[#A8A39B]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {t.icon && <span className="text-base">{t.icon}</span>}
                  <span className="text-[13.5px] font-medium text-[#1F1E1B]">{t.name}</span>
                  <span className="text-[11px] text-[#A8A39B]">#{i + 1}</span>
                </div>
                {t.description && <div className="text-[11.5px] text-[#7A7770] truncate">{t.description}</div>}
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
                <Trash2 className="w-3.5 h-3.5 text-[#B8341A]" />
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
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState icon={Settings} title="No categories yet" description="Create categories in Setup before allocating trophies." />
      </div>
    );
  }
  if (trophies.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState icon={Award} title="No trophy types" description="Add trophy types on the left first." />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Allocations per Category</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={applyToAll}>
            <Copy className="w-3.5 h-3.5" />
            Apply to all
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="w-3.5 h-3.5" />
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-[#F0EDE5] flex flex-wrap gap-1.5 bg-[#FAF9F5]">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              activeCat === c.id
                ? "bg-[#1B3A6B] text-white"
                : "bg-white text-[#1F1E1B] border border-[#E8E3D7] hover:border-[#D9D2BE]"
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
    rows: { student: { first_name: string; last_name: string }; totalScore: number; trophy: TrophyType | null }[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/trophy-allocations/preview?category_id=${categoryId}`)
      .then((r) => r.json())
      .then(setPreview);
  }, [categoryId]);

  const totalAllocated = trophies.reduce((sum, t) => sum + (draft[`${categoryId}-${t.id}`] ?? 0), 0);
  const studentCount = preview?.rows.length ?? 0;
  const overAllocated = totalAllocated > studentCount && studentCount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F0EDE5]">
      <div className="p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-[#7A7770]">{categoryName} — quantities</div>
        {trophies.map((t) => (
          <div key={t.id} className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {t.icon && <span>{t.icon}</span>}
              <span className="text-[13px] text-[#1F1E1B] truncate">{t.name}</span>
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
          className={`text-[11.5px] px-3 py-2 rounded ${
            overAllocated
              ? "bg-[#FAF1E5] border border-[#F0DEB8] text-[#B8651A]"
              : "bg-[#FAF9F5] border border-[#E8E3D7] text-[#7A7770]"
          }`}
        >
          {totalAllocated} of {studentCount} students will receive a trophy{overAllocated ? " — over-allocated" : ""}.
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-wider text-[#7A7770]">
          <Eye className="w-3.5 h-3.5" /> Preview (saved allocations)
        </div>
        <div className="max-h-72 overflow-y-auto border border-[#F0EDE5] rounded">
          {preview == null ? (
            <div className="p-4 text-[13px] text-[#7A7770]">Loading…</div>
          ) : preview.rows.length === 0 ? (
            <div className="p-4 text-[13px] text-[#7A7770]">No students in this category</div>
          ) : (
            <ul>
              {preview.rows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 border-b border-[#F0EDE5] last:border-b-0 text-[13px]"
                >
                  <span className="text-[11px] text-[#A8A39B] w-6 tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate text-[#1F1E1B]">
                    {r.student.first_name} {r.student.last_name}
                  </span>
                  <span className="text-[11px] text-[#7A7770] tabular-nums">{r.totalScore}</span>
                  {r.trophy ? <span className="text-[12px]">{r.trophy.icon ?? "🏅"}</span> : <span className="text-[#A8A39B]">—</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-[11px] text-[#A8A39B] mt-2">Save to refresh the preview.</div>
      </div>
    </div>
  );
}
