import { NextResponse } from "next/server";
import { parseWorkbook, autoMapColumns, previewStudentImport, commitStudentImport } from "@/lib/excel";
import { STUDENT_FIELDS, type ImportMode, type StudentField } from "@/lib/excel-types";

// Accept multipart upload OR JSON commit body
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
    const mapping = autoMapColumns(parsed.headers);
    const preview = previewStudentImport(parsed.rows, mapping);
    return NextResponse.json({
      headers: parsed.headers,
      mapping,
      rowCount: parsed.rows.length,
      preview,
      // echo first 5 raw rows for the UI to show
      sample: parsed.rows.slice(0, 5),
      rows: parsed.rows,
    });
  }

  // JSON commit
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { rows, mapping, duplicateMode } = body as {
    rows?: Record<string, unknown>[];
    mapping?: Record<StudentField, string | null>;
    duplicateMode?: ImportMode;
  };
  if (!rows || !mapping) return NextResponse.json({ error: "rows and mapping required" }, { status: 400 });
  // Validate mapping shape
  for (const f of STUDENT_FIELDS) {
    if (!(f in mapping)) return NextResponse.json({ error: `Mapping missing field: ${f}` }, { status: 400 });
  }
  const preview = previewStudentImport(rows as never[], mapping);
  const result = commitStudentImport(preview, duplicateMode === "overwrite" ? "overwrite" : "skip");
  return NextResponse.json({ ...result, invalid: preview.invalid.length });
}
