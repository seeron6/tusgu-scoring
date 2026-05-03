"use client";
import * as React from "react";
import {
  Plus, Pencil, Trash2, Award, Save, Copy, Settings, Users, FileText, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import { formatDate } from "@/lib/utils";
import {
  deleteTrophyType, listQuestionTypes, listScores, listStudents,
  listTrophyAllocations, listTrophyTypes, upsertTrophyAllocation, upsertTrophyType,
} from "@/lib/data";
import { buildLeaderboard } from "@/lib/ranking";
import type {
  LeaderboardRow, QuestionType, Student, TrophyAllocation, TrophyType,
} from "@/lib/types";

type Tab = "preview" | "configure";

export default function AwardsPage() {
  return (
    <ProtectedPage label="Awards">
      <AwardsInner />
    </ProtectedPage>
  );
}

function AwardsInner() {
  const [tab, setTab] = React.useState<Tab>("preview");
  const [trophies, setTrophies] = React.useState<TrophyType[] | null>(null);
  const [allocations, setAllocations] = React.useState<TrophyAllocation[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [questionTypes, setQuestionTypes] = React.useState<QuestionType[]>([]);
  const [rows, setRows] = React.useState<LeaderboardRow[]>([]);

  async function load() {
    try {
      const [t, a, s, qts, scores] = await Promise.all([
        listTrophyTypes(),
        listTrophyAllocations(),
        listStudents(),
        listQuestionTypes(),
        listScores(),
      ]);
      setTrophies(t);
      setAllocations(a);
      setStudents(s);
      setQuestionTypes(qts);
      setRows(
        buildLeaderboard({
          students: s,
          scores,
          questionTypes: qts,
          trophyTypes: t,
          trophyAllocations: a,
          applyTrophies: true,
        })
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load awards");
    }
  }
  React.useEffect(() => {
    load();
  }, []);

  const categories = React.useMemo(
    () => Array.from(new Set(students.map((s) => s.category ?? "(uncategorised)"))).sort(),
    [students]
  );

  return (
    <div>
      <PageHeader
        title="Awards"
        description="Allocate trophies and preview winners. Tied positions are listed alphabetically."
        actions={
          <>
            <div className="flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
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
            {tab === "preview" && (
              <ExportAwardsButton rows={rows} />
            )}
          </>
        }
      />

      {tab === "preview" ? (
        <PreviewSection rows={rows} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TrophyTypesCard trophies={trophies} reload={load} />
          <AllocationsCard
            trophies={trophies ?? []}
            categories={categories}
            allocations={allocations}
            students={students}
            reload={load}
          />
        </div>
      )}
    </div>
  );
}

function ExportAwardsButton({ rows }: { rows: LeaderboardRow[] }) {
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      const { awardsToPdf } = await import("@/lib/pdf");
      const buf = awardsToPdf(rows, {});
      const blob = new Blob([buf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `tusgu-awards-${stamp}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Awards PDF generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      <FileText className="w-4 h-4" />
      <span className="hidden sm:inline">{busy ? "Exporting…" : "Export PDF"}</span>
    </Button>
  );
}

function PreviewSection({ rows }: { rows: LeaderboardRow[] }) {
  const grouped = React.useMemo(() => {
    if (rows.length === 0) return [] as { category: string; trophies: { trophy: TrophyType; rows: LeaderboardRow[] }[] }[];
    const byCat = new Map<string, LeaderboardRow[]>();
    for (const r of rows) {
      const cat = r.student.category ?? "(uncategorised)";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(r);
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
            rows: g.rows.slice().sort((a, b) =>
              (a.student.full_name || "").localeCompare(b.student.full_name || "")
            ),
          }));
        return { category, trophies };
      });
  }, [rows]);

  if (grouped.length === 0 || grouped.every((g) => g.trophies.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState
          icon={Award}
          title="No award winners yet"
          description="Configure trophy quantities per category, then save."
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
          className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden"
        >
          <div className="px-5 sm:px-7 py-5 border-b border-[#F0EDE5] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-1">Category</div>
              <h2 className="font-serif text-lg sm:text-[22px] font-semibold text-[#1F1E1B] tracking-tight">{category}</h2>
            </div>
            <div className="text-[11px] text-[#7A7770]">
              {trophies.reduce((sum, g) => sum + g.rows.length, 0)} winners across {trophies.length} trophies
            </div>
          </div>
          <div className="px-5 sm:px-7 py-6 space-y-7">
            {trophies.length === 0 ? (
              <div className="text-[13px] text-[#7A7770] italic">
                No trophies allocated for this category. Use Configure to set quantities.
              </div>
            ) : (
              trophies.map(({ trophy, rows: winners }) => (
                <TrophyBand key={trophy.id} trophy={trophy} rows={winners} />
              ))
            )}
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
      <header className="flex items-baseline gap-3 pb-3 mb-4 border-b border-[#F0EDE5] flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border bg-gradient-to-b ${palette}`}>
          {trophy.icon && <span>{trophy.icon}</span>}
          {trophy.name}
        </span>
        <span className="text-[11px] text-[#7A7770]">
          {rows.length} {rows.length === 1 ? "recipient" : "recipients"} · alphabetical
        </span>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((r) => (
          <li key={r.student.id} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#F0EDE5] last:border-b-0">
            <div className="min-w-0">
              <div className="text-[14px] text-[#1F1E1B] font-semibold truncate">{r.student.full_name}</div>
              <div className="text-[11px] text-[#7A7770] mt-0.5 truncate">
                {[r.student.centre, r.student.teacher, r.student.dob ? `DOB ${formatDate(r.student.dob)}` : null]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="text-[13px] text-[#1F1E1B] font-semibold tabular-nums shrink-0">{r.totalScore}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrophyTypesCard({ trophies, reload }: { trophies: TrophyType[] | null; reload: () => void }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TrophyType | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<TrophyType | null>(null);

  async function save(name: string, icon: string, description: string, displayOrder: number) {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await upsertTrophyType({
        id: editing?.id,
        name: name.trim(),
        icon: icon.trim() || null,
        description: description.trim() || null,
        display_order: displayOrder,
      });
      toast.success(editing ? "Trophy updated" : "Trophy added");
      setEditOpen(false);
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function doDelete(t: TrophyType) {
    try {
      await deleteTrophyType(t.id);
      toast.success("Trophy deleted");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Trophy Types</h2>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {trophies == null ? (
        <TableSkeleton rows={4} cols={3} />
      ) : trophies.length === 0 ? (
        <EmptyState icon={Award} title="No trophy types" description="Add at least one trophy type." />
      ) : (
        <ul>
          {trophies.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#F0EDE5] last:border-b-0">
              <span className="text-[11px] text-[#A8A39B] tabular-nums w-6">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {t.icon && <span className="text-base">{t.icon}</span>}
                  <span className="text-[13.5px] font-medium text-[#1F1E1B] truncate">{t.name}</span>
                </div>
                {t.description && <div className="text-[11.5px] text-[#7A7770] truncate">{t.description}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setEditOpen(true); }}>
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
        onClose={() => { setEditOpen(false); setEditing(null); }}
        editing={editing}
        defaultOrder={trophies ? trophies.length + 1 : 1}
        onSave={save}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && doDelete(confirmDel)}
        title="Delete trophy?"
        message={`Delete "${confirmDel?.name}" and any allocations using it.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function TrophyModal({
  open, onClose, editing, defaultOrder, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: TrophyType | null;
  defaultOrder: number;
  onSave: (name: string, icon: string, description: string, displayOrder: number) => Promise<unknown>;
}) {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [order, setOrder] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "");
    setDesc(editing?.description ?? "");
    setOrder(editing?.display_order ?? defaultOrder);
  }, [editing, open, defaultOrder]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Trophy Type" : "Add Trophy Type"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try { await onSave(name, icon, desc, order); }
              finally { setBusy(false); }
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grand Champion" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Icon (emoji)</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏆" maxLength={4} />
          </div>
          <div>
            <Label>Order</Label>
            <Input type="number" value={order} onChange={(e) => setOrder(parseInt(e.target.value || "0", 10) || 1)} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function AllocationsCard({
  trophies, categories, allocations, students, reload,
}: {
  trophies: TrophyType[];
  categories: string[];
  allocations: TrophyAllocation[];
  students: Student[];
  reload: () => void;
}) {
  const [activeCat, setActiveCat] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (categories.length && (activeCat == null || !categories.includes(activeCat))) {
      setActiveCat(categories[0]);
    }
  }, [categories, activeCat]);

  React.useEffect(() => {
    const d: Record<string, number> = {};
    for (const a of allocations) d[`${a.category}-${a.trophy_type_id}`] = a.quantity;
    setDraft(d);
  }, [allocations]);

  function setQty(cat: string, ttId: number, qty: number) {
    setDraft((d) => ({ ...d, [`${cat}-${ttId}`]: Math.max(0, qty) }));
  }

  function applyToAll() {
    if (!activeCat) return;
    const next = { ...draft };
    for (const c of categories) {
      for (const t of trophies) {
        const v = draft[`${activeCat}-${t.id}`] ?? 0;
        next[`${c}-${t.id}`] = v;
      }
    }
    setDraft(next);
    toast.success("Quantities copied to all categories");
  }

  async function save() {
    setBusy(true);
    try {
      for (const c of categories) {
        for (const t of trophies) {
          const qty = draft[`${c}-${t.id}`] ?? 0;
          await upsertTrophyAllocation(t.id, c, qty);
        }
      }
      toast.success("Allocations saved");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3D7]">
        <EmptyState icon={Settings} title="No categories yet" description="Import students with categories first." />
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

  const studentsInCat = activeCat
    ? students.filter((s) => (s.category ?? "(uncategorised)") === activeCat).length
    : 0;
  const totalAllocated = activeCat
    ? trophies.reduce((sum, t) => sum + (draft[`${activeCat}-${t.id}`] ?? 0), 0)
    : 0;
  const overAllocated = totalAllocated > studentsInCat && studentsInCat > 0;

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Allocations per Category</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={applyToAll}>
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Apply to all</span>
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="w-3.5 h-3.5" />
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-3 border-b border-[#F0EDE5] flex flex-wrap gap-1.5 bg-[#FAF9F5] max-h-32 overflow-y-auto">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              activeCat === c
                ? "bg-[#1B3A6B] text-white"
                : "bg-white text-[#1F1E1B] border border-[#E8E3D7] hover:border-[#D9D2BE]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {activeCat != null && (
        <div className="p-5 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770]">{activeCat} — quantities</div>
          {trophies.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {t.icon && <span>{t.icon}</span>}
                <span className="text-[13px] text-[#1F1E1B] truncate">{t.name}</span>
              </div>
              <Input
                type="number"
                min={0}
                value={draft[`${activeCat}-${t.id}`] ?? 0}
                onChange={(e) => setQty(activeCat, t.id, parseInt(e.target.value || "0", 10))}
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
            {totalAllocated} of {studentsInCat} students will receive a trophy{overAllocated ? " — over-allocated" : ""}.
          </div>
        </div>
      )}
    </div>
  );
}
