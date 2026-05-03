import { NextResponse } from "next/server";
import { fetchSheetRows, readConfig, writeState } from "@/lib/google-sheets";
import { autoMapColumns, previewStudentImport, commitStudentImport } from "@/lib/excel";
import type { ImportMode } from "@/lib/excel-types";

export async function POST(req: Request) {
  const cfg = readConfig();
  if (!cfg.serviceAccountJson || !cfg.sheetId) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({})) as { duplicateMode?: ImportMode };

  try {
    const { headers, rows } = await fetchSheetRows(cfg.studentsRange);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Sheet is empty" }, { status: 400 });
    }
    const mapping = autoMapColumns(headers);
    const preview = previewStudentImport(rows as never[], mapping);
    const result = commitStudentImport(preview, body.duplicateMode === "overwrite" ? "overwrite" : "skip");
    writeState({ lastPullAt: new Date().toISOString(), lastError: null });
    return NextResponse.json({
      ...result,
      invalid: preview.invalid.length,
      mapping,
      headers,
      rowCount: rows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Pull failed";
    writeState({ lastError: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
