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
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "", raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { sheetNames: wb.SheetNames, rows, headers };
}

const FIELD_HINTS: Record<StudentField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "given"],
  last_name: ["last name", "lastname", "surname", "family name", "last"],
  dob: ["dob", "date of birth", "birth", "birthday", "born"],
  category: ["category", "group", "division", "class"],
  centre: ["centre", "center", "school", "team", "branch", "location"],
  teacher: ["teacher", "tutor", "instructor", "coach"],
};

export function autoMapColumns(headers: string[]): Record<StudentField, string | null> {
  const result = {} as Record<StudentField, string | null>;
  const lower = headers.map((h) => ({ orig: h, low: String(h).toLowerCase().trim() }));
  for (const f of STUDENT_FIELDS) {
    const hints = FIELD_HINTS[f];
    let matched: string | null = null;
    for (const h of hints) {
      const found = lower.find((c) => c.low === h) || lower.find((c) => c.low.includes(h));
      if (found) {
        matched = found.orig;
        break;
      }
    }
    result[f] = matched;
  }
  return result;
}

export function normalizeDob(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  // try YYYY-MM-DD first
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
    const dn = parseInt(d, 10);
    const mn = parseInt(mo, 10);
    const yn = parseInt(y, 10);
    if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
    return `${yn}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
  }
  // try plain Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
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

export function previewStudentImport(
  rows: ParsedRow[],
  mapping: Record<StudentField, string | null>
): StudentImportPreview {
  const d = db();
  const preview: StudentImportPreview = { valid: [], invalid: [], duplicates: [] };
  const findExisting = d.prepare(
    "SELECT id FROM students WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND dob = ?"
  );

  rows.forEach((raw, idx) => {
    const get = (f: StudentField) => {
      const col = mapping[f];
      if (!col) return "";
      const v = raw[col];
      return v == null ? "" : String(v).trim();
    };
    const first = get("first_name");
    const last = get("last_name");
    const dobRaw = mapping.dob ? raw[mapping.dob] : "";
    const dob = normalizeDob(dobRaw);
    const category = get("category");
    const centre = get("centre");
    const teacher = get("teacher");

    if (!first || !last) {
      preview.invalid.push({ row: idx + 2, reason: "Missing first/last name", raw });
      return;
    }
    if (!dob) {
      preview.invalid.push({ row: idx + 2, reason: "Invalid or missing date of birth", raw });
      return;
    }
    if (!category) {
      preview.invalid.push({ row: idx + 2, reason: "Missing category", raw });
      return;
    }
    if (!centre) {
      preview.invalid.push({ row: idx + 2, reason: "Missing centre", raw });
      return;
    }
    if (!teacher) {
      preview.invalid.push({ row: idx + 2, reason: "Missing teacher", raw });
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

export function commitStudentImport(
  preview: StudentImportPreview,
  duplicateMode: ImportMode
): { inserted: number; updated: number; skipped: number } {
  const d = db();
  const ensureCat = d.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
  const findCat = d.prepare("SELECT id FROM categories WHERE name = ?");
  const insertS = d.prepare(
    "INSERT INTO students (first_name, last_name, dob, category_id, centre, teacher) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const updateS = d.prepare(
    "UPDATE students SET first_name = ?, last_name = ?, dob = ?, category_id = ?, centre = ?, teacher = ? WHERE id = ?"
  );

  const upsert = d.transaction(() => {
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

  return upsert();
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

export function leaderboardToWorkbook(rows: LeaderboardRow[], questionTypes: QuestionType[]): ArrayBuffer {
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
    for (const qt of questionTypes) base[qt.name] = r.scoresByType[qt.id] ?? 0;
    base["Total Score"] = r.totalScore;
    base["Max Possible"] = r.maxPossibleScore;
    base["Percentage"] = Math.round(r.percentage * 100) / 100;
    base["Trophy Position"] = r.trophy ? `${r.trophy.icon ?? ""} ${r.trophy.name}`.trim() : "";
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

export function studentsToWorkbook(): ArrayBuffer {
  const d = db();
  const students = d
    .prepare(
      `SELECT s.id, s.first_name, s.last_name, s.dob, c.name AS category, s.centre, s.teacher
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
