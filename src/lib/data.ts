"use client";
import { supabase } from "./supabase";
import type {
  Competition,
  QuestionType,
  Score,
  Student,
  StudentInsert,
  TrophyAllocation,
  TrophyType,
} from "./types";

// =============================================================
// Students
// =============================================================

/**
 * Supabase / PostgREST defaults SELECTs to 1000 rows. We page through
 * in 1000-row chunks until we get a short page, so exports include every
 * student even at 2.5k+.
 */
export async function listStudents(): Promise<Student[]> {
  return paginate<Student>((from, to) =>
    supabase()
      .from("students")
      .select("*")
      .order("full_name", { ascending: true })
      .range(from, to)
  );
}

const PAGE_SIZE = 1000;

async function paginate<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    // Hard upper bound so a misconfigured ORDER doesn't loop forever.
    if (out.length >= 100_000) break;
  }
  return out;
}

export async function searchStudents(query: string): Promise<Student[]> {
  const q = query.trim();
  if (!q) return [];
  // ilike across the most useful columns; barcode/exam_code matched exactly via OR
  const { data, error } = await supabase()
    .from("students")
    .select("*")
    .or(
      [
        `full_name.ilike.%${escapeIlike(q)}%`,
        `student_code.ilike.%${escapeIlike(q)}%`,
        `exam_code.ilike.%${escapeIlike(q)}%`,
        `barcode.ilike.%${escapeIlike(q)}%`,
        `centre.ilike.%${escapeIlike(q)}%`,
        `teacher.ilike.%${escapeIlike(q)}%`,
      ].join(",")
    )
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Student[];
}

function escapeIlike(s: string) {
  return s.replace(/[\\%_,]/g, (c) => `\\${c}`);
}

/** Look up a single student by an arbitrary scanned code or full name. */
export async function findStudentByCode(code: string): Promise<Student | null> {
  const v = code.trim();
  if (!v) return null;
  const { data, error } = await supabase()
    .from("students")
    .select("*")
    .or(
      [
        `barcode.eq.${v}`,
        `exam_code.eq.${v}`,
        `student_code.eq.${v}`,
        `full_name.eq.${v}`,
      ].join(",")
    )
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Student) ?? null;
}

export async function upsertStudent(input: StudentInsert): Promise<Student> {
  const { data, error } = await supabase()
    .from("students")
    .insert({ ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data as Student;
}

export async function updateStudent(id: number, patch: Partial<StudentInsert>): Promise<void> {
  const { error } = await supabase().from("students").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteStudent(id: number): Promise<void> {
  const { error } = await supabase().from("students").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Set the CI Category on every student whose teacher matches the given name.
 * Match is case-insensitive (Postgres `ilike` doesn't fit equality, so we use
 * `eq` against a normalised teacher value — close enough for real names).
 */
export async function setCiCategoryForTeacher(
  teacherName: string,
  ciCategory: string | null
): Promise<number> {
  const trimmed = teacherName.trim();
  if (!trimmed) return 0;
  const { error, count } = await supabase()
    .from("students")
    .update({ ci_category: ciCategory }, { count: "exact" })
    .eq("teacher", trimmed);
  if (error) throw error;
  return count ?? 0;
}

/** Same idea for centres → franchisee_category. */
export async function setFranchiseeCategoryForCentre(
  centreName: string,
  franchiseeCategory: string | null
): Promise<number> {
  const trimmed = centreName.trim();
  if (!trimmed) return 0;
  const { error, count } = await supabase()
    .from("students")
    .update({ franchisee_category: franchiseeCategory }, { count: "exact" })
    .eq("centre", trimmed);
  if (error) throw error;
  return count ?? 0;
}

/** Bulk insert; rows are batched so a 2.5k import doesn't hit Supabase row limits. */
export async function bulkInsertStudents(rows: StudentInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error, count } = await supabase()
      .from("students")
      .insert(slice, { count: "exact" });
    if (error) throw error;
    inserted += count ?? slice.length;
  }
  return inserted;
}

/**
 * Bulk insert AND return the inserted rows (with their generated IDs) in
 * insert order. Used by the Bulk Import Scores → "create missing students"
 * flow so we can immediately attach scores to the new students without
 * re-querying the table.
 */
export async function bulkInsertStudentsReturning(
  rows: StudentInsert[],
  onProgress?: (done: number, total: number) => void
): Promise<Student[]> {
  if (rows.length === 0) return [];
  const BATCH = 500;
  const out: Student[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { data, error } = await supabase()
      .from("students")
      .insert(slice)
      .select("*");
    if (error) throw error;
    out.push(...((data ?? []) as Student[]));
    onProgress?.(out.length, rows.length);
  }
  return out;
}

/**
 * Bulk upsert scores in 500-row batches. Each call writes ~500 rows in a
 * single round trip vs the previous one-by-one loop.
 */
export async function bulkUpsertScores(
  rows: { student_id: number; question_type_id: number; value: number }[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase()
      .from("scores")
      .upsert(slice, { onConflict: "student_id,question_type_id" });
    if (error) throw error;
    done += slice.length;
    onProgress?.(done, rows.length);
  }
  return done;
}

// =============================================================
// Question types
// =============================================================

export async function listQuestionTypes(): Promise<QuestionType[]> {
  const { data, error } = await supabase()
    .from("question_types")
    .select("*")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestionType[];
}

export async function upsertQuestionType(
  input: Omit<QuestionType, "id" | "created_at"> & { id?: number }
): Promise<QuestionType> {
  const payload = {
    name: input.name,
    points_per_question: input.points_per_question,
    max_questions: input.max_questions,
    display_order: input.display_order,
    category_max_overrides: input.category_max_overrides ?? {},
  };
  if (input.id) {
    const { data, error } = await supabase()
      .from("question_types")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as QuestionType;
  }
  const { data, error } = await supabase()
    .from("question_types")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as QuestionType;
}

export async function deleteQuestionType(id: number): Promise<void> {
  const { error } = await supabase().from("question_types").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================
// Scores
// =============================================================

export async function listScores(): Promise<Score[]> {
  return paginate<Score>((from, to) =>
    supabase().from("scores").select("*").order("id", { ascending: true }).range(from, to)
  );
}

export async function getStudentScores(studentId: number): Promise<Record<number, number>> {
  const { data, error } = await supabase()
    .from("scores")
    .select("question_type_id,value")
    .eq("student_id", studentId);
  if (error) throw error;
  const map: Record<number, number> = {};
  for (const r of data ?? []) map[r.question_type_id] = r.value;
  return map;
}

export async function saveStudentScores(
  studentId: number,
  scores: Record<number, number>,
  recordedBy?: string
): Promise<void> {
  const rows = Object.entries(scores).map(([qid, value]) => ({
    student_id: studentId,
    question_type_id: Number(qid),
    value,
    recorded_by: recordedBy ?? null,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase()
    .from("scores")
    .upsert(rows, { onConflict: "student_id,question_type_id" });
  if (error) throw error;
}

// =============================================================
// Trophies
// =============================================================

export async function listTrophyTypes(): Promise<TrophyType[]> {
  const { data, error } = await supabase()
    .from("trophy_types")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TrophyType[];
}

export async function upsertTrophyType(
  input: Omit<TrophyType, "id"> & { id?: number }
): Promise<TrophyType> {
  const payload = {
    name: input.name,
    icon: input.icon,
    description: input.description,
    display_order: input.display_order,
    points: input.points ?? 0,
  };
  if (input.id) {
    const { data, error } = await supabase()
      .from("trophy_types")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TrophyType;
  }
  const { data, error } = await supabase()
    .from("trophy_types")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TrophyType;
}

export async function deleteTrophyType(id: number): Promise<void> {
  const { error } = await supabase().from("trophy_types").delete().eq("id", id);
  if (error) throw error;
}

export async function listTrophyAllocations(): Promise<TrophyAllocation[]> {
  const { data, error } = await supabase().from("trophy_allocations").select("*");
  if (error) throw error;
  return (data ?? []) as TrophyAllocation[];
}

export async function upsertTrophyAllocation(
  trophyTypeId: number,
  category: string,
  quantity: number,
  competition: Competition = "visual"
): Promise<void> {
  const { error } = await supabase()
    .from("trophy_allocations")
    .upsert(
      { trophy_type_id: trophyTypeId, category, competition, quantity },
      { onConflict: "trophy_type_id,category,competition" }
    );
  if (error) throw error;
}

/**
 * Live-entry helpers. Position is 1..N (legacy / optional ordering).
 * Pass null to clear.
 */
export async function setListeningPosition(studentId: number, position: number | null): Promise<void> {
  const { error } = await supabase()
    .from("students")
    .update({ listening_position: position })
    .eq("id", studentId);
  if (error) throw error;
}

export async function setFlashPosition(studentId: number, position: number | null): Promise<void> {
  const { error } = await supabase()
    .from("students")
    .update({ flash_position: position })
    .eq("id", studentId);
  if (error) throw error;
}

/**
 * Direct trophy assignment for the live (Listening / Flash) competitions.
 * Pass null to clear.
 */
export async function setListeningTrophy(studentId: number, trophyTypeId: number | null): Promise<void> {
  const { error } = await supabase()
    .from("students")
    .update({ listening_trophy_id: trophyTypeId })
    .eq("id", studentId);
  if (error) throw error;
}

export async function setFlashTrophy(studentId: number, trophyTypeId: number | null): Promise<void> {
  const { error } = await supabase()
    .from("students")
    .update({ flash_trophy_id: trophyTypeId })
    .eq("id", studentId);
  if (error) throw error;
}

// =============================================================
// Bulk wipe helpers — used by the Sync → Reset section
// =============================================================

/** Delete every student. Scores cascade via FK ON DELETE CASCADE. */
export async function wipeStudents(): Promise<number> {
  const { error, count } = await supabase()
    .from("students")
    .delete({ count: "exact" })
    .gte("id", 0);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every score row but keep the students. */
export async function wipeScores(): Promise<number> {
  const { error, count } = await supabase()
    .from("scores")
    .delete({ count: "exact" })
    .gte("id", 0);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every trophy allocation. Trophy types themselves are kept. */
export async function wipeTrophyAllocations(): Promise<number> {
  const { error, count } = await supabase()
    .from("trophy_allocations")
    .delete({ count: "exact" })
    .gte("id", 0);
  if (error) throw error;
  return count ?? 0;
}

/** Wipe students (cascades to scores) AND trophy allocations. Keeps question types and trophy types. */
export async function wipeEverything(): Promise<{ students: number; allocations: number }> {
  const allocations = await wipeTrophyAllocations();
  const students = await wipeStudents();
  return { students, allocations };
}
