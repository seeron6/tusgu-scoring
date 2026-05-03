import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildLeaderboard, groupByTrophyAlphabetical } from "@/lib/ranking";
import { awardsToPdf } from "@/lib/pdf";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
  const hideScores = url.searchParams.get("hide_scores") === "1";

  const rows = buildLeaderboard({ applyTrophies: true });
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const buf = awardsToPdf(rows, { hideScores });
    return new NextResponse(buf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="tusgu-awards-${stamp}.pdf"`,
      },
    });
  }

  // Excel: sectioned by category > trophy, alphabetical winners
  const byCat = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byCat.has(r.student.category_name)) byCat.set(r.student.category_name, []);
    byCat.get(r.student.category_name)!.push(r);
  }

  const data: Record<string, string | number>[] = [];
  for (const [cat, list] of Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const groups = groupByTrophyAlphabetical(list);
    for (const g of groups) {
      if (!g.trophy) continue;
      for (const r of g.rows) {
        const row: Record<string, string | number> = {
          Category: cat,
          Trophy: `${g.trophy.icon ?? ""} ${g.trophy.name}`.trim(),
          Name: `${r.student.first_name} ${r.student.last_name}`,
          DOB: r.student.dob,
          Centre: r.student.centre,
          Teacher: r.student.teacher,
        };
        if (!hideScores) row.Total = r.totalScore;
        data.push(row);
      }
    }
  }
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Awards");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  return new NextResponse(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="tusgu-awards-${stamp}.xlsx"`,
    },
  });
}
