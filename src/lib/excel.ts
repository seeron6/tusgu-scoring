import * as XLSX from "xlsx";
import { db } from "./db";
import type { LeaderboardRow, QuestionType } from "./types";
import { STUDENT_FIELDS, type StudentField, type ImportMode } from "./excel-types";
export { STUDENT_FIELDS, type StudentField, type ImportMode };

export type ParsedRow = Record<string, string | number | undefined>;

export function parseWorkbook(buffer: ArrayBuffer): { sheetNames: string[]; rows: ParsedRow[]; headers: string[] } {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { sheetNames: [], rows: [], headers: [] };
  const ws = wb.Sheets[firstSheet];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
  const cleaned = cleanGrid(aoa);
  return { sheetNames: wb.SheetNames, rows: cleaned.rows, headers: cleaned.headers };
}

/**
 * Take a 2D grid (rows of cells) and produce { headers, rows }:
 *  - find the header row by scoring keyword matches across the first 12 rows
 *  - slice everything below the header into row objects keyed by header name
 *  - drop fully-blank rows
 *  - trim cells
 */
export function cleanGrid(grid: unknown[][]): { headers: string[]; rows: ParsedRow[] } {
  if (!grid || grid.length === 0) return { headers: [], rows: [] };

  const headerRowIdx = findHeaderRow(grid);
  if (headerRowIdx < 0) {
    // fallback: assume first non-empty row is the header
    const idx = grid.findIndex((r) => Array.isArray(r) && r.some((c) => normalizeCell(c) !== ""));
    if (idx < 0) return { headers: [], rows: [] };
    return buildFromHeader(grid, idx);
  }
  return buildFromHeader(grid, headerRowIdx);
}

function buildFromHeader(grid: unknown[][], headerIdx: number): { headers: string[]; rows: ParsedRow[] } {
  const rawHeaders = grid[headerIdx] as unknown[];
  const headers: string[] = [];
  const seen: Record<string, number> = {};
  for (let i = 0; i < rawHeaders.length; i++) {
    let h = normalizeCell(rawHeaders[i]) || `Column ${i + 1}`;
    // Disambiguate duplicate header names
    if (seen[h] != null) {
      seen[h]++;
      h = `${h} (${seen[h]})`;
    } else {
      seen[h] = 1;
    }
    headers.push(h);
  }

  const rows: ParsedRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;
    const obj: ParsedRow = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      const v = normalizeCell(row[c]);
      if (v !== "") hasAny = true;
      obj[headers[c]] = v;
    }
    if (hasAny) rows.push(obj);
  }
  return { headers, rows };
}

function normalizeCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, " ").trim();
}

const HEADER_HINTS_FOR_DETECTION = [
  "name", "first", "last", "surname", "given",
  "dob", "birth", "born",
  "category", "group", "division", "class", "level",
  "centre", "center", "school", "team", "branch",
  "teacher", "tutor", "coach",
  "score", "total", "addition", "subtraction", "multiplication", "division",
];

function findHeaderRow(grid: unknown[][]): number {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    if (!Array.isArray(row)) continue;
    let score = 0;
    let nonEmpty = 0;
    for (const c of row) {
      const v = normalizeCell(c).toLowerCase();
      if (!v) continue;
      nonEmpty++;
      // header cells are usually short text labels, not long sentences
      if (v.length > 50) continue;
      if (HEADER_HINTS_FOR_DETECTION.some((h) => v === h || v.includes(h))) score++;
    }
    // require at least 2 hits and at least 2 non-empty cells
    if (score >= 2 && nonEmpty >= 2 && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const FIELD_HINTS: Record<StudentField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "given", "fname"],
  last_name: ["last name", "lastname", "surname", "family name", "last", "lname"],
  full_name: ["full name", "student name", "name", "fullname", "student", "pupil", "child"],
  dob: ["dob", "date of birth", "birth date", "birthdate", "birthday", "born"],
  category: ["category", "group", "division", "class", "level", "grade"],
  centre: ["centre", "center", "school", "team", "branch", "location", "site"],
  teacher: ["teacher", "tutor", "instructor", "coach", "mentor"],
};

export function autoMapColumns(headers: string[]): Record<StudentField, string | null> {
  const result = {} as Record<StudentField, string | null>;
  const lower = headers.map((h) => ({ orig: h, low: String(h).toLowerCase().trim() }));
  for (const f of STUDENT_FIELDS) {
    const hints = FIELD_HINTS[f];
    let matched: string | null = null;
    for (const h of hints) {
      const exact = lower.find((c) => c.low === h);
      if (exact) {
        matched = exact.orig;
        break;
      }
    }
    if (!matched) {
      for (const h of hints) {
        const partial = lower.find((c) => c.low.includes(h));
        if (partial) {
          matched = partial.orig;
          break;
        }
      }
    }
    result[f] = matched;
  }
  // If we matched first/last AND full, prefer first/last (don't double-up)
  if (result.first_name && result.last_name) result.full_name = null;
  return result;
}

export function normalizeDob(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  if (!s) return null;
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY (UK/AU)
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, mo, y] = dmy;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
    const dn = parseInt(d, 10);
    const mn = parseInt(mo, 10);
    const yn = parseInt(y, 10);
    if (mn >= 1 && mn <= 12 && dn >= 1 && dn <= 31) {
      return `${yn}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
    }
    // try MM/DD/YYYY (US fallback) if DD/MM didn't parse cleanly
    if (dn >= 1 && dn <= 12 && mn >= 1 && mn <= 31) {
      return `${yn}-${String(dn).padStart(2, "0")}-${String(mn).padStart(2, "0")}`;
    }
  }
  // Excel-style "1 Jan 2015" / "January 15, 2015"
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function splitFullName(full: string): { first: string; last: string } {
  const cleaned = full.replace(/\s+/g, " ").trim();
  if (!cleaned) return { first: "", last: "" };
  // "Last, First" pattern
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",").map((s) => s.trim());
    if (last && first) return { first, last };
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export type StudentImportRow = {
  first_name: string;
  last_name: string;
  dob: string;
  category: string;
  centre: string;
  teacher: string;
};

export type StudentImportPreview = {
  valid: StudentImportRow[];
  invalid: { row: number; reason: string; raw: ParsedRow }[];
  duplicates: { row: number; existingId: number; data: StudentImportRow }[];
};

const DEFAULT_CATEGORY = "General";
const DEFAULT_CENTRE = "Unknown";
const DEFAULT_TEACHER = "Unknown";

export function previewStudentImport(
  rows: ParsedRow[],
  mapping: Record<StudentField, string | null>,
  defaults?: { category?: string; centre?: string; teacher?: string }
): StudentImportPreview {
  const d = db();
  const preview: StudentImportPreview = { valid: [], invalid: [], duplicates: [] };
  const findExisting = d.prepare(
    "SELECT id FROM students WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND dob = ?"
  );

  const fallbackCat = (defaults?.category ?? "").trim() || DEFAULT_CATEGORY;
  const fallbackCentre = (defaults?.centre ?? "").trim() || DEFAULT_CENTRE;
  const fallbackTeacher = (defaults?.teacher ?? "").trim() || DEFAULT_TEACHER;

  rows.forEach((raw, idx) => {
    const get = (col: string | null): string => {
      if (!col) return "";
      const v = raw[col];
      return v == null ? "" : String(v).trim();
    };

    let first = get(mapping.first_name);
    let last = get(mapping.last_name);

    // If no separate first/last, try full_name
    if ((!first || !last) && mapping.full_name) {
      const full = get(mapping.full_name);
      if (full) {
        const split = splitFullName(full);
        if (!first) first = split.first;
        if (!last) last = split.last;
      }
    }

    const dobRaw = mapping.dob ? raw[mapping.dob] : "";
    const dob = normalizeDob(dobRaw);
    const category = get(mapping.category) || fallbackCat;
    const centre = get(mapping.centre) || fallbackCentre;
    const teacher = get(mapping.teacher) || fallbackTeacher;

    if (!first) {
      preview.invalid.push({ row: idx + 2, reason: "Missing first name", raw });
      return;
    }
    if (!last) {
      // If only one word given, treat it as last="" — accept with last as "—"
      // We require both to keep alphabetical sort meaningful
      preview.invalid.push({ row: idx + 2, reason: "Could not determine last name", raw });
      return;
    }
    if (!dob) {
      preview.invalid.push({ row: idx + 2, reason: "Invalid or missing date of birth", raw });
      return;
    }

    const data: StudentImportRow = { first_name: first, last_name: last, dob, category, centre, teacher };
    const existing = findExisting.get(first, last, dob) as { id: number } | undefined;
    if (existing) {
      preview.duplicates.push({ row: idx + 2, existingId: existing.id, data });
    } else {
      preview.valid.push(data);
    }
  });
  return preview;
}

export type CommitResult = { inserted: number; updated: number; skipped: number };

export function commitStudentImport(preview: StudentImportPreview, duplicateMode: ImportMode): CommitResult {
  const d = db();
  const ensureCat = d.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
  const findCat = d.prepare("SELECT id FROM categories WHERE name = ?");
  const insertS = d.prepare(
    "INSERT INTO students (first_name, last_name, dob, category_id, centre, teacher) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const updateS = d.prepare(
    "UPDATE students SET first_name = ?, last_name = ?, dob = ?, category_id = ?, centre = ?, teacher = ? WHERE id = ?"
  );

  const tx = d.transaction(() => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of preview.valid) {
      ensureCat.run(r.category);
      const cat = findCat.get(r.category) as { id: number };
      insertS.run(r.first_name, r.last_name, r.dob, cat.id, r.centre, r.teacher);
      inserted++;
    }
    for (const dup of preview.duplicates) {
      if (duplicateMode === "skip") {
        skipped++;
        continue;
      }
      const r = dup.data;
      ensureCat.run(r.category);
      const cat = findCat.get(r.category) as { id: number };
      updateS.run(r.first_name, r.last_name, r.dob, cat.id, r.centre, r.teacher, dup.existingId);
      updated++;
    }
    return { inserted, updated, skipped };
  });

  return tx();
}

export type ScoreImportPreview = {
  valid: { studentId: number; values: Record<number, number> }[];
  invalid: { row: number; reason: string; raw: ParsedRow }[];
};

export function previewScoreImport(rows: ParsedRow[], mapping: { name: string; dob: string | null; types: Record<number, string | null> }): ScoreImportPreview {
  const d = db();
  const findByName = d.prepare(
    "SELECT id FROM students WHERE lower(first_name || ' ' || last_name) = lower(?)"
  );
  const findByNameDob = d.prepare(
    "SELECT id FROM students WHERE lower(first_name || ' ' || last_name) = lower(?) AND dob = ?"
  );
  const qts = d.prepare("SELECT * FROM question_types").all() as QuestionType[];
  const qtById = new Map(qts.map((q) => [q.id, q]));

  const preview: ScoreImportPreview = { valid: [], invalid: [] };
  rows.forEach((raw, idx) => {
    const name = mapping.name ? String(raw[mapping.name] ?? "").trim() : "";
    if (!name) {
      preview.invalid.push({ row: idx + 2, reason: "Missing student name", raw });
      return;
    }
    let student: { id: number } | undefined;
    if (mapping.dob) {
      const dob = normalizeDob(raw[mapping.dob]);
      if (dob) student = findByNameDob.get(name, dob) as { id: number } | undefined;
    }
    if (!student) student = findByName.get(name) as { id: number } | undefined;
    if (!student) {
      preview.invalid.push({ row: idx + 2, reason: `Student "${name}" not found`, raw });
      return;
    }
    const values: Record<number, number> = {};
    for (const [typeIdStr, col] of Object.entries(mapping.types)) {
      if (!col) continue;
      const v = Number(raw[col]);
      if (Number.isFinite(v)) {
        const qt = qtById.get(Number(typeIdStr));
        const max = qt ? qt.points_per_question * qt.max_questions : Infinity;
        const clamped = Math.max(0, Math.min(max, v));
        values[Number(typeIdStr)] = clamped;
      }
    }
    preview.valid.push({ studentId: student.id, values });
  });
  return preview;
}

export function commitScoreImport(preview: ScoreImportPreview): { upserted: number } {
  const d = db();
  const upsert = d.prepare(
    `INSERT INTO scores (student_id, question_type_id, value) VALUES (?, ?, ?)
     ON CONFLICT(student_id, question_type_id) DO UPDATE SET value = excluded.value, recorded_at = CURRENT_TIMESTAMP`
  );
  const tx = d.transaction(() => {
    let upserted = 0;
    for (const r of preview.valid) {
      for (const [typeId, value] of Object.entries(r.values)) {
        upsert.run(r.studentId, Number(typeId), value);
        upserted++;
      }
    }
    return { upserted };
  });
  return tx();
}

export type ExportOptions = {
  hideScores?: boolean;
};

export function leaderboardToWorkbook(
  rows: LeaderboardRow[],
  questionTypes: QuestionType[],
  opts: ExportOptions = {}
): ArrayBuffer {
  const showScores = !opts.hideScores;
  const data: Record<string, string | number>[] = rows.map((r) => {
    const base: Record<string, string | number> = {
      Rank: r.rank,
      Name: `${r.student.first_name} ${r.student.last_name}`,
      DOB: r.student.dob,
      Age: r.age,
      Category: r.student.category_name,
      Centre: r.student.centre,
      Teacher: r.student.teacher,
    };
    if (showScores) {
      for (const qt of questionTypes) base[qt.name] = r.scoresByType[qt.id] ?? 0;
      base["Total Score"] = r.totalScore;
      base["Max Possible"] = r.maxPossibleScore;
      base["Percentage"] = Math.round(r.percentage * 100) / 100;
    }
    base["Trophy"] = r.trophy ? `${r.trophy.icon ?? ""} ${r.trophy.name}`.trim() : "";
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function studentsToWorkbook(): ArrayBuffer {
  const d = db();
  const students = d
    .prepare(
      `SELECT s.first_name, s.last_name, s.dob, c.name AS category, s.centre, s.teacher
       FROM students s JOIN categories c ON c.id = s.category_id
       ORDER BY c.name, s.last_name, s.first_name`
    )
    .all() as Record<string, string | number>[];
  const ws = XLSX.utils.json_to_sheet(
    students.map((s) => ({
      "First Name": s.first_name,
      "Last Name": s.last_name,
      "Date of Birth": s.dob,
      Category: s.category,
      Centre: s.centre,
      Teacher: s.teacher,
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
