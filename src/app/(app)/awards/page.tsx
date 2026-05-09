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
import { formatStudentDob } from "@/lib/utils";
import {
  deleteTrophyType, listQuestionTypes, listScores, listStudents,
  listTrophyAllocations, listTrophyTypes, upsertTrophyAllocation, upsertTrophyType,
} from "@/lib/data";
import { buildLeaderboard } from "@/lib/ranking";
import type {
  Competition, LeaderboardRow, QuestionType, Student, TrophyAllocation, TrophyType,
} from "@/lib/types";
import { COMPETITION_LABELS, COMPETITIONS } from "@/lib/types";

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
  const [competition, setCompetition] = React.useState<Competition>("visual");
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

  // Categories per competition. Visual uses students.category; Listening
  // and Flash use their own categorical fields entered on import.
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const cat =
        competition === "visual" ? s.category :
        competition === "listening" ? s.listening_category :
        s.flash_category;
      if (cat) set.add(cat);
    }
    return Array.from(set).sort();
  }, [students, competition]);

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
        <div className="space-y-4">
          <div className="bg-[#F4F1E8] border border-[#E5DECF] rounded-lg p-3 text-[12px] text-[#4A4843] leading-relaxed">
            Trophy types and point values live on the <strong>Setup</strong> page. Use this card
            to set quantities (or percentages) per category, separately for each competition.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider text-[#7A7770]">Competition</span>
            <div className="flex items-center bg-white border border-[#E8E3D7] rounded-md p-0.5">
              {COMPETITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCompetition(c)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors ${
                    competition === c ? "bg-[#1B3A6B] text-white" : "text-[#4A4843] hover:bg-[#F5F2EB]"
                  }`}
                >
                  {COMPETITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <AllocationsCard
            trophies={trophies ?? []}
            categories={categories}
            allocations={allocations}
            students={students}
            competition={competition}
            reload={load}
          />
        </div>
      )}
    </div>
  );
}

function ExportAwardsButton({ rows }: { rows: LeaderboardRow[] }) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  // Click-away closes the menu so it doesn't trap focus.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function run(withScores: boolean) {
    setBusy(true);
    setOpen(false);
    try {
      const { awardsToPdf } = await import("@/lib/pdf");
      const buf = awardsToPdf(rows, { withScores });
      const blob = new Blob([buf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `tusgu-awards-${withScores ? "with-scores-" : ""}${stamp}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Awards PDF generated (${withScores ? "with scores" : "no scores"})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button variant="outline" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <FileText className="w-4 h-4" />
        <span className="hidden sm:inline">{busy ? "Exporting…" : "Export PDF"}</span>
        <Download className="w-3.5 h-3.5 -mr-1 opacity-60" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 z-30 w-64 bg-white border border-[#E8E3D7] rounded-lg shadow-lg overflow-hidden"
        >
          <button
            role="menuitem"
            onClick={() => run(false)}
            className="w-full text-left px-3 py-2.5 hover:bg-[#F5F2EB] border-b border-[#F0EDE5] last:border-b-0"
          >
            <div className="text-[13px] font-semibold text-[#1F1E1B]">PDF — without scores</div>
            <div className="text-[11px] text-[#7A7770]">Names only — share-friendly</div>
          </button>
          <button
            role="menuitem"
            onClick={() => run(true)}
            className="w-full text-left px-3 py-2.5 hover:bg-[#F5F2EB]"
          >
            <div className="text-[13px] font-semibold text-[#1F1E1B]">PDF — with scores</div>
            <div className="text-[11px] text-[#7A7770]">Includes each winner&rsquo;s total score</div>
          </button>
        </div>
      )}
    </div>
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
                {[r.student.centre, r.student.teacher, r.student.dob ? `DOB ${formatStudentDob(r.student)}` : null]
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

function AllocationsCard({
  trophies, categories, allocations, students, competition, reload,
}: {
  trophies: TrophyType[];
  categories: string[];
  allocations: TrophyAllocation[];
  students: Student[];
  competition: Competition;
  reload: () => void;
}) {
  const [activeCat, setActiveCat] = React.useState<string | null>(null);
  // mode = "qty" → user enters absolute number of trophies per type
  // mode = "pct" → user enters a percentage of the category student count.
  // Saved to DB as the rounded-up quantity in either mode.
  const [mode, setMode] = React.useState<"qty" | "pct">("qty");
  // Both drafts keyed `${category}-${trophyTypeId}` → string for free editing.
  const [qtyDraft, setQtyDraft] = React.useState<Record<string, string>>({});
  const [pctDraft, setPctDraft] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (categories.length && (activeCat == null || !categories.includes(activeCat))) {
      setActiveCat(categories[0]);
    }
  }, [categories, activeCat]);

  React.useEffect(() => {
    const q: Record<string, string> = {};
    for (const a of allocations) {
      if (a.competition !== competition) continue;
      q[`${a.category}-${a.trophy_type_id}`] = String(a.quantity);
    }
    setQtyDraft(q);
    setPctDraft({});
  }, [allocations, competition]);

  function categoryStudentCount(cat: string): number {
    return students.filter((s) => {
      const c =
        competition === "visual" ? s.category :
        competition === "listening" ? s.listening_category :
        s.flash_category;
      return c === cat;
    }).length;
  }

  function pctToQty(cat: string, pct: number): number {
    return Math.ceil((categoryStudentCount(cat) * pct) / 100);
  }

  /** Resolve an effective quantity for a given category+trophy from whichever mode is active. */
  function effectiveQty(cat: string, ttId: number): number {
    const k = `${cat}-${ttId}`;
    if (mode === "pct") {
      const pctRaw = pctDraft[k];
      if (pctRaw != null && pctRaw !== "") {
        const p = parseFloat(pctRaw);
        if (Number.isFinite(p)) return pctToQty(cat, p);
      }
    }
    const v = parseInt(qtyDraft[k] ?? "0", 10);
    return Number.isFinite(v) ? v : 0;
  }

  function applyToAll() {
    if (!activeCat) return;
    if (mode === "pct") {
      const next = { ...pctDraft };
      for (const c of categories) {
        for (const t of trophies) {
          next[`${c}-${t.id}`] = pctDraft[`${activeCat}-${t.id}`] ?? "";
        }
      }
      setPctDraft(next);
    } else {
      const next = { ...qtyDraft };
      for (const c of categories) {
        for (const t of trophies) {
          next[`${c}-${t.id}`] = qtyDraft[`${activeCat}-${t.id}`] ?? "0";
        }
      }
      setQtyDraft(next);
    }
    toast.success("Copied to all categories");
  }

  async function save() {
    setBusy(true);
    try {
      for (const c of categories) {
        for (const t of trophies) {
          await upsertTrophyAllocation(t.id, c, effectiveQty(c, t.id), competition);
        }
      }
      toast.success(`${COMPETITION_LABELS[competition]} allocations saved`);
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
        <EmptyState icon={Award} title="No trophy types" description="Edit trophy types on the Setup page." />
      </div>
    );
  }

  const studentsInCat = activeCat ? categoryStudentCount(activeCat) : 0;
  const totalAllocated = activeCat
    ? trophies.reduce((sum, t) => sum + effectiveQty(activeCat, t.id), 0)
    : 0;
  const overAllocated = totalAllocated > studentsInCat && studentsInCat > 0;

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Allocations per Category</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#F4F1E8] rounded-md p-0.5">
            {(["qty", "pct"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  mode === m ? "bg-white text-[#1B3A6B] shadow-sm" : "text-[#7A7770]"
                }`}
              >
                {m === "qty" ? "Quantity" : "Percentage"}
              </button>
            ))}
          </div>
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
            {c} <span className="opacity-70 text-[10px]">({categoryStudentCount(c)})</span>
          </button>
        ))}
      </div>

      {activeCat != null && (
        <div className="p-5 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] flex items-baseline justify-between">
            <span>{activeCat} — {studentsInCat} student{studentsInCat === 1 ? "" : "s"}</span>
            <span className="normal-case tracking-normal text-[11px] text-[#7A7770]">
              {mode === "pct" ? "Decimals round up" : ""}
            </span>
          </div>
          {trophies.map((t) => {
            const k = `${activeCat}-${t.id}`;
            if (mode === "qty") {
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    {t.icon && <span>{t.icon}</span>}
                    <span className="text-[13px] text-[#1F1E1B] truncate">{t.name}</span>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={qtyDraft[k] ?? "0"}
                    onChange={(e) => setQtyDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="w-24 text-center"
                  />
                </div>
              );
            }
            // percentage mode
            const pctRaw = pctDraft[k] ?? "";
            const pct = parseFloat(pctRaw);
            const computed = Number.isFinite(pct) ? pctToQty(activeCat, pct) : 0;
            return (
              <div key={t.id} className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  {t.icon && <span>{t.icon}</span>}
                  <span className="text-[13px] text-[#1F1E1B] truncate">{t.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={pctRaw}
                    onChange={(e) => setPctDraft((d) => ({ ...d, [k]: e.target.value }))}
                    placeholder="0"
                    className="w-20 text-center"
                  />
                  <span className="text-[11px] text-[#7A7770]">%</span>
                </div>
                <div className="text-[11.5px] text-[#1F1E1B] tabular-nums w-20 text-right">
                  = <span className="font-semibold">{computed}</span> trophies
                </div>
              </div>
            );
          })}
          <div
            className={`text-[11.5px] px-3 py-2 rounded ${
              overAllocated
                ? "bg-[#FAF1E5] border border-[#F0DEB8] text-[#B8651A]"
                : "bg-[#FAF9F5] border border-[#E8E3D7] text-[#7A7770]"
            }`}
          >
            {totalAllocated} of {studentsInCat} students will receive a trophy{overAllocated ? " — over-allocated" : ""}.
            {mode === "pct" ? " Save to apply the computed quantities." : ""}
          </div>
        </div>
      )}
    </div>
  );
}
