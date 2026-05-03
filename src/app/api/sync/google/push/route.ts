import { NextResponse } from "next/server";
import { readConfig, writeSheetGrid, writeState } from "@/lib/google-sheets";
import { buildLeaderboard } from "@/lib/ranking";
import { db } from "@/lib/db";
import type { QuestionType } from "@/lib/types";

export async function POST(req: Request) {
  const cfg = readConfig();
  if (!cfg.serviceAccountJson || !cfg.sheetId) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 400 });
  }
  const url = new URL(req.url);
  const applyTrophies = url.searchParams.get("trophies") === "1";

  try {
    const rows = buildLeaderboard({ applyTrophies });
    const qts = db()
      .prepare("SELECT * FROM question_types ORDER BY display_order ASC, id ASC")
      .all() as QuestionType[];

    const header = [
      "Rank",
      "Name",
      "DOB",
      "Age",
      "Category",
      "Centre",
      "Teacher",
      ...qts.map((q) => q.name),
      "Total",
      "Max",
      "Percentage",
      "Trophy",
    ];
    const data = rows.map((r) => [
      r.rank,
      `${r.student.first_name} ${r.student.last_name}`,
      r.student.dob,
      r.age,
      r.student.category_name,
      r.student.centre,
      r.student.teacher,
      ...qts.map((q) => r.scoresByType[q.id] ?? 0),
      r.totalScore,
      r.maxPossibleScore,
      Math.round(r.percentage * 100) / 100,
      r.trophy ? `${r.trophy.icon ?? ""} ${r.trophy.name}`.trim() : "",
    ]);

    await writeSheetGrid(cfg.leaderboardRange, header, data);
    writeState({ lastPushAt: new Date().toISOString(), lastError: null });
    return NextResponse.json({ ok: true, rows: data.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Push failed";
    writeState({ lastError: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
