"use client";
import { supabase } from "./supabase";
import type {
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

export async function listStudents(): Promise<Student[]> {
  const { data, error } = await supabase()
    .from("students")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Student[];
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
  const { data, error } = await supabase().from("scores").select("*");
  if (error) throw error;
  return (data ?? []) as Score[];
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
  quantity: number
): Promise<void> {
  const { error } = await supabase()
    .from("trophy_allocations")
    .upsert(
      { trophy_type_id: trophyTypeId, category, quantity },
      { onConflict: "trophy_type_id,category" }
    );
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
