"use client";
import * as React from "react";
import { Upload, ChevronRight, Scissors } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { parseWorkbook, type ParsedRow } from "@/lib/excel";
import {
  setCiCategoryForTeacher, setFranchiseeCategoryForCentre,
} from "@/lib/data";
import type { Student } from "@/lib/types";

/**
 * Sheet shape: a single tab where rows above the split point are CIs (with
 * their CI Category) and rows below the split are Centres (with their
 * Franchisee Category). Both stacks share the same Name + Category columns.
 */
export function CoachesImportModal({
  open, onClose, students, onComplete,
}: {
  open: boolean;
  onClose: () => void;
  students: Student[];
  onComplete: () => void;
}) {
  type SheetData = {
    fileName: string;
    sheets: { name: string; rowCount: number }[];
    sheetName: string;
    headers: string[];
    rows: ParsedRow[];
  };

  const [stage, setStage] = React.useState<"pick" | "map" | "preview" | "done">("pick");
  const [data, setData] = React.useState<SheetData | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [nameCol, setNameCol] = React.useState<string>("");
  const [categoryCol, setCategoryCol] = React.useState<string>("");
  // 0-based index into `data.rows`; rows < splitIndex are CIs, ≥ are Centres.
  const [splitIndex, setSplitIndex] = React.useState<number>(0);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ phase: string; done: number; total: number } | null>(null);
  const [result, setResult] = React.useState<{
    teachersUpdated: number;
    centresUpdated: number;
    teacherStudents: number;
    centreStudents: number;
    skipped: { row: number; reason: string }[];
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setStage("pick");
    setData(null);
    setFile(null);
    setNameCol("");
    setCategoryCol("");
    setSplitIndex(0);
    setResult(null);
    setProgress(null);
  }

  async function pickFile(f: File) {
    setBusy(true);
    setFile(f);
    try {
      const wb = parseWorkbook(await f.arrayBuffer());
      const sheet = wb.best ?? wb.sheets[0];
      if (!sheet) {
        toast.error("Empty workbook");
        return;
      }
      // Heuristic auto-pick: if a header looks like "centre"/"center"/"centers"
      // appears mid-sheet, that's the split. Otherwise default to halfway.
      const lowerCells = sheet.rows.map((r) =>
        Object.values(r).map((v) => String(v ?? "").toLowerCase())
      );
      let detectedSplit = -1;
      for (let i = 1; i < lowerCells.length; i++) {
        const cells = lowerCells[i];
        if (cells.some((c) => /^(centres?|centers?)$/.test(c.trim()))) {
          detectedSplit = i + 1; // skip the header row itself
          break;
        }
      }
      setData({
        fileName: f.name,
        sheets: wb.sheets.map((s) => ({ name: s.sheetName, rowCount: s.rowCount })),
        sheetName: sheet.sheetName,
        headers: sheet.headers,
        rows: sheet.rows,
      });
      // Pre-fill the dropdowns: prefer headers that look like "name" / "category"
      const nameGuess =
        sheet.headers.find((h) => /name|teacher|centre|center|ci\b/i.test(h)) ?? sheet.headers[0] ?? "";
      const catGuess =
        sheet.headers.find((h) => /category|tier|class/i.test(h)) ?? sheet.headers[1] ?? "";
      setNameCol(nameGuess);
      setCategoryCol(catGuess);
      setSplitIndex(detectedSplit > 0 ? detectedSplit : Math.floor(sheet.rows.length / 2));
      setStage("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  }

  async function selectSheet(name: string) {
    if (!file) return;
    setBusy(true);
    try {
      const wb = parseWorkbook(await file.arrayBuffer());
      const sheet = wb.sheets.find((s) => s.sheetName === name);
      if (!sheet) return;
      setData((d) => d ? { ...d, sheetName: name, headers: sheet.headers, rows: sheet.rows } : null);
      setSplitIndex(Math.floor(sheet.rows.length / 2));
    } finally {
      setBusy(false);
    }
  }

  // Build the proposed updates without hitting the network — pure preview.
  const previewLists = React.useMemo(() => {
    if (!data || !nameCol || !categoryCol) {
      return { ciList: [], centreList: [] };
    }
    const ciList: { row: number; name: string; category: string }[] = [];
    const centreList: { row: number; name: string; category: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const name = String(row[nameCol] ?? "").trim();
      const cat = String(row[categoryCol] ?? "").trim();
      if (!name || !cat) continue;
      const target = i < splitIndex ? ciList : centreList;
      target.push({ row: i + 2, name, category: cat });
    }
    return { ciList, centreList };
  }, [data, nameCol, categoryCol, splitIndex]);

  // For matching: teachers and centres present in the database.
  const dbTeachers = React.useMemo(() => {
    const m = new Map<string, number>(); // teacher → student count
    for (const s of students) {
      if (!s.teacher) continue;
      m.set(s.teacher, (m.get(s.teacher) ?? 0) + 1);
    }
    return m;
  }, [students]);
  const dbCentres = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      if (!s.centre) continue;
      m.set(s.centre, (m.get(s.centre) ?? 0) + 1);
    }
    return m;
  }, [students]);

  function findMatch(name: string, dict: Map<string, number>): string | null {
    if (dict.has(name)) return name;
    const lower = name.toLowerCase().trim();
    for (const k of dict.keys()) {
      if (k.toLowerCase().trim() === lower) return k;
    }
    return null;
  }

  async function commit() {
    if (!data) return;
    setBusy(true);
    try {
      const teacherUpdates: { name: string; category: string; row: number }[] = [];
      const centreUpdates: { name: string; category: string; row: number }[] = [];
      const skipped: { row: number; reason: string }[] = [];

      for (const r of previewLists.ciList) {
        const matched = findMatch(r.name, dbTeachers);
        if (matched) teacherUpdates.push({ name: matched, category: r.category, row: r.row });
        else skipped.push({ row: r.row, reason: `Teacher "${r.name}" not found in students` });
      }
      for (const r of previewLists.centreList) {
        const matched = findMatch(r.name, dbCentres);
        if (matched) centreUpdates.push({ name: matched, category: r.category, row: r.row });
        else skipped.push({ row: r.row, reason: `Centre "${r.name}" not found in students` });
      }

      let teacherStudents = 0;
      let centreStudents = 0;

      const total = teacherUpdates.length + centreUpdates.length;
      let done = 0;
      setProgress({ phase: "Updating CI Categories", done, total });

      for (const u of teacherUpdates) {
        const n = await setCiCategoryForTeacher(u.name, u.category);
        teacherStudents += n;
        done++;
        setProgress({ phase: "Updating CI Categories", done, total });
      }

      setProgress({ phase: "Updating Franchisee Categories", done, total });
      for (const u of centreUpdates) {
        const n = await setFranchiseeCategoryForCentre(u.name, u.category);
        centreStudents += n;
        done++;
        setProgress({ phase: "Updating Franchisee Categories", done, total });
      }

      setResult({
        teachersUpdated: teacherUpdates.length,
        centresUpdated: centreUpdates.length,
        teacherStudents,
        centreStudents,
        skipped,
      });
      setStage("done");
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) { reset(); onClose(); } }}
      title="Import Coach Categories"
      description="Upload a sheet with CIs above and Centres below; everything stacks in the same two columns."
      width="max-w-3xl"
      footer={
        stage === "pick" ? (
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        ) : stage === "map" ? (
          <>
            <Button variant="outline" onClick={() => reset()} disabled={busy}>Back</Button>
            <Button
              onClick={() => setStage("preview")}
              disabled={busy || !nameCol || !categoryCol}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        ) : stage === "preview" ? (
          <>
            <Button variant="outline" onClick={() => setStage("map")} disabled={busy}>Back</Button>
            <Button onClick={commit} disabled={busy}>
              {busy
                ? progress
                  ? `${progress.phase} (${progress.done}/${progress.total})`
                  : "Applying…"
                : "Apply"}
            </Button>
          </>
        ) : (
          <Button onClick={() => { reset(); onClose(); }}>Done</Button>
        )
      }
    >
      {stage === "pick" && (
        <div className="space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) pickFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[#D9D2BE] hover:border-[#1B3A6B] hover:bg-[#F4F1E8] rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto text-[#A8A39B] mb-3" />
            <div className="text-sm font-medium text-[#1F1E1B] mb-1">Drop your category sheet here</div>
            <div className="text-xs text-[#7A7770]">.xlsx, .xlsm, .xls, .csv</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
          </div>
          <div className="text-[12px] text-[#7A7770] bg-[#F5F2EB] border border-[#E8E3D7] rounded p-3 leading-relaxed">
            <strong className="text-[#1F1E1B]">Expected layout:</strong> two stacked tables sharing
            the same columns. Top half = CI rows (one row per teacher, with CI Category). Bottom
            half = Centre rows (one row per centre, with Franchisee Category). On the next step
            you&apos;ll pick which row marks the divider between the two stacks.
          </div>
        </div>
      )}

      {stage === "map" && data && (
        <div className="space-y-4">
          <div className="text-sm text-[#7A7770]">
            <span className="font-medium text-[#1F1E1B]">{data.fileName}</span> · sheet{" "}
            <span className="font-medium text-[#1F1E1B]">{data.sheetName}</span> ·{" "}
            <span className="font-medium text-[#1F1E1B]">{data.rows.length}</span> rows
          </div>
          {data.sheets.length > 1 && (
            <div>
              <Label>Sheet</Label>
              <Select value={data.sheetName} onChange={(e) => selectSheet(e.target.value)}>
                {data.sheets.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.rowCount} rows)</option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Name column</Label>
              <Select value={nameCol} onChange={(e) => setNameCol(e.target.value)}>
                {data.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Category column</Label>
              <Select value={categoryCol} onChange={(e) => setCategoryCol(e.target.value)}>
                {data.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <Scissors className="w-3 h-3" />
              Split row (rows above this point are CIs; this row & below are Centres)
            </Label>
            <div className="flex items-center gap-2 mb-2">
              <Input
                type="number"
                min={0}
                max={data.rows.length}
                value={splitIndex}
                onChange={(e) => setSplitIndex(parseInt(e.target.value || "0", 10) || 0)}
                className="w-24 text-center"
              />
              <span className="text-[11.5px] text-[#7A7770]">
                {splitIndex} CI rows above · {data.rows.length - splitIndex} Centre rows from row{" "}
                {splitIndex + 2} down
              </span>
            </div>
            <div className="border border-[#E8E3D7] rounded-md max-h-[40vh] overflow-y-auto">
              <table className="tusgu-table text-[12px]">
                <thead>
                  <tr>
                    <th className="w-14">Row</th>
                    {data.headers.slice(0, 6).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 200).map((r, i) => {
                    const isSplit = i === splitIndex;
                    const inCi = i < splitIndex;
                    return (
                      <React.Fragment key={i}>
                        {isSplit && (
                          <tr>
                            <td colSpan={Math.min(7, data.headers.length + 1)} className="!p-0">
                              <div className="bg-[#1B3A6B] text-white text-[10px] uppercase tracking-wider px-3 py-1 flex justify-between items-center">
                                <span>Centres start here</span>
                                <span className="opacity-80">row {i + 2}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => setSplitIndex(i)}
                          className={`cursor-pointer ${
                            inCi ? "bg-[#FAF3DC]/40" : "bg-[#F4F1E8]/40"
                          } hover:bg-[#F4F1E8]`}
                          title="Click to split here"
                        >
                          <td className="text-[#A8A39B] tabular-nums">{i + 2}</td>
                          {data.headers.slice(0, 6).map((h) => (
                            <td key={h}>{String(r[h] ?? "")}</td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {data.rows.length > 200 && (
                <div className="px-3 py-2 text-[11px] text-[#A8A39B] text-center bg-[#FAF9F5]">
                  Showing first 200 rows
                </div>
              )}
            </div>
            <div className="text-[11px] text-[#7A7770] mt-1">Click any row to make it the split point.</div>
          </div>
        </div>
      )}

      {stage === "preview" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="CIs (teachers)" count={previewLists.ciList.length} colour="bg-[#FAF3DC] border-[#E5CE8A] text-[#7A5A1A]" />
            <Stat label="Centres" count={previewLists.centreList.length} colour="bg-[#F4F1E8] border-[#E5DECF] text-[#1B3A6B]" />
          </div>

          <PreviewList
            title="CIs (above split)"
            rows={previewLists.ciList}
            field="ci_category"
            dict={dbTeachers}
            findMatch={findMatch}
          />
          <PreviewList
            title="Centres (split + below)"
            rows={previewLists.centreList}
            field="franchisee_category"
            dict={dbCentres}
            findMatch={findMatch}
          />
        </div>
      )}

      {stage === "done" && result && (
        <div className="space-y-4 py-2">
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="text-base font-semibold text-[#1F1E1B] mb-1">Categories applied</div>
            <div className="text-sm text-[#7A7770]">
              Updated {result.teachersUpdated} teachers ({result.teacherStudents} student rows) and{" "}
              {result.centresUpdated} centres ({result.centreStudents} student rows).
            </div>
          </div>
          {result.skipped.length > 0 && (
            <details className="border border-[#F0DEB8] bg-[#FAF1E5] rounded-md p-3">
              <summary className="text-[12.5px] font-medium text-[#7A4A0F] cursor-pointer">
                {result.skipped.length} rows skipped (names not in the students table)
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto text-[11.5px] text-[#7A4A0F] space-y-1 list-disc list-inside">
                {result.skipped.slice(0, 30).map((s, i) => (
                  <li key={i}>Row {s.row}: {s.reason}</li>
                ))}
                {result.skipped.length > 30 && (
                  <li className="list-none italic">…and {result.skipped.length - 30} more.</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, count, colour }: { label: string; count: number; colour: string }) {
  return (
    <div className={`border rounded p-3 text-center ${colour}`}>
      <div className="text-2xl font-bold tabular-nums">{count}</div>
      <div className="text-[11px] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function PreviewList({
  title, rows, field, dict, findMatch,
}: {
  title: string;
  rows: { row: number; name: string; category: string }[];
  field: "ci_category" | "franchisee_category";
  dict: Map<string, number>;
  findMatch: (name: string, dict: Map<string, number>) => string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-[#E8E3D7] rounded-md px-3 py-2 text-[12px] text-[#A8A39B]">
        {title}: no rows
      </div>
    );
  }
  return (
    <div className="border border-[#E8E3D7] rounded-md max-h-56 overflow-y-auto">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#7A7770] bg-[#FAF9F5] border-b border-[#E8E3D7]">
        {title}  ·  field: {field}
      </div>
      <table className="tusgu-table text-[12px]">
        <thead>
          <tr>
            <th>Row</th>
            <th>Name in sheet</th>
            <th>Category</th>
            <th className="text-right">Match in DB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const matched = findMatch(r.name, dict);
            const studentCount = matched ? dict.get(matched) ?? 0 : 0;
            return (
              <tr key={i}>
                <td className="text-[#A8A39B]">{r.row}</td>
                <td className="font-medium">{r.name}</td>
                <td>{r.category}</td>
                <td className="text-right">
                  {matched ? (
                    <span className="text-[#5A8E54]">{studentCount} student{studentCount === 1 ? "" : "s"}</span>
                  ) : (
                    <span className="text-[#B8341A]">no match</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
