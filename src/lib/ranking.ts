import { db } from "./db";
import type { Category, LeaderboardRow, QuestionType, StudentWithCategory, TrophyType } from "./types";
import { calculateAge } from "./utils";

export type LeaderboardOptions = {
  applyTrophies?: boolean;
};

export function buildLeaderboard(opts: LeaderboardOptions = {}): LeaderboardRow[] {
  const d = db();
  const students = d
    .prepare(
      `SELECT s.*, c.name AS category_name
       FROM students s JOIN categories c ON c.id = s.category_id`
    )
    .all() as StudentWithCategory[];

  const questionTypes = d
    .prepare("SELECT * FROM question_types ORDER BY display_order ASC, id ASC")
    .all() as QuestionType[];

  const scoresByStudent = new Map<number, Record<number, number>>();
  const allScores = d.prepare("SELECT student_id, question_type_id, value FROM scores").all() as {
    student_id: number;
    question_type_id: number;
    value: number;
  }[];
  for (const s of allScores) {
    let m = scoresByStudent.get(s.student_id);
    if (!m) {
      m = {};
      scoresByStudent.set(s.student_id, m);
    }
    m[s.question_type_id] = s.value;
  }

  const maxPossible = questionTypes.reduce(
    (sum, qt) => sum + qt.points_per_question * qt.max_questions,
    0
  );

  // Group by category, sort within each category by canonical ranking
  const grouped = new Map<number, StudentWithCategory[]>();
  for (const s of students) {
    if (!grouped.has(s.category_id)) grouped.set(s.category_id, []);
    grouped.get(s.category_id)!.push(s);
  }

  const trophyAssignments = opts.applyTrophies ? computeTrophyAssignments(grouped, scoresByStudent) : new Map();

  const rows: LeaderboardRow[] = [];
  // Categories ordered by name for stable display
  const categories = Array.from(grouped.entries()).sort((a, b) => {
    const an = a[1][0]?.category_name ?? "";
    const bn = b[1][0]?.category_name ?? "";
    return an.localeCompare(bn);
  });

  for (const [, list] of categories) {
    const sorted = sortByCanonicalRank(list, scoresByStudent);
    sorted.forEach((student, i) => {
      const sm = scoresByStudent.get(student.id) ?? {};
      const totalScore = totalForStudent(student.id, scoresByStudent);
      const trophy = trophyAssignments.get(student.id) ?? null;
      rows.push({
        rank: i + 1,
        student,
        age: calculateAge(student.dob),
        scoresByType: sm,
        totalScore,
        maxPossibleScore: maxPossible,
        percentage: maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0,
        trophy,
      });
    });
  }
  return rows;
}

export function totalForStudent(
  studentId: number,
  scoresByStudent: Map<number, Record<number, number>>
): number {
  const m = scoresByStudent.get(studentId);
  if (!m) return 0;
  return Object.values(m).reduce((a, b) => a + (b || 0), 0);
}

/**
 * Canonical rank within a category:
 *   1) total score DESC
 *   2) DOB DESC (younger student wins ties)
 */
export function sortByCanonicalRank(
  students: StudentWithCategory[],
  scoresByStudent: Map<number, Record<number, number>>
): StudentWithCategory[] {
  return [...students].sort((a, b) => {
    const ta = totalForStudent(a.id, scoresByStudent);
    const tb = totalForStudent(b.id, scoresByStudent);
    if (tb !== ta) return tb - ta;
    // younger first => later DOB ranks higher
    return new Date(b.dob).getTime() - new Date(a.dob).getTime();
  });
}

function computeTrophyAssignments(
  grouped: Map<number, StudentWithCategory[]>,
  scoresByStudent: Map<number, Record<number, number>>
): Map<number, TrophyType> {
  const d = db();
  const trophyTypes = d
    .prepare("SELECT * FROM trophy_types ORDER BY display_order ASC, id ASC")
    .all() as TrophyType[];
  const allocations = d.prepare("SELECT * FROM trophy_allocations").all() as {
    trophy_type_id: number;
    category_id: number;
    quantity: number;
  }[];

  const assignments = new Map<number, TrophyType>();

  for (const [categoryId, students] of grouped.entries()) {
    const sorted = sortByCanonicalRank(students, scoresByStudent);
    const queue = [...sorted];

    for (const tt of trophyTypes) {
      const alloc = allocations.find(
        (a) => a.category_id === categoryId && a.trophy_type_id === tt.id
      );
      const qty = alloc?.quantity ?? 0;
      for (let i = 0; i < qty && queue.length > 0; i++) {
        const winner = queue.shift()!;
        if (!assignments.has(winner.id)) assignments.set(winner.id, tt);
      }
    }
  }
  return assignments;
}

export function getCategoryPreview(categoryId: number): {
  category: Category | null;
  rows: { student: StudentWithCategory; totalScore: number; trophy: TrophyType | null }[];
} {
  const d = db();
  const category = d.prepare("SELECT * FROM categories WHERE id = ?").get(categoryId) as Category | undefined;
  if (!category) return { category: null, rows: [] };

  const students = d
    .prepare(
      `SELECT s.*, c.name AS category_name
       FROM students s JOIN categories c ON c.id = s.category_id
       WHERE s.category_id = ?`
    )
    .all(categoryId) as StudentWithCategory[];

  const allScores = d.prepare("SELECT student_id, question_type_id, value FROM scores").all() as {
    student_id: number;
    question_type_id: number;
    value: number;
  }[];
  const scoresByStudent = new Map<number, Record<number, number>>();
  for (const s of allScores) {
    let m = scoresByStudent.get(s.student_id);
    if (!m) {
      m = {};
      scoresByStudent.set(s.student_id, m);
    }
    m[s.question_type_id] = s.value;
  }

  const grouped = new Map<number, StudentWithCategory[]>([[categoryId, students]]);
  const assignments = computeTrophyAssignments(grouped, scoresByStudent);
  const sorted = sortByCanonicalRank(students, scoresByStudent);

  return {
    category,
    rows: sorted.map((s) => ({
      student: s,
      totalScore: totalForStudent(s.id, scoresByStudent),
      trophy: assignments.get(s.id) ?? null,
    })),
  };
}
