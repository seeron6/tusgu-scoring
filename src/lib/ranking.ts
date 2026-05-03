import type {
  LeaderboardRow,
  QuestionType,
  Score,
  Student,
  TrophyAllocation,
  TrophyType,
} from "./types";
import { calculateAge } from "./utils";

export type LeaderboardInputs = {
  students: Student[];
  scores: Score[];
  questionTypes: QuestionType[];
  trophyTypes?: TrophyType[];
  trophyAllocations?: TrophyAllocation[];
  applyTrophies?: boolean;
};

export function buildLeaderboard({
  students,
  scores,
  questionTypes,
  trophyTypes = [],
  trophyAllocations = [],
  applyTrophies = false,
}: LeaderboardInputs): LeaderboardRow[] {
  const scoresByStudent = new Map<number, Record<number, number>>();
  for (const s of scores) {
    let m = scoresByStudent.get(s.student_id);
    if (!m) {
      m = {};
      scoresByStudent.set(s.student_id, m);
    }
    m[s.question_type_id] = s.value;
  }

  const pointsByQt: Record<number, number> = {};
  let maxPossible = 0;
  for (const qt of questionTypes) {
    pointsByQt[qt.id] = qt.points_per_question;
    maxPossible += qt.points_per_question * qt.max_questions;
  }

  const grouped = new Map<string, Student[]>();
  for (const s of students) {
    const key = s.category ?? "(uncategorised)";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  const trophyAssignments = applyTrophies
    ? assignTrophies(grouped, scoresByStudent, trophyTypes, trophyAllocations, pointsByQt)
    : new Map<number, TrophyType>();

  const rows: LeaderboardRow[] = [];
  const categoryKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  for (const cat of categoryKeys) {
    const list = grouped.get(cat)!;
    const sorted = sortByCanonicalRank(list, scoresByStudent, pointsByQt);
    sorted.forEach((student, i) => {
      const sm = scoresByStudent.get(student.id) ?? {};
      const totalScore = totalPoints(sm, pointsByQt);
      rows.push({
        rank: i + 1,
        student,
        age: calculateAge(student.dob),
        scoresByType: sm,
        totalScore,
        maxPossibleScore: maxPossible,
        percentage: maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0,
        trophy: trophyAssignments.get(student.id) ?? null,
      });
    });
  }
  return rows;
}

/** Sum of (correct count × points_per_question) across all question types. */
export function totalPoints(
  scores: Record<number, number>,
  pointsByQt: Record<number, number>
): number {
  let total = 0;
  for (const [qid, count] of Object.entries(scores)) {
    const ppq = pointsByQt[Number(qid)] ?? 1;
    total += (count || 0) * ppq;
  }
  return total;
}

/**
 * Canonical ranking within a category:
 *  1) total points DESC (correct count × points_per_question)
 *  2) DOB DESC (younger student wins ties)
 *  3) full name ASC (alphabetical tertiary tiebreaker)
 */
export function sortByCanonicalRank(
  students: Student[],
  scoresByStudent: Map<number, Record<number, number>>,
  pointsByQt: Record<number, number>
): Student[] {
  return [...students].sort((a, b) => {
    const ta = totalPoints(scoresByStudent.get(a.id) ?? {}, pointsByQt);
    const tb = totalPoints(scoresByStudent.get(b.id) ?? {}, pointsByQt);
    if (tb !== ta) return tb - ta;
    const ad = a.dob ? new Date(a.dob).getTime() : 0;
    const bd = b.dob ? new Date(b.dob).getTime() : 0;
    if (bd !== ad) return bd - ad;
    return (a.full_name || "").localeCompare(b.full_name || "", undefined, {
      sensitivity: "base",
    });
  });
}

function assignTrophies(
  grouped: Map<string, Student[]>,
  scoresByStudent: Map<number, Record<number, number>>,
  trophyTypes: TrophyType[],
  allocations: TrophyAllocation[],
  pointsByQt: Record<number, number>
): Map<number, TrophyType> {
  const ordered = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);
  const out = new Map<number, TrophyType>();
  for (const [category, list] of grouped.entries()) {
    const sorted = sortByCanonicalRank(list, scoresByStudent, pointsByQt);
    const queue = [...sorted];
    for (const tt of ordered) {
      const alloc = allocations.find(
        (a) => a.category === category && a.trophy_type_id === tt.id
      );
      const qty = alloc?.quantity ?? 0;
      for (let i = 0; i < qty && queue.length > 0; i++) {
        const winner = queue.shift()!;
        if (!out.has(winner.id)) out.set(winner.id, tt);
      }
    }
  }
  return out;
}

export function groupByTrophyAlphabetical(rows: LeaderboardRow[]): {
  trophy: TrophyType | null;
  rows: LeaderboardRow[];
}[] {
  const map = new Map<string, { trophy: TrophyType | null; rows: LeaderboardRow[] }>();
  for (const r of rows) {
    const key = r.trophy ? `${r.trophy.display_order}:${r.trophy.id}` : "zzz:none";
    if (!map.has(key)) map.set(key, { trophy: r.trophy, rows: [] });
    map.get(key)!.rows.push(r);
  }
  const groups = Array.from(map.values()).sort((a, b) => {
    if (!a.trophy && !b.trophy) return 0;
    if (!a.trophy) return 1;
    if (!b.trophy) return -1;
    return a.trophy.display_order - b.trophy.display_order;
  });
  for (const g of groups) {
    g.rows.sort((a, b) =>
      (a.student.full_name || "").localeCompare(b.student.full_name || "", undefined, {
        sensitivity: "base",
      })
    );
  }
  return groups;
}
