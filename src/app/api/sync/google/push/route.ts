import { NextResponse } from "next/server";
import { readConfig, writeSheetGrid, writeState } from "@/lib/google-sheets";
import { buildLeaderboard, groupByTrophyAlphabetical } from "@/lib/ranking";
import { db } from "@/lib/db";
import type { QuestionType } from "@/lib/types";

export async function POST(req: Request) {
  const cfg = readConfig();
  if (!cfg.serviceAccountJson || !cfg.sheetId) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 400 });
  }
  const url = new URL(req.url);
  const target = url.searchParams.get("target") ?? "leaderboard"; // "leaderboard" | "awards"
  const hideScores = url.searchParams.get("hide_scores") === "1";
  const applyTrophies = url.searchParams.get("trophies") === "1" || target === "awards";

  try {
    const rows = buildLeaderboard({ applyTrophies });
    const qts = db()
      .prepare("SELECT * FROM question_types ORDER BY display_order ASC, id ASC")
      .all() as QuestionType[];

    if (target === "awards") {
      // Per-category sections, grouped by trophy, alphabetical inside each
      const byCat = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!byCat.has(r.student.category_name)) byCat.set(r.student.category_name, []);
        byCat.get(r.student.category_name)!.push(r);
      }
      const header = ["Category", "Trophy", "Name", "DOB", "Centre", "Teacher", ...(hideScores ? [] : ["Total"])];
      const grid: (string | number)[][] = [];
      for (const [cat, list] of Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const groups = groupByTrophyAlphabetical(list);
        for (const g of groups) {
          if (!g.trophy) continue; // only show actual trophy winners
          for (const r of g.rows) {
            grid.push([
              cat,
              `${g.trophy.icon ?? ""} ${g.trophy.name}`.trim(),
              `${r.student.first_name} ${r.student.last_name}`,
              r.student.dob,
              r.student.centre,
              r.student.teacher,
              ...(hideScores ? [] : [r.totalScore]),
            ]);
          }
        }
      }
      await writeSheetGrid(cfg.awardsTab, header, grid);
      writeState({ lastPushAt: new Date().toISOString(), lastError: null });
      return NextResponse.json({ ok: true, rows: grid.length, target: "awards", tab: cfg.awardsTab });
    }

    const header = [
      "Rank",
      "Name",
      "DOB",
      "Age",
      "Category",
      "Centre",
      "Teacher",
      ...(hideScores ? [] : qts.map((q) => q.name)),
      ...(hideScores ? [] : ["Total", "Max", "Percentage"]),
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
      ...(hideScores ? [] : qts.map((q) => r.scoresByType[q.id] ?? 0)),
      ...(hideScores ? [] : [r.totalScore, r.maxPossibleScore, Math.round(r.percentage * 100) / 100]),
      r.trophy ? `${r.trophy.icon ?? ""} ${r.trophy.name}`.trim() : "",
    ]);

    await writeSheetGrid(cfg.leaderboardTab, header, data);
    writeState({ lastPushAt: new Date().toISOString(), lastError: null });
    return NextResponse.json({ ok: true, rows: data.length, target: "leaderboard", tab: cfg.leaderboardTab });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Push failed";
    writeState({ lastError: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
