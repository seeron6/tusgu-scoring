"use client";
import * as React from "react";
import toast from "react-hot-toast";
import { Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  setCiCategoryForTeacher, setFranchiseeCategoryForCentre,
} from "@/lib/data";
import type { Student } from "@/lib/types";

export function CoachDetailModal({
  open, onClose, kind, name, allStudents, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: "teacher" | "centre";
  name: string | null;
  allStudents: Student[];
  onSaved: () => void;
}) {
  const myStudents = React.useMemo(() => {
    if (!name) return [];
    return allStudents.filter((s) => (kind === "teacher" ? s.teacher : s.centre) === name);
  }, [allStudents, kind, name]);

  const tierField = kind === "teacher" ? "ci_category" : "franchisee_category";
  const tierLabel = kind === "teacher" ? "CI Category" : "Franchisee Category";

  // Most-common existing value among this coach's students.
  const currentTier = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of myStudents) {
      const v = s[tierField] as string | null;
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: { c: string; n: number } | null = null;
    for (const [c, n] of counts.entries()) {
      if (!best || n > best.n) best = { c, n };
    }
    return best?.c ?? "";
  }, [myStudents, tierField]);

  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setDraft(currentTier);
  }, [currentTier, open]);

  // Distinct values across the whole DB so we can offer them as a datalist.
  const knownValues = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of allStudents) {
      const v = s[tierField] as string | null;
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  }, [allStudents, tierField]);

  async function save() {
    if (!name) return;
    const value = draft.trim() || null;
    setBusy(true);
    try {
      const fn = kind === "teacher" ? setCiCategoryForTeacher : setFranchiseeCategoryForCentre;
      const n = await fn(name, value);
      toast.success(
        value === null
          ? `Cleared ${tierLabel} for ${name} (${n} students)`
          : `${tierLabel} saved for ${name} (${n} students)`
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !name) return null;
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={name}
      description={kind === "teacher" ? "Teacher (CI)" : "Centre"}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            <Save className="w-3.5 h-3.5" />
            {busy ? "Saving…" : "Save"}
            <span className="text-[10px] opacity-60 ml-1">⏎</span>
          </Button>
        </>
      }
    >
      <div
        className="space-y-5"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(e.target as HTMLElement).tagName.match(/^TEXTAREA$/i)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <div>
          <Label>{tierLabel}</Label>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            list={`tier-suggestions-${kind}`}
            placeholder={
              kind === "teacher"
                ? "Mid Career, Franchisees Who are CI's…"
                : "Emerging, Mid Career…"
            }
            autoFocus
          />
          <datalist id={`tier-suggestions-${kind}`}>
            {knownValues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="text-[11px] text-[#7A7770] mt-1.5 leading-relaxed">
            Saving updates the {tierField} on all <strong>{myStudents.length}</strong> student
            {myStudents.length === 1 ? "" : "s"} under this {kind}.
            {kind === "centre" && (
              <span className="block mt-0.5 text-[#A8A39B]">
                Tip: a centre&apos;s franchisee category is set on every one of its students; any
                teacher tier set per-student stays untouched.
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-[#F0EDE5] pt-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#7A7770] mb-2">
            <Users className="w-3.5 h-3.5" />
            Students under this {kind} ({myStudents.length})
          </div>
          <div className="border border-[#E8E3D7] rounded-md max-h-72 overflow-y-auto">
            <table className="tusgu-table text-[12px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>{tierLabel}</th>
                  {kind === "teacher" && <th>Centre</th>}
                  {kind === "centre" && <th>Teacher</th>}
                </tr>
              </thead>
              <tbody>
                {myStudents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-[#A8A39B] py-4">
                      No students assigned.
                    </td>
                  </tr>
                ) : (
                  myStudents.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.full_name}</td>
                      <td>{s.category ?? <span className="text-[#A8A39B]">—</span>}</td>
                      <td>
                        {(s[tierField] as string | null) ?? (
                          <span className="text-[#A8A39B]">—</span>
                        )}
                      </td>
                      {kind === "teacher" && (
                        <td>{s.centre ?? <span className="text-[#A8A39B]">—</span>}</td>
                      )}
                      {kind === "centre" && (
                        <td>{s.teacher ?? <span className="text-[#A8A39B]">—</span>}</td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
