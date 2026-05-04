"use client";
import * as React from "react";
import { Plus, Pencil, Trash2, Settings2, Calculator, Award } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import {
  deleteQuestionType, listQuestionTypes, listTrophyTypes, upsertQuestionType, upsertTrophyType,
} from "@/lib/data";
import type { QuestionType, TrophyType } from "@/lib/types";

export default function SetupPage() {
  return (
    <ProtectedPage label="Setup">
      <SetupInner />
    </ProtectedPage>
  );
}

function SetupInner() {
  const [questionTypes, setQuestionTypes] = React.useState<QuestionType[] | null>(null);
  const [trophyTypes, setTrophyTypes] = React.useState<TrophyType[] | null>(null);

  async function load() {
    try {
      const [q, t] = await Promise.all([listQuestionTypes(), listTrophyTypes()]);
      setQuestionTypes(q);
      setTrophyTypes(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }
  React.useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Setup"
        description="Configure question types and trophy point values. The CI / Centre points leaderboard uses these point values."
      />

      <div className="grid grid-cols-1 gap-6">
        <QuestionTypesCard questionTypes={questionTypes} reload={load} />
        <TrophyPointsCard trophyTypes={trophyTypes} reload={load} />
      </div>
    </div>
  );
}

// =============================================================
// Question types — with per-category-prefix max_questions overrides
// =============================================================

function QuestionTypesCard({
  questionTypes, reload,
}: { questionTypes: QuestionType[] | null; reload: () => void }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestionType | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<QuestionType | null>(null);

  async function save(
    name: string,
    ppq: number,
    max: number,
    displayOrder: number,
    overrides: Record<string, number>
  ) {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await upsertQuestionType({
        id: editing?.id,
        name: name.trim(),
        points_per_question: ppq,
        max_questions: max,
        display_order: displayOrder,
        category_max_overrides: overrides,
      });
      toast.success(editing ? "Updated" : "Added");
      setEditOpen(false);
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function doDelete(qt: QuestionType) {
    try {
      await deleteQuestionType(qt.id);
      toast.success("Deleted");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Question Types"
        icon={Calculator}
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        }
      />
      {questionTypes == null ? (
        <TableSkeleton rows={3} cols={4} />
      ) : questionTypes.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="No question types"
          description="Re-run supabase/schema.sql to seed defaults."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="tusgu-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right">Points / question</th>
                <th className="text-right">Default max</th>
                <th>Per-category overrides</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questionTypes.map((qt) => (
                <tr key={qt.id}>
                  <td className="font-medium">{qt.name}</td>
                  <td className="text-right tabular-nums">{qt.points_per_question}</td>
                  <td className="text-right tabular-nums">{qt.max_questions}</td>
                  <td>
                    <OverridesPreview value={qt.category_max_overrides} />
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(qt); setEditOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDel(qt)}>
                        <Trash2 className="w-3.5 h-3.5 text-[#B8341A]" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuestionTypeModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditing(null); }}
        editing={editing}
        defaultOrder={questionTypes ? questionTypes.length + 1 : 1}
        onSave={save}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && doDelete(confirmDel)}
        title="Delete question type?"
        message={`Delete "${confirmDel?.name}" and all scores recorded under it.`}
        confirmLabel="Delete"
        destructive
      />
    </Card>
  );
}

function OverridesPreview({ value }: { value: Record<string, number> | null | undefined }) {
  const entries = Object.entries(value ?? {});
  if (entries.length === 0) {
    return <span className="text-[#A8A39B] text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([prefix, max]) => (
          <span key={prefix} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F4F1E8] text-[#1B3A6B] text-[11px] font-medium">
            <span className="font-bold">{prefix}*</span>
            <span className="text-[#7A7770]">→</span>
            <span>{max}</span>
          </span>
        ))}
    </div>
  );
}

function QuestionTypeModal({
  open, onClose, editing, defaultOrder, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: QuestionType | null;
  defaultOrder: number;
  onSave: (
    name: string,
    ppq: number,
    max: number,
    displayOrder: number,
    overrides: Record<string, number>
  ) => Promise<unknown>;
}) {
  const [name, setName] = React.useState("");
  const [ppq, setPpq] = React.useState(1);
  const [max, setMax] = React.useState(100);
  const [order, setOrder] = React.useState(1);
  const [overrides, setOverrides] = React.useState<{ prefix: string; max: string }[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setName(editing?.name ?? "");
    setPpq(editing?.points_per_question ?? 1);
    setMax(editing?.max_questions ?? 100);
    setOrder(editing?.display_order ?? defaultOrder);
    const o = editing?.category_max_overrides ?? {};
    setOverrides(
      Object.entries(o).map(([prefix, mx]) => ({ prefix, max: String(mx) }))
    );
  }, [editing, open, defaultOrder]);

  function buildOverrides(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const { prefix, max: mx } of overrides) {
      const p = prefix.trim().slice(0, 1).toUpperCase();
      const n = parseInt(mx, 10);
      if (!p || !Number.isFinite(n) || n <= 0) continue;
      out[p] = n;
    }
    return out;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Question Type" : "Add Question Type"}
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try { await onSave(name, ppq, max, order, buildOverrides()); }
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Addition / Subtraction" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Points per question</Label>
            <Input type="number" min={0} value={ppq} onChange={(e) => setPpq(parseInt(e.target.value || "0", 10) || 0)} />
          </div>
          <div>
            <Label>Default max questions</Label>
            <Input type="number" min={0} value={max} onChange={(e) => setMax(parseInt(e.target.value || "0", 10) || 0)} />
          </div>
          <div>
            <Label>Order</Label>
            <Input type="number" min={1} value={order} onChange={(e) => setOrder(parseInt(e.target.value || "0", 10) || 1)} />
          </div>
        </div>
        <div className="text-[12px] text-[#7A7770] bg-[#FAF9F5] border border-[#E8E3D7] rounded p-2.5">
          Default max possible: <span className="font-semibold text-[#1F1E1B]">{ppq * max}</span> points
        </div>

        <div className="border-t border-[#F0EDE5] pt-3">
          <Label>Per-category overrides</Label>
          <div className="text-[11px] text-[#7A7770] mb-2 leading-relaxed">
            Match by the first letter of the student&apos;s category. e.g. enter <code className="bg-white px-1 rounded border border-[#E8E3D7]">A</code>{" "}
            → <code className="bg-white px-1 rounded border border-[#E8E3D7]">200</code> to give every category starting with A
            (A1, A2, A3) a max of 200 questions instead of {max || "the default"}.
          </div>
          <div className="space-y-1.5">
            {overrides.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o.prefix}
                  onChange={(e) =>
                    setOverrides((arr) => arr.map((x, j) => j === i ? { ...x, prefix: e.target.value.slice(0, 1).toUpperCase() } : x))
                  }
                  placeholder="A"
                  className="w-16 text-center font-bold tabular-nums"
                  maxLength={1}
                />
                <span className="text-[#7A7770]">→</span>
                <Input
                  type="number"
                  min={0}
                  value={o.max}
                  onChange={(e) =>
                    setOverrides((arr) => arr.map((x, j) => j === i ? { ...x, max: e.target.value } : x))
                  }
                  placeholder="200"
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrides((arr) => arr.filter((_, j) => j !== i))}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#B8341A]" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverrides((arr) => [...arr, { prefix: "", max: "" }])}
            >
              <Plus className="w-3.5 h-3.5" /> Add override
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================
// Trophy points
// =============================================================

function TrophyPointsCard({
  trophyTypes, reload,
}: { trophyTypes: TrophyType[] | null; reload: () => void }) {
  const [draft, setDraft] = React.useState<Record<number, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!trophyTypes) return;
    const d: Record<number, string> = {};
    for (const t of trophyTypes) d[t.id] = String(t.points ?? 0);
    setDraft(d);
    setDirty(false);
  }, [trophyTypes]);

  async function save() {
    if (!trophyTypes) return;
    setBusy(true);
    try {
      for (const t of trophyTypes) {
        const next = parseInt(draft[t.id] ?? "0", 10);
        if ((t.points ?? 0) === next) continue;
        await upsertTrophyType({
          id: t.id,
          name: t.name,
          icon: t.icon,
          description: t.description,
          display_order: t.display_order,
          points: Number.isFinite(next) ? next : 0,
        });
      }
      toast.success("Trophy points saved");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Trophy Points"
        icon={Award}
        actions={
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      />
      <div className="p-5">
        <div className="text-[11.5px] text-[#7A7770] mb-3 leading-relaxed">
          Points awarded for the CI / Centre summary leaderboard. Defaults: Grand Champion 75, Champion 50, 1st RU 40, 2nd RU 30, 3rd RU 25, 4th RU 20, 5th RU 10, Merit 5.
        </div>
        {trophyTypes == null ? (
          <TableSkeleton rows={4} cols={2} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {trophyTypes.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  {t.icon && <span>{t.icon}</span>}
                  <span className="text-[13px] text-[#1F1E1B] truncate">{t.name}</span>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={draft[t.id] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [t.id]: e.target.value }));
                    setDirty(true);
                  }}
                  className="w-24 text-right tabular-nums"
                />
                <span className="text-[11px] text-[#7A7770]">pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
