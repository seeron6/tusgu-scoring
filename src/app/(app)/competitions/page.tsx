"use client";
import * as React from "react";
import {
  Search, ScanLine, Save, ChevronRight, Headphones, Zap, X, RotateCcw, Award,
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
  setFlashPosition, setListeningPosition,
} from "@/lib/data";
import { buildPositionLeaderboard } from "@/lib/ranking";
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
  const [positionDraft, setPositionDraft] = React.useState<string>("");
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

  // Eligible students = those with a category in the active competition.
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

  // Existing position (if any) for the selected student
  const existingPosition = selected
    ? mode === "listening" ? selected.listening_position : selected.flash_position
    : null;

  React.useEffect(() => {
    if (!selected) {
      setPositionDraft("");
      return;
    }
    setPositionDraft(existingPosition != null ? String(existingPosition) : "");
  }, [selectedId, existingPosition, selected]);

  // Already-ranked positions in the selected category — used to flag
  // collisions ("position 3 already used by Alice").
  const usedPositions = React.useMemo(() => {
    if (!selectedCategory) return new Map<number, Student>();
    const m = new Map<number, Student>();
    for (const s of students) {
      const cat = (mode === "listening" ? s.listening_category : s.flash_category) ?? "";
      if (cat !== selectedCategory) continue;
      const p = mode === "listening" ? s.listening_position : s.flash_position;
      if (typeof p === "number" && p > 0 && s.id !== selectedId) m.set(p, s);
    }
    return m;
  }, [students, selectedCategory, mode, selectedId]);

  const draftNum = parseInt(positionDraft, 10);
  const draftValid = positionDraft === "" || (Number.isFinite(draftNum) && draftNum > 0);
  const collision = Number.isFinite(draftNum) ? usedPositions.get(draftNum) : undefined;

  // What trophy will be awarded for this position?
  const trophyPreview = React.useMemo(() => {
    if (!selected || !selectedCategory || !Number.isFinite(draftNum) || draftNum <= 0) return null;
    const ordered = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);
    const allocs = allocations.filter(
      (a) => a.competition === mode && a.category === selectedCategory
    );
    let runningPos = 0;
    for (const tt of ordered) {
      const alloc = allocs.find((a) => a.trophy_type_id === tt.id);
      const qty = alloc?.quantity ?? 0;
      if (qty <= 0) continue;
      const start = runningPos + 1;
      const end = runningPos + qty;
      if (draftNum >= start && draftNum <= end) return tt;
      runningPos = end;
    }
    return null;
  }, [selected, selectedCategory, draftNum, trophyTypes, allocations, mode]);

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

  async function savePosition(advance: boolean) {
    if (!selected) return;
    const value = positionDraft === "" ? null : parseInt(positionDraft, 10);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      toast.error("Position must be a positive number, or empty to clear");
      return;
    }
    setBusy(true);
    try {
      if (mode === "listening") {
        await setListeningPosition(selected.id, value);
        // optimistic update
        setStudents((all) =>
          all.map((s) => (s.id === selected.id ? { ...s, listening_position: value } : s))
        );
      } else {
        await setFlashPosition(selected.id, value);
        setStudents((all) =>
          all.map((s) => (s.id === selected.id ? { ...s, flash_position: value } : s))
        );
      }
      toast.success(value === null ? "Cleared position" : `Saved position ${value}`);
      if (advance) {
        const idx = filtered.findIndex((s) => s.id === selected.id);
        const next = filtered.find(
          (s, i) => i > idx &&
            (mode === "listening" ? s.listening_position : s.flash_position) == null
        );
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
    (s) => (mode === "listening" ? s.listening_position : s.flash_position) == null
  ).length;

  const totalRanked = eligible.filter(
    (s) => (mode === "listening" ? s.listening_position : s.flash_position) != null
  ).length;

  return (
    <div>
      <PageHeader
        title="Live Competitions"
        description="Live entry for Listening and Flash competitions. Search a student or scan their barcode/QR, set their position, then jump to the next."
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
          {/* Left: search + filter + list */}
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
                const pos = mode === "listening" ? s.listening_position : s.flash_position;
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
                        {pos != null && (
                          <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded text-[10px] font-bold tabular-nums bg-[#1B3A6B] text-white">
                            {pos}
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

          {/* Right: position editor */}
          <Card padded={false}>
            {selected == null ? (
              <EmptyState
                icon={mode === "listening" ? Headphones : Zap}
                title="Pick a student"
                description={`Search a name, scan a barcode/QR, or click a name on the left to set their ${mode === "listening" ? "Listening" : "Flash"} position.`}
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
                    <Label>Position in {selectedCategory}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={positionDraft}
                        onChange={(e) => setPositionDraft(e.target.value)}
                        placeholder="—"
                        className="w-24 text-center text-2xl font-bold"
                      />
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <button
                            key={n}
                            onClick={() => setPositionDraft(String(n))}
                            className={`w-8 h-8 rounded text-[12px] font-semibold tabular-nums transition-colors ${
                              draftNum === n
                                ? "bg-[#1B3A6B] text-white"
                                : "bg-[#F4F1E8] text-[#1B3A6B] hover:bg-[#E5DECF]"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPositionDraft("")}
                          title="Clear"
                          className="px-2"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {!draftValid && (
                      <div className="text-[11.5px] text-[#B8341A] mt-1">
                        Enter a positive number, or leave blank to clear.
                      </div>
                    )}
                    {collision && (
                      <div className="text-[11.5px] text-[#B8651A] bg-[#FAF1E5] border border-[#F0DEB8] rounded-md px-2.5 py-1.5 mt-2">
                        Position {draftNum} is currently held by{" "}
                        <strong>{collision.full_name}</strong>. Saving will leave both at the same
                        position — you may want to renumber.
                      </div>
                    )}
                  </div>

                  {trophyPreview && (
                    <div className="flex items-center gap-2 text-[12.5px] text-[#1F1E1B] bg-[#FAF3DC] border border-[#E5CE8A] rounded-md px-3 py-2">
                      <Award className="w-4 h-4 text-[#7A5A1A]" />
                      <span>
                        At position <strong>{draftNum}</strong> in {selectedCategory}, this earns:{" "}
                        <strong>{trophyPreview.icon} {trophyPreview.name}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-[#E8E3D7] bg-[#FAF9F5] flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => savePosition(false)}
                    disabled={busy || !draftValid}
                    size="lg"
                    className="flex-1"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </Button>
                  <Button
                    onClick={() => savePosition(true)}
                    disabled={busy || !draftValid}
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

      {/* Quick reference: trophy allocation per category */}
      {!loading && allCategories.length > 0 && (
        <Card padded={false} className="mt-6">
          <CardHeader title={`${mode === "listening" ? "Listening" : "Flash"} trophy positions`} icon={Award} />
          <div className="p-5 text-[12.5px] text-[#4A4843] leading-relaxed">
            <CategoryAllocationOverview
              competition={mode}
              categories={allCategories}
              students={eligible}
              trophyTypes={trophyTypes}
              allocations={allocations}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function CategoryAllocationOverview({
  competition, categories, students, trophyTypes, allocations,
}: {
  competition: Mode;
  categories: string[];
  students: Student[];
  trophyTypes: TrophyType[];
  allocations: TrophyAllocation[];
}) {
  // Show: Category | total entrants | how many ranked | which positions earn which trophy
  const ordered = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);
  const rows = buildPositionLeaderboard({
    students,
    trophyTypes,
    trophyAllocations: allocations,
    competition,
  });

  return (
    <div className="overflow-x-auto">
      <table className="tusgu-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="text-right">Entrants</th>
            <th className="text-right">Ranked</th>
            {ordered.map((t) => (
              <th key={t.id} className="text-right">{t.name.replace("Runner Up", "RU")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => {
            const inCat = students.filter(
              (s) => (competition === "listening" ? s.listening_category : s.flash_category) === c
            );
            const rankedInCat = inCat.filter((s) =>
              competition === "listening" ? s.listening_position != null : s.flash_position != null
            ).length;
            const winners = rows.filter((r) => r.category === c);
            return (
              <tr key={c}>
                <td className="font-medium">{c}</td>
                <td className="text-right tabular-nums">{inCat.length}</td>
                <td className="text-right tabular-nums">{rankedInCat}</td>
                {ordered.map((t) => {
                  const alloc = allocations.find(
                    (a) => a.competition === competition && a.category === c && a.trophy_type_id === t.id
                  );
                  const qty = alloc?.quantity ?? 0;
                  const claimed = winners.filter((w) => w.trophy?.id === t.id).length;
                  return (
                    <td key={t.id} className="text-right tabular-nums">
                      {qty === 0 ? (
                        <span className="text-[#A8A39B]">—</span>
                      ) : (
                        <span className={claimed >= qty ? "font-semibold text-[#5A8E54]" : ""}>
                          {claimed}/{qty}
                        </span>
                      )}
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
