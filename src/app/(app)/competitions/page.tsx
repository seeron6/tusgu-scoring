"use client";
import * as React from "react";
import {
  Search, ScanLine, Save, ChevronRight, Headphones, Zap, X, Award,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, PageHeader } from "@/components/sidebar";
import { BarcodeScannerModal } from "@/components/barcode-scanner";
import { ProtectedPage } from "@/lib/auth-gate";
import {
  findStudentByCode, listStudents, listTrophyAllocations, listTrophyTypes,
  setFlashTrophy, setListeningTrophy,
} from "@/lib/data";
import { trophyCapacityFor } from "@/lib/ranking";
import type { Student, TrophyAllocation, TrophyType } from "@/lib/types";

type Mode = "listening" | "flash";

export default function CompetitionsPage() {
  return (
    <ProtectedPage label="Competitions">
      <CompetitionsInner />
    </ProtectedPage>
  );
}

function CompetitionsInner() {
  const [mode, setMode] = React.useState<Mode>("listening");
  const [students, setStudents] = React.useState<Student[]>([]);
  const [trophyTypes, setTrophyTypes] = React.useState<TrophyType[]>([]);
  const [allocations, setAllocations] = React.useState<TrophyAllocation[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  // Draft trophy id ("" = no trophy / clear, "null" semantically; we coerce empty → null on save)
  const [trophyDraft, setTrophyDraft] = React.useState<string>("");
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, t, a] = await Promise.all([
        listStudents(),
        listTrophyTypes(),
        listTrophyAllocations(),
      ]);
      setStudents(s);
      setTrophyTypes(t);
      setAllocations(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { load(); }, []);

  const eligible = React.useMemo(() => {
    return students.filter((s) =>
      mode === "listening" ? s.listening_category : s.flash_category
    );
  }, [students, mode]);

  const allCategories = React.useMemo(() => {
    return Array.from(
      new Set(
        eligible
          .map((s) => (mode === "listening" ? s.listening_category : s.flash_category) ?? "")
          .filter(Boolean)
      )
    ).sort();
  }, [eligible, mode]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligible.filter((s) => {
      const cat = (mode === "listening" ? s.listening_category : s.flash_category) ?? "";
      if (categoryFilter && cat !== categoryFilter) return false;
      if (q) {
        return [s.full_name, s.student_code, s.exam_code, s.barcode, cat, s.centre, s.teacher]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
  }, [eligible, search, categoryFilter, mode]);

  const selected = students.find((s) => s.id === selectedId) ?? null;
  const selectedCategory = selected
    ? (mode === "listening" ? selected.listening_category : selected.flash_category) ?? ""
    : "";

  const existingTrophyId = selected
    ? mode === "listening" ? selected.listening_trophy_id : selected.flash_trophy_id
    : null;

  React.useEffect(() => {
    if (!selected) {
      setTrophyDraft("");
      return;
    }
    setTrophyDraft(existingTrophyId != null ? String(existingTrophyId) : "");
  }, [selectedId, existingTrophyId, selected]);

  // Capacity for the active competition: { category → { trophyId → {used, cap} } }
  const capacity = React.useMemo(
    () => trophyCapacityFor(students, trophyTypes, allocations, mode),
    [students, trophyTypes, allocations, mode]
  );

  // Trophy ordered list (Grand Champion → Merit) — build the dropdown options.
  const orderedTrophies = React.useMemo(
    () => [...trophyTypes].sort((a, b) => a.display_order - b.display_order),
    [trophyTypes]
  );

  const draftId = trophyDraft === "" ? null : Number(trophyDraft);
  const draftTrophy = draftId != null ? trophyTypes.find((t) => t.id === draftId) ?? null : null;

  // Capacity row for the selected category — used to render "X/Y" hints next to each option
  const catCapacity = selectedCategory ? capacity.get(selectedCategory) : undefined;

  // Will the chosen trophy push the category over capacity?
  const overCapacity = React.useMemo(() => {
    if (!selectedCategory || draftId == null || !catCapacity) return false;
    const c = catCapacity.get(draftId);
    if (!c) return false;
    // If this is the same trophy the student already has, we're not increasing.
    const alreadyHas = existingTrophyId === draftId;
    const projectedUsed = alreadyHas ? c.used : c.used + 1;
    return c.cap > 0 && projectedUsed > c.cap;
  }, [draftId, catCapacity, selectedCategory, existingTrophyId]);

  async function handleScan(code: string) {
    setSearch(code);
    try {
      const found = await findStudentByCode(code);
      if (found) {
        const cat = mode === "listening" ? found.listening_category : found.flash_category;
        if (!cat) {
          toast.error(`${found.full_name} isn't entered in the ${mode} competition`);
          return;
        }
        setSelectedId(found.id);
        toast.success(`Selected ${found.full_name} (${cat})`);
      } else {
        toast.error(`No match for "${code}"`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  async function saveTrophy(advance: boolean) {
    if (!selected) return;
    const value = trophyDraft === "" ? null : Number(trophyDraft);
    if (value !== null && !Number.isFinite(value)) {
      toast.error("Pick a trophy from the dropdown, or — to clear");
      return;
    }
    setBusy(true);
    try {
      if (mode === "listening") {
        await setListeningTrophy(selected.id, value);
        setStudents((all) =>
          all.map((s) => (s.id === selected.id ? { ...s, listening_trophy_id: value } : s))
        );
      } else {
        await setFlashTrophy(selected.id, value);
        setStudents((all) =>
          all.map((s) => (s.id === selected.id ? { ...s, flash_trophy_id: value } : s))
        );
      }
      const trophyName = value == null ? "no trophy" : trophyTypes.find((t) => t.id === value)?.name ?? "trophy";
      toast.success(`${selected.full_name}: ${trophyName}`);
      if (advance) {
        const idx = filtered.findIndex((s) => s.id === selected.id);
        const next = filtered.find((s, i) => i > idx && (
          mode === "listening" ? s.listening_trophy_id : s.flash_trophy_id
        ) == null);
        if (next) {
          setSelectedId(next.id);
        } else {
          setSelectedId(null);
          toast("End of unranked students in this view", { icon: "✓" });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const remainingUnranked = filtered.filter(
    (s) => (mode === "listening" ? s.listening_trophy_id : s.flash_trophy_id) == null
  ).length;
  const totalRanked = eligible.filter(
    (s) => (mode === "listening" ? s.listening_trophy_id : s.flash_trophy_id) != null
  ).length;

  return (
    <div>
      <PageHeader
        title="Live Competitions"
        description="Live entry for Listening and Flash. Search a student or scan a barcode/QR, pick the trophy from the dropdown, then jump to the next."
        actions={
          <div className="flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
            {([
              { id: "listening" as Mode, label: "Listening", icon: Headphones },
              { id: "flash" as Mode, label: "Flash", icon: Zap },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setMode(id);
                  setSelectedId(null);
                  setSearch("");
                  setCategoryFilter("");
                }}
                className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors flex items-center gap-1.5 ${
                  mode === id ? "bg-[#1B3A6B] text-white" : "text-[#4A4843] hover:bg-[#F5F2EB]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Card padded={false}><TableSkeleton rows={6} cols={3} /></Card>
      ) : eligible.length === 0 ? (
        <Card>
          <EmptyState
            icon={mode === "listening" ? Headphones : Zap}
            title={`No students in the ${mode === "listening" ? "Listening" : "Flash"} competition`}
            description={`Re-import the master list with a "${mode === "listening" ? "Listening Category" : "Flash Category"}" column populated for these students.`}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 lg:gap-6">
          <Card padded={false}>
            <div className="px-3 sm:px-4 py-3 border-b border-[#E8E3D7] space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A39B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${mode === "listening" ? "Listening" : "Flash"} entrants…`}
                  className="pl-9 pr-10"
                />
                <button
                  onClick={() => setScannerOpen(true)}
                  title="Scan barcode or QR"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#7A7770] hover:bg-[#F4F1E8] hover:text-[#1B3A6B]"
                >
                  <ScanLine className="w-4 h-4" />
                </button>
              </div>
              <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories ({allCategories.length})</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <div className="flex items-center justify-between text-[11px] text-[#7A7770]">
                <span>{filtered.length} matches</span>
                <span>
                  {totalRanked} / {eligible.length} ranked overall
                  {remainingUnranked > 0 && ` · ${remainingUnranked} unranked here`}
                </span>
              </div>
            </div>
            <ul className="max-h-[60vh] lg:max-h-[640px] overflow-y-auto">
              {filtered.slice(0, 200).map((s) => {
                const tId = mode === "listening" ? s.listening_trophy_id : s.flash_trophy_id;
                const trophy = tId != null ? trophyTypes.find((t) => t.id === tId) : null;
                const cat = (mode === "listening" ? s.listening_category : s.flash_category) ?? "";
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 sm:px-4 py-2.5 border-b border-[#E8E3D7] transition-colors ${
                        selectedId === s.id ? "bg-[#F4F1E8]" : "hover:bg-[#F5F2EB]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {trophy && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FAF3DC] border border-[#E5CE8A] text-[#7A5A1A]">
                            {trophy.icon ?? ""} {trophy.name.replace("Runner Up", "RU")}
                          </span>
                        )}
                        <div className="text-sm font-medium text-[#1F1E1B] truncate flex-1">
                          {s.full_name}
                        </div>
                      </div>
                      <div className="text-[11px] text-[#7A7770] mt-0.5 truncate">
                        {cat}{s.centre ? ` · ${s.centre}` : ""}
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[#7A7770]">No matches</li>
              )}
              {filtered.length > 200 && (
                <li className="px-4 py-2 text-center text-[11px] text-[#A8A39B]">
                  Showing first 200 — refine your search to see more.
                </li>
              )}
            </ul>
          </Card>

          <Card padded={false}>
            {selected == null ? (
              <EmptyState
                icon={mode === "listening" ? Headphones : Zap}
                title="Pick a student"
                description={`Search a name, scan a barcode/QR, or click in the list to assign their ${mode === "listening" ? "Listening" : "Flash"} trophy.`}
              />
            ) : (
              <div>
                <div className="px-4 sm:px-6 py-4 border-b border-[#E8E3D7] flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base sm:text-lg font-bold text-[#1F1E1B] truncate">
                      {selected.full_name}
                    </h2>
                    <div className="text-[12px] sm:text-sm text-[#7A7770] mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[#1B3A6B]">
                        {selectedCategory || "(no category)"}
                      </span>
                      {selected.centre && <span>· {selected.centre}</span>}
                      {selected.teacher && <span>· {selected.teacher}</span>}
                      {selected.exam_code && (
                        <span className="font-mono text-[#1B3A6B]">{selected.exam_code}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-[#7A7770] hover:text-[#1F1E1B] -mr-1 -mt-1 p-1.5"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-4 sm:px-6 py-5 space-y-4">
                  <div>
                    <Label>Trophy in {selectedCategory}</Label>
                    <Select
                      value={trophyDraft}
                      onChange={(e) => setTrophyDraft(e.target.value)}
                      className="text-base"
                    >
                      <option value="">— No trophy / clear —</option>
                      {orderedTrophies.map((t) => {
                        const c = catCapacity?.get(t.id);
                        const used = c?.used ?? 0;
                        const cap = c?.cap ?? 0;
                        const tag = cap > 0 ? `(${used}/${cap})` : "(no quota)";
                        return (
                          <option key={t.id} value={t.id}>
                            {t.icon ? `${t.icon} ` : ""}{t.name} {tag}
                          </option>
                        );
                      })}
                    </Select>
                    {overCapacity && (
                      <div className="text-[11.5px] text-[#B8651A] bg-[#FAF1E5] border border-[#F0DEB8] rounded-md px-2.5 py-1.5 mt-2">
                        Saving will exceed the configured quota for{" "}
                        <strong>{draftTrophy?.name}</strong> in <strong>{selectedCategory}</strong>{" "}
                        — the assignment goes through anyway, just review allocations on the Awards
                        page if that wasn&apos;t intended.
                      </div>
                    )}
                  </div>

                  {draftTrophy && (
                    <div className="flex items-center gap-2 text-[12.5px] text-[#1F1E1B] bg-[#FAF3DC] border border-[#E5CE8A] rounded-md px-3 py-2">
                      <Award className="w-4 h-4 text-[#7A5A1A]" />
                      <span>
                        {selected.full_name} will earn{" "}
                        <strong>{draftTrophy.icon} {draftTrophy.name}</strong> in{" "}
                        {selectedCategory}.
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-[#E8E3D7] bg-[#FAF9F5] flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => saveTrophy(false)}
                    disabled={busy}
                    size="lg"
                    className="flex-1"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </Button>
                  <Button
                    onClick={() => saveTrophy(true)}
                    disabled={busy}
                    size="lg"
                    className="flex-1"
                  >
                    Save & Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={handleScan}
      />

      {!loading && allCategories.length > 0 && (
        <Card padded={false} className="mt-6">
          <CardHeader title={`${mode === "listening" ? "Listening" : "Flash"} category overview`} icon={Award} />
          <div className="p-5 text-[12.5px] text-[#4A4843] leading-relaxed">
            <CategoryAllocationOverview
              competition={mode}
              categories={allCategories}
              capacity={capacity}
              orderedTrophies={orderedTrophies}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function CategoryAllocationOverview({
  categories, capacity, orderedTrophies,
}: {
  competition: Mode;
  categories: string[];
  capacity: Map<string, Map<number, { used: number; cap: number }>>;
  orderedTrophies: TrophyType[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tusgu-table">
        <thead>
          <tr>
            <th>Category</th>
            {orderedTrophies.map((t) => (
              <th key={t.id} className="text-right">{t.name.replace("Runner Up", "RU")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => {
            const cm = capacity.get(c);
            return (
              <tr key={c}>
                <td className="font-medium">{c}</td>
                {orderedTrophies.map((t) => {
                  const v = cm?.get(t.id);
                  const used = v?.used ?? 0;
                  const cap = v?.cap ?? 0;
                  if (cap === 0 && used === 0) {
                    return <td key={t.id} className="text-right text-[#A8A39B]">—</td>;
                  }
                  const overshot = cap > 0 && used > cap;
                  const tone = overshot
                    ? "text-[#B8341A] font-semibold"
                    : used === cap && cap > 0
                    ? "font-semibold text-[#5A8E54]"
                    : "";
                  return (
                    <td key={t.id} className={`text-right tabular-nums ${tone}`}>
                      {used}{cap > 0 ? `/${cap}` : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
