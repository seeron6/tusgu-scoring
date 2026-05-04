import * as XLSX from "xlsx";
import type { LeaderboardRow, QuestionType, Student, StudentInsert } from "./types";
import { STUDENT_FIELDS, type StudentField, type ImportMode } from "./excel-types";

export { STUDENT_FIELDS, type StudentField, type ImportMode };

export type ParsedRow = Record<string, string | number | undefined>;

export type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: ParsedRow[];
  rowCount: number;
};

export type ParsedWorkbook = {
  sheetNames: string[];
  sheets: ParsedSheet[];
  /** Heuristically chosen "best" student-roster sheet. */
  best: ParsedSheet | null;
};

// =============================================================
// Workbook parsing — handles .xlsx, .xls, .xlsm, .csv
// =============================================================

export function parseWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  // SheetJS handles xlsm transparently — macros are ignored, sheet data is
  // read as normal. cellDates lets us preserve native Excel dates.
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const cleaned = cleanGrid(aoa);
    sheets.push({
      sheetName: name,
      headers: cleaned.headers,
      rows: cleaned.rows,
      rowCount: cleaned.rows.length,
    });
  }
  // Score each sheet by how many "student-roster" headers it has, then prefer
  // the one with the most rows (so we pick the master list, not a summary).
  const ranked = sheets
    .map((s) => ({ s, score: scoreSheet(s) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.s.rowCount - a.s.rowCount;
    });
  return { sheetNames: wb.SheetNames, sheets, best: ranked[0]?.s ?? null };
}

// =============================================================
// Smart header detection — finds the row that's most likely the column
// header even when the sheet has banner / merged-cell rows above it.
// =============================================================

const HEADER_HINTS = [
  "name", "first", "last", "surname", "given", "fullname",
  "code", "barcode", "exam",
  "dob", "birth", "born",
  "category", "group", "division", "class", "level", "grade",
  "centre", "center", "school", "branch", "site", "location", "team",
  "teacher", "tutor", "coach", "instructor", "ci",
  "score", "total", "addition", "subtraction", "multiplication",
  "listening", "visual",
  "email", "phone", "mobile",
  "size", "shirt", "tshirt",
  "time",
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
      if (v.length > 50) continue;
      if (HEADER_HINTS.some((h) => v === h || v.includes(h))) score++;
    }
    if (score >= 2 && nonEmpty >= 3 && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function cleanGrid(grid: unknown[][]): { headers: string[]; rows: ParsedRow[] } {
  if (!grid || grid.length === 0) return { headers: [], rows: [] };
  const headerIdx = findHeaderRow(grid);
  if (headerIdx < 0) {
    const idx = grid.findIndex((r) => Array.isArray(r) && r.some((c) => normalizeCell(c) !== ""));
    if (idx < 0) return { headers: [], rows: [] };
    return buildFromHeader(grid, idx);
  }
  return buildFromHeader(grid, headerIdx);
}

function buildFromHeader(grid: unknown[][], headerIdx: number): { headers: string[]; rows: ParsedRow[] } {
  const rawHeaders = grid[headerIdx] as unknown[];
  const headers: string[] = [];
  const seen: Record<string, number> = {};
  for (let i = 0; i < rawHeaders.length; i++) {
    let h = normalizeCell(rawHeaders[i]) || `Column ${i + 1}`;
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
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    // Use LOCAL date components — SheetJS creates Excel dates at local midnight,
    // and toISOString() shifts them by the timezone offset (so a +5:30 user
    // sees DOB shift back by one day). Reading getFullYear/getMonth/getDate
    // gives us the date the user actually typed.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).replace(/\s+/g, " ").trim();
}

function scoreSheet(s: ParsedSheet): number {
  // Count how many of the canonical student fields auto-map to a header.
  const map = autoMapColumns(s.headers);
  let n = 0;
  for (const f of STUDENT_FIELDS) if (map[f]) n++;
  return n;
}

// =============================================================
// Column auto-mapping — broader than before, matches headers like
// "Student Fullname", "Visual 2025 Category", "CI Name", "Centre", etc.
// =============================================================

const FIELD_HINTS: Record<StudentField, string[]> = {
  student_code: ["student code", "studentcode", "student id", "studentid"],
  exam_code: ["exam code", "examcode", "exam id", "examcode", "exam"],
  barcode: ["barcode", "bar code"],
  full_name: ["student fullname", "fullname", "student full name", "full name", "student name", "name", "pupil", "child"],
  first_name: ["first name", "firstname", "given name", "fname"],
  last_name: ["last name", "lastname", "surname", "family name", "lname"],
  dob: ["date of birth", "dob", "birth date", "birthdate", "birthday", "born"],
  gender: ["gender", "sex", "m/f", "male/female"],
  category: ["visual 2025 category", "category", "group", "division", "section", "class"],
  level: ["level as of", "current level", "level"],
  listening_category: ["listening category"],
  listening_code: ["listening code", "listen code"],
  centre: ["center name", "centre name", "centre", "center", "school", "branch"],
  teacher: ["ci name", "teacher", "tutor", "instructor", "coach"],
  ci_code: ["ci code"],
  tshirt_size: ["t-shirt size", "tshirt size", "t-shirt", "tshirt", "shirt size"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "contact"],
  report_time: ["report time", "report"],
  comp_time: ["comp time", "competition time", "exam time"],
  deduction: ["deduction"],
};

export function autoMapColumns(headers: string[]): Record<StudentField, string | null> {
  const result = {} as Record<StudentField, string | null>;
  const lower = headers.map((h) => ({ orig: h, low: h.toLowerCase().trim() }));

  for (const f of STUDENT_FIELDS) {
    const hints = FIELD_HINTS[f];
    let matched: string | null = null;
    // Pass 1 — exact match.
    for (const h of hints) {
      const exact = lower.find((c) => c.low === h);
      if (exact) {
        matched = exact.orig;
        break;
      }
    }
    // Pass 2 — substring match, longest hint wins so "visual 2025 category"
    // beats "category" when both could match.
    if (!matched) {
      const sortedHints = [...hints].sort((a, b) => b.length - a.length);
      for (const h of sortedHints) {
        const partial = lower.find((c) => c.low.includes(h));
        if (partial) {
          matched = partial.orig;
          break;
        }
      }
    }
    result[f] = matched;
  }

  // Disambiguate: full_name preferred over first/last because the master list
  // uses "Student Fullname". If only first/last present, drop full_name.
  if (!result.full_name && result.first_name && result.last_name) {
    // OK to keep first/last, full_name will be derived during import.
  } else if (result.full_name && (result.first_name || result.last_name)) {
    // Prefer full_name when available, drop the others (they'd otherwise
    // overwrite the value we already have).
    result.first_name = null;
    result.last_name = null;
  }
  return result;
}

// =============================================================
// Date parsing — supports ISO, dd-Mon-yyyy, dd/mm/yyyy, dd-mm-yyyy, Excel serials
// =============================================================

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function normalizeDob(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    // See normalizeCell — local components avoid the UTC shift bug.
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(input).trim();
  if (!raw) return null;

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // "17-Nov-2012" / "1 Jan 2015" / "Jan 17, 2015"
  const monNum = raw.match(/^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s\-\/.]+(\d{2,4})$/);
  if (monNum) {
    const [, dStr, mStr, yStr] = monNum;
    const m = MONTHS[mStr.slice(0, 3).toLowerCase()];
    if (m) {
      const y = yStr.length === 2 ? (parseInt(yStr, 10) > 30 ? 1900 : 2000) + parseInt(yStr, 10) : parseInt(yStr, 10);
      return `${y}-${String(m).padStart(2, "0")}-${String(parseInt(dStr, 10)).padStart(2, "0")}`;
    }
  }

  // Numeric DMY / MDY
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, mo, y] = dmy;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
    const dn = parseInt(d, 10);
    const mn = parseInt(mo, 10);
    const yn = parseInt(y, 10);
    if (mn >= 1 && mn <= 12 && dn >= 1 && dn <= 31) {
      return `${yn}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
    }
    if (dn >= 1 && dn <= 12 && mn >= 1 && mn <= 31) {
      return `${yn}-${String(dn).padStart(2, "0")}-${String(mn).padStart(2, "0")}`;
    }
  }

  // Excel serial (raw number persisted as a string by `raw: false`).
  // Build a UTC Date and read UTC components so we don't shift across timezones.
  if (/^\d{4,6}$/.test(raw)) {
    const serial = parseInt(raw, 10);
    const utcMs = Date.UTC(1899, 11, 30) + serial * 86400 * 1000;
    const d = new Date(utcMs);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

// =============================================================
// Student import — turn raw rows into StudentInsert objects
// =============================================================

function normalizeGender(input: string): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (v === "m" || v === "male" || v === "boy" || v === "b") return "Male";
  if (v === "f" || v === "female" || v === "girl" || v === "g") return "Female";
  return input.trim();
}

export type StudentImportPreview = {
  valid: StudentInsert[];
  invalid: { row: number; reason: string; raw: ParsedRow }[];
  duplicates: { row: number; existingId: number; data: StudentInsert }[];
};

export function previewStudentImport(
  rows: ParsedRow[],
  mapping: Record<StudentField, string | null>,
  existing: Student[]
): StudentImportPreview {
  const preview: StudentImportPreview = { valid: [], invalid: [], duplicates: [] };

  const byCodeOrName = new Map<string, number>();
  for (const s of existing) {
    if (s.student_code) byCodeOrName.set(`code:${s.student_code}`, s.id);
    if (s.exam_code) byCodeOrName.set(`exam:${s.exam_code}`, s.id);
    if (s.full_name && s.dob) byCodeOrName.set(`name:${s.full_name.toLowerCase()}|${s.dob}`, s.id);
  }

  rows.forEach((raw, idx) => {
    const get = (col: string | null): string => {
      if (!col) return "";
      const v = raw[col];
      return v == null ? "" : String(v).trim();
    };

    let fullName = get(mapping.full_name);
    if (!fullName) {
      const first = get(mapping.first_name);
      const last = get(mapping.last_name);
      fullName = `${first} ${last}`.trim();
    }
    if (!fullName) {
      preview.invalid.push({ row: idx + 2, reason: "Missing student name", raw });
      return;
    }

    const dobRaw = mapping.dob ? raw[mapping.dob] : "";
    const dob = normalizeDob(dobRaw);

    // Anything in the row that wasn't mapped goes into `extra` so the data
    // isn't lost. The original column name is preserved as the key.
    const mappedCols = new Set(
      STUDENT_FIELDS.map((f) => mapping[f]).filter((x): x is string => Boolean(x))
    );
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (mappedCols.has(k)) continue;
      const trimmed = typeof v === "string" ? v.trim() : v;
      if (trimmed === "" || trimmed == null) continue;
      extra[k] = trimmed;
    }

    const data: StudentInsert = {
      student_code: get(mapping.student_code) || null,
      exam_code: get(mapping.exam_code) || null,
      barcode: get(mapping.barcode) || null,
      full_name: fullName,
      dob,
      gender: normalizeGender(get(mapping.gender)),
      category: get(mapping.category) || null,
      level: get(mapping.level) || null,
      listening_category: get(mapping.listening_category) || null,
      listening_code: get(mapping.listening_code) || null,
      centre: get(mapping.centre) || null,
      teacher: get(mapping.teacher) || null,
      ci_code: get(mapping.ci_code) || null,
      tshirt_size: get(mapping.tshirt_size) || null,
      email: get(mapping.email) || null,
      phone: get(mapping.phone) || null,
      report_time: get(mapping.report_time) || null,
      comp_time: get(mapping.comp_time) || null,
      deduction: get(mapping.deduction) || null,
      notes: null,
      extra,
    };

    let dupId: number | undefined;
    if (data.student_code) dupId = byCodeOrName.get(`code:${data.student_code}`);
    if (!dupId && data.exam_code) dupId = byCodeOrName.get(`exam:${data.exam_code}`);
    if (!dupId && data.dob) dupId = byCodeOrName.get(`name:${data.full_name.toLowerCase()}|${data.dob}`);

    if (dupId) {
      preview.duplicates.push({ row: idx + 2, existingId: dupId, data });
    } else {
      preview.valid.push(data);
    }
  });
  return preview;
}

// =============================================================
// Score import (matches by student name, exam_code, or student_code)
// =============================================================

export type ScoreImportPreview = {
  valid: { studentId: number; values: Record<number, number> }[];
  invalid: { row: number; reason: string; raw: ParsedRow }[];
};

export function previewScoreImport(
  rows: ParsedRow[],
  mapping: { name: string | null; code: string | null; types: Record<number, string | null> },
  students: Student[],
  questionTypes: QuestionType[]
): ScoreImportPreview {
  const byName = new Map<string, number>();
  const byCode = new Map<string, number>();
  for (const s of students) {
    byName.set(s.full_name.toLowerCase().trim(), s.id);
    if (s.exam_code) byCode.set(s.exam_code, s.id);
    if (s.student_code) byCode.set(s.student_code, s.id);
    if (s.barcode) byCode.set(s.barcode, s.id);
  }
  const qtById = new Map(questionTypes.map((q) => [q.id, q]));

  const preview: ScoreImportPreview = { valid: [], invalid: [] };
  rows.forEach((raw, idx) => {
    const name = mapping.name ? String(raw[mapping.name] ?? "").trim() : "";
    const code = mapping.code ? String(raw[mapping.code] ?? "").trim() : "";
    const sid =
      (code && byCode.get(code)) ?? (name && byName.get(name.toLowerCase())) ?? null;
    if (!sid) {
      preview.invalid.push({
        row: idx + 2,
        reason: name || code ? `Student "${name || code}" not found` : "Missing student name/code",
        raw,
      });
      return;
    }
    const values: Record<number, number> = {};
    for (const [typeIdStr, col] of Object.entries(mapping.types)) {
      if (!col) continue;
      const v = Number(raw[col]);
      if (Number.isFinite(v)) {
        const qt = qtById.get(Number(typeIdStr));
        // value is the count of correct questions, capped at max_questions
        const max = qt ? qt.max_questions : Infinity;
        values[Number(typeIdStr)] = Math.max(0, Math.min(max, v));
      }
    }
    preview.valid.push({ studentId: sid, values });
  });
  return preview;
}

// =============================================================
// Export helpers — generate xlsx files for download
// =============================================================

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
      Name: r.student.full_name,
      "Student Code": r.student.student_code ?? "",
      "Exam Code": r.student.exam_code ?? "",
      DOB: r.student.dob ?? "",
      Age: r.age ?? "",
      Category: r.student.category ?? "",
      Centre: r.student.centre ?? "",
      Teacher: r.student.teacher ?? "",
    };
    if (showScores) {
      for (const qt of questionTypes) {
        const correct = r.scoresByType[qt.id] ?? 0;
        base[`${qt.name} (correct)`] = correct;
        base[`${qt.name} (points)`] = correct * qt.points_per_question;
      }
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

export function studentsToWorkbook(students: Student[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(
    students.map((s) => ({
      "Student Code": s.student_code ?? "",
      "Exam Code": s.exam_code ?? "",
      "Full Name": s.full_name,
      "Date of Birth": s.dob ?? "",
      Category: s.category ?? "",
      Level: s.level ?? "",
      Centre: s.centre ?? "",
      Teacher: s.teacher ?? "",
      Email: s.email ?? "",
      Phone: s.phone ?? "",
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build a CSV string from the same shape we use for xlsx exports. */
export function leaderboardToCsv(
  rows: LeaderboardRow[],
  questionTypes: QuestionType[],
  opts: ExportOptions = {}
): string {
  const showScores = !opts.hideScores;
  const headers = ["Rank", "Name", "Student Code", "Exam Code", "DOB", "Age", "Category", "Centre", "Teacher"];
  if (showScores) {
    for (const qt of questionTypes) {
      headers.push(`${qt.name} (correct)`);
      headers.push(`${qt.name} (points)`);
    }
    headers.push("Total Score", "Max Possible", "Percentage");
  }
  headers.push("Trophy");

  const lines: string[] = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    const cells: (string | number)[] = [
      r.rank,
      r.student.full_name,
      r.student.student_code ?? "",
      r.student.exam_code ?? "",
      r.student.dob ?? "",
      r.age ?? "",
      r.student.category ?? "",
      r.student.centre ?? "",
      r.student.teacher ?? "",
    ];
    if (showScores) {
      for (const qt of questionTypes) {
        const correct = r.scoresByType[qt.id] ?? 0;
        cells.push(correct);
        cells.push(correct * qt.points_per_question);
      }
      cells.push(r.totalScore, r.maxPossibleScore, Math.round(r.percentage * 100) / 100);
    }
    cells.push(r.trophy ? r.trophy.name : "");
    lines.push(cells.map((c) => csvEscape(String(c))).join(","));
  }
  return lines.join("\n");
}

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
