"use client";
import * as React from "react";
import { Plus, Pencil, Trash2, Settings2, Calculator } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { ProtectedPage } from "@/lib/auth-gate";
import {
  deleteQuestionType, listQuestionTypes, upsertQuestionType,
} from "@/lib/data";
import type { QuestionType } from "@/lib/types";

export default function SetupPage() {
  return (
    <ProtectedPage label="Setup">
      <SetupInner />
    </ProtectedPage>
  );
}

function SetupInner() {
  const [questionTypes, setQuestionTypes] = React.useState<QuestionType[] | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestionType | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<QuestionType | null>(null);

  async function load() {
    try {
      setQuestionTypes(await listQuestionTypes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }
  React.useEffect(() => {
    load();
  }, []);

  async function save(name: string, ppq: number, max: number, displayOrder: number) {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await upsertQuestionType({
        id: editing?.id,
        name: name.trim(),
        points_per_question: ppq,
        max_questions: max,
        display_order: displayOrder,
      });
      toast.success(editing ? "Updated" : "Added");
      setEditOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function doDelete(qt: QuestionType) {
    try {
      await deleteQuestionType(qt.id);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Setup"
        description="Question types determine how scores are entered. Defaults are 100 questions each for Addition/Subtraction and Multiplication/Division."
      />

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
            description="The defaults should have seeded automatically — re-run supabase/schema.sql if missing."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tusgu-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="text-right">Points / question</th>
                  <th className="text-right">Max questions</th>
                  <th className="text-right">Max possible</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {questionTypes.map((qt) => (
                  <tr key={qt.id}>
                    <td className="font-medium">{qt.name}</td>
                    <td className="text-right tabular-nums">{qt.points_per_question}</td>
                    <td className="text-right tabular-nums">{qt.max_questions}</td>
                    <td className="text-right tabular-nums font-semibold">
                      {qt.points_per_question * qt.max_questions}
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
      </Card>

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
  onSave: (name: string, ppq: number, max: number, displayOrder: number) => Promise<unknown>;
}) {
  const [name, setName] = React.useState("");
  const [ppq, setPpq] = React.useState(1);
  const [max, setMax] = React.useState(100);
  const [order, setOrder] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    setName(editing?.name ?? "");
    setPpq(editing?.points_per_question ?? 1);
    setMax(editing?.max_questions ?? 100);
    setOrder(editing?.display_order ?? defaultOrder);
  }, [editing, open, defaultOrder]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Question Type" : "Add Question Type"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try { await onSave(name, ppq, max, order); }
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
            <Label>Max questions</Label>
            <Input type="number" min={0} value={max} onChange={(e) => setMax(parseInt(e.target.value || "0", 10) || 0)} />
          </div>
          <div>
            <Label>Order</Label>
            <Input type="number" min={1} value={order} onChange={(e) => setOrder(parseInt(e.target.value || "0", 10) || 1)} />
          </div>
        </div>
        <div className="text-[12px] text-[#7A7770] bg-[#FAF9F5] border border-[#E8E3D7] rounded p-2.5">
          Max possible score: <span className="font-semibold text-[#1F1E1B]">{ppq * max}</span> points
        </div>
      </div>
    </Modal>
  );
}
