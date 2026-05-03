import { NextResponse } from "next/server";
import { buildLeaderboard } from "@/lib/ranking";
import { leaderboardToWorkbook } from "@/lib/excel";
import { db } from "@/lib/db";
import type { QuestionType } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const applyTrophies = url.searchParams.get("trophies") === "1";
  const categoryFilter = url.searchParams.get("categories")?.split(",").filter(Boolean);
  const centreFilter = url.searchParams.get("centres")?.split(",").filter(Boolean);
  const teacherFilter = url.searchParams.get("teachers")?.split(",").filter(Boolean);
  const minScore = url.searchParams.get("min");
  const maxScore = url.searchParams.get("max");

  let rows = buildLeaderboard({ applyTrophies });
  if (categoryFilter && categoryFilter.length)
    rows = rows.filter((r) => categoryFilter.includes(r.student.category_name));
  if (centreFilter && centreFilter.length)
    rows = rows.filter((r) => centreFilter.includes(r.student.centre));
  if (teacherFilter && teacherFilter.length)
    rows = rows.filter((r) => teacherFilter.includes(r.student.teacher));
  if (minScore != null) rows = rows.filter((r) => r.totalScore >= Number(minScore));
  if (maxScore != null) rows = rows.filter((r) => r.totalScore <= Number(maxScore));

  const qts = db()
    .prepare("SELECT * FROM question_types ORDER BY display_order ASC, id ASC")
    .all() as QuestionType[];

  const buf = leaderboardToWorkbook(rows, qts);
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="tusgu-leaderboard-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
