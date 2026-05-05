import type {
  Competition,
  LeaderboardRow,
  QuestionType,
  Score,
  Student,
  TrophyAllocation,
  TrophyType,
} from "./types";
import { calculateAge, maxQuestionsFor } from "./utils";

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
  for (const qt of questionTypes) {
    pointsByQt[qt.id] = qt.points_per_question;
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
    // Max possible is per-category because some categories have a higher
    // question count for Add/Sub (the A/B/C/U/V/Y/Z prefix override).
    const maxPossible = questionTypes.reduce(
      (sum, qt) => sum + qt.points_per_question * maxQuestionsFor(qt, cat),
      0
    );
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
  const visualAllocs = allocations.filter((a) => (a.competition ?? "visual") === "visual");
  const out = new Map<number, TrophyType>();
  for (const [category, list] of grouped.entries()) {
    const sorted = sortByCanonicalRank(list, scoresByStudent, pointsByQt);
    const queue = [...sorted];
    for (const tt of ordered) {
      const alloc = visualAllocs.find(
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

// =============================================================
// Listening / Flash position-based leaderboard
// =============================================================

export type PositionLeaderboardRow = {
  category: string;
  position: number;            // 1-based rank entered by the user
  student: Student;
  trophy: TrophyType | null;
};

export type PositionInputs = {
  students: Student[];
  trophyTypes: TrophyType[];
  trophyAllocations: TrophyAllocation[];
  competition: Extract<Competition, "listening" | "flash">;
};

/**
 * Build a leaderboard for the Listening / Flash competitions. These are
 * live-entered, so the rank is the user-supplied position field on each
 * student (`listening_position` or `flash_position`).
 *
 * Trophy rules: per category, allocations describe how many trophies of
 * each type to hand out. Trophies are awarded in trophy display_order to
 * students sorted by ascending position (1 first, then 2, …). Ties / nulls
 * are handled by sorting nulls last.
 */
export function buildPositionLeaderboard({
  students,
  trophyTypes,
  trophyAllocations,
  competition,
}: PositionInputs): PositionLeaderboardRow[] {
  const isListening = competition === "listening";
  const allocs = trophyAllocations.filter((a) => a.competition === competition);
  const orderedTrophies = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);

  // Group eligible students by their competition's category
  const grouped = new Map<string, Student[]>();
  for (const s of students) {
    const cat = (isListening ? s.listening_category : s.flash_category) ?? null;
    if (!cat) continue;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(s);
  }

  const rows: PositionLeaderboardRow[] = [];
  for (const [category, list] of grouped.entries()) {
    // Only ranked students factor into the trophy queue.
    const ranked = list
      .filter((s) => {
        const p = isListening ? s.listening_position : s.flash_position;
        return typeof p === "number" && p > 0;
      })
      .sort((a, b) => {
        const pa = (isListening ? a.listening_position : a.flash_position) ?? Infinity;
        const pb = (isListening ? b.listening_position : b.flash_position) ?? Infinity;
        if (pa !== pb) return pa - pb;
        return (a.full_name || "").localeCompare(b.full_name || "");
      });

    // Walk the trophy types in display_order, popping from the front of the
    // ranked queue to hand out each trophy.
    const queue = [...ranked];
    const assignments = new Map<number, TrophyType>();
    for (const tt of orderedTrophies) {
      const alloc = allocs.find(
        (a) => a.category === category && a.trophy_type_id === tt.id
      );
      const qty = alloc?.quantity ?? 0;
      for (let i = 0; i < qty && queue.length > 0; i++) {
        const winner = queue.shift()!;
        if (!assignments.has(winner.id)) assignments.set(winner.id, tt);
      }
    }

    for (const s of ranked) {
      const position = (isListening ? s.listening_position : s.flash_position) ?? 0;
      rows.push({
        category,
        position,
        student: s,
        trophy: assignments.get(s.id) ?? null,
      });
    }
  }
  return rows;
}

/**
 * Roll up trophy counts and points across all three competitions, keyed by
 * teacher (or centre) name. Used by the Coaches leaderboard so a coach's
 * Visual + Listening + Flash trophies all contribute.
 */
export type CoachRollup = {
  key: string;
  centres?: Set<string>;
  studentCount: number;
  totalTrophies: number;
  totalPoints: number;
  trophyCounts: Record<number, number>;        // trophy_type_id -> count
  byCompetition: Record<Competition, { trophies: number; points: number }>;
};

export function rollupCoachTrophies(
  visualRows: LeaderboardRow[],
  listeningRows: PositionLeaderboardRow[],
  flashRows: PositionLeaderboardRow[],
  mode: "teachers" | "centres",
  allStudents: Student[]
): CoachRollup[] {
  const map = new Map<string, CoachRollup>();

  function ensure(key: string, student: Student): CoachRollup {
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        centres: mode === "teachers" ? new Set<string>() : undefined,
        studentCount: 0,
        totalTrophies: 0,
        totalPoints: 0,
        trophyCounts: {},
        byCompetition: {
          visual:    { trophies: 0, points: 0 },
          listening: { trophies: 0, points: 0 },
          flash:     { trophies: 0, points: 0 },
        },
      };
      map.set(key, g);
    }
    if (mode === "teachers" && student.centre) g.centres?.add(student.centre);
    return g;
  }

  // First add ALL students so the coach shows even if their kids didn't win.
  const seenKeyForStudent = new Set<string>();
  for (const s of allStudents) {
    const key = (mode === "teachers" ? s.teacher : s.centre) ?? "(unknown)";
    const g = ensure(key, s);
    const stKey = `${key}::${s.id}`;
    if (!seenKeyForStudent.has(stKey)) {
      seenKeyForStudent.add(stKey);
      g.studentCount += 1;
    }
  }

  function addTrophy(student: Student, trophy: TrophyType, comp: Competition) {
    const key = (mode === "teachers" ? student.teacher : student.centre) ?? "(unknown)";
    const g = ensure(key, student);
    g.trophyCounts[trophy.id] = (g.trophyCounts[trophy.id] ?? 0) + 1;
    g.totalTrophies += 1;
    g.totalPoints += trophy.points ?? 0;
    g.byCompetition[comp].trophies += 1;
    g.byCompetition[comp].points += trophy.points ?? 0;
  }

  for (const r of visualRows) if (r.trophy) addTrophy(r.student, r.trophy, "visual");
  for (const r of listeningRows) if (r.trophy) addTrophy(r.student, r.trophy, "listening");
  for (const r of flashRows) if (r.trophy) addTrophy(r.student, r.trophy, "flash");

  return Array.from(map.values()).sort((a, b) => b.totalPoints - a.totalPoints);
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
