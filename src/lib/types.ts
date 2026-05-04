// =============================================================
// Domain types — mirror the Supabase schema in supabase/schema.sql
// =============================================================

export type QuestionType = {
  id: number;
  name: string;
  points_per_question: number;
  max_questions: number;
  display_order: number;
  // Per-category-prefix overrides (key = first letter of category, value = max).
  category_max_overrides: Record<string, number>;
  created_at?: string;
};

export type Student = {
  id: number;
  student_code: string | null;
  exam_code: string | null;
  barcode: string | null;
  full_name: string;
  dob: string | null;            // ISO yyyy-mm-dd
  gender: string | null;
  category: string | null;
  level: string | null;
  listening_category: string | null;
  listening_code: string | null;
  centre: string | null;
  teacher: string | null;
  ci_code: string | null;
  tshirt_size: string | null;
  email: string | null;
  phone: string | null;
  report_time: string | null;
  comp_time: string | null;
  deduction: string | null;
  notes: string | null;
  extra: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type StudentInsert = Omit<Student, "id" | "created_at" | "updated_at">;

export type Score = {
  id: number;
  student_id: number;
  question_type_id: number;
  value: number;
  recorded_at: string;
  recorded_by: string | null;
};

export type TrophyType = {
  id: number;
  name: string;
  icon: string | null;
  description: string | null;
  display_order: number;
  points: number;
};

export type TrophyAllocation = {
  id: number;
  trophy_type_id: number;
  category: string;
  quantity: number;
};

export type LeaderboardRow = {
  rank: number;
  student: Student;
  age: number | null;
  scoresByType: Record<number, number>;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  trophy: TrophyType | null;
};

