import { NextResponse } from "next/server";
import { parseWorkbook, autoMapColumns, previewScoreImport, commitScoreImport } from "@/lib/excel";
import { db } from "@/lib/db";
import type { QuestionType } from "@/lib/types";

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";

  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    const buf = await file.arrayBuffer();
    let parsed;
    try {
      parsed = parseWorkbook(buf);
    } catch {
      return NextResponse.json({ error: "Failed to parse workbook" }, { status: 400 });
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "Workbook is empty" }, { status: 400 });
    }
    const studentMapping = autoMapColumns(parsed.headers);
    const qts = db().prepare("SELECT * FROM question_types ORDER BY display_order").all() as QuestionType[];

    // Auto-detect score columns by question type name
    const typeMapping: Record<number, string | null> = {};
    for (const qt of qts) {
      const lower = qt.name.toLowerCase();
      const found = parsed.headers.find((h) => String(h).toLowerCase().trim() === lower);
      typeMapping[qt.id] = found ?? null;
    }

    return NextResponse.json({
      headers: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      mapping: {
        name: studentMapping.first_name && studentMapping.last_name ? null : autoFindNameColumn(parsed.headers),
        dob: studentMapping.dob,
        types: typeMapping,
      },
      questionTypes: qts,
      sample: parsed.rows.slice(0, 5),
    });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { rows, mapping } = body as {
    rows: Record<string, unknown>[];
    mapping: { name: string; dob: string | null; types: Record<number, string | null> };
  };
  if (!rows || !mapping?.name) return NextResponse.json({ error: "rows and mapping.name required" }, { status: 400 });
  const preview = previewScoreImport(rows as never[], mapping);
  const result = commitScoreImport(preview);
  return NextResponse.json({ ...result, invalid: preview.invalid.length, matched: preview.valid.length });
}

function autoFindNameColumn(headers: string[]): string | null {
  const hints = ["name", "student name", "student", "full name"];
  const lower = headers.map((h) => ({ orig: h, low: String(h).toLowerCase().trim() }));
  for (const hint of hints) {
    const found = lower.find((c) => c.low === hint) ?? lower.find((c) => c.low.includes(hint));
    if (found) return found.orig;
  }
  return headers[0] ?? null;
}
