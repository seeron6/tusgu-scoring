import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { buildLeaderboard } from "@/lib/ranking";
import type { QuestionType } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const applyTrophies = url.searchParams.get("trophies") === "1";

  const d = db();
  const wb = XLSX.utils.book_new();

  // Categories
  const categories = d.prepare("SELECT name, description FROM categories ORDER BY name").all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categories), "Categories");

  // Question types
  const qts = d
    .prepare(
      "SELECT name, points_per_question, max_questions, (points_per_question * max_questions) AS max_score FROM question_types ORDER BY display_order"
    )
    .all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qts), "Question Types");

  // Students
  const students = d
    .prepare(
      `SELECT s.first_name AS "First Name", s.last_name AS "Last Name", s.dob AS "Date of Birth",
              c.name AS "Category", s.centre AS "Centre", s.teacher AS "Teacher"
       FROM students s JOIN categories c ON c.id = s.category_id
       ORDER BY c.name, s.last_name, s.first_name`
    )
    .all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(students), "Students");

  // Leaderboard
  const lb = buildLeaderboard({ applyTrophies });
  const qtList = d
    .prepare("SELECT * FROM question_types ORDER BY display_order ASC, id ASC")
    .all() as QuestionType[];
  const lbData = lb.map((r) => {
    const base: Record<string, string | number> = {
      Rank: r.rank,
      Name: `${r.student.first_name} ${r.student.last_name}`,
      DOB: r.student.dob,
      Age: r.age,
      Category: r.student.category_name,
      Centre: r.student.centre,
      Teacher: r.student.teacher,
    };
    for (const qt of qtList) base[qt.name] = r.scoresByType[qt.id] ?? 0;
    base["Total"] = r.totalScore;
    base["Max"] = r.maxPossibleScore;
    base["Percentage"] = Math.round(r.percentage * 100) / 100;
    if (applyTrophies) base["Trophy"] = r.trophy ? `${r.trophy.icon ?? ""} ${r.trophy.name}`.trim() : "";
    return base;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lbData), "Leaderboard");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="tusgu-full-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
