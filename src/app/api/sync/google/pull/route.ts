import { NextResponse } from "next/server";
import { fetchStudentsFromSheet, readConfig, writeState } from "@/lib/google-sheets";
import { autoMapColumns, previewStudentImport, commitStudentImport } from "@/lib/excel";
import type { ImportMode } from "@/lib/excel-types";

export async function POST(req: Request) {
  const cfg = readConfig();
  if (!cfg.serviceAccountJson) {
    return NextResponse.json({ error: "Service account not configured. Paste your JSON key in Sync." }, { status: 400 });
  }
  if (!cfg.sheetId) {
    return NextResponse.json({ error: "No Google Sheet linked. Paste a sheet URL in Sync." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    duplicateMode?: ImportMode;
    dryRun?: boolean;
    defaults?: { category?: string; centre?: string; teacher?: string };
  };

  try {
    const fetched = await fetchStudentsFromSheet();
    if (!fetched || fetched.rows.length === 0) {
      return NextResponse.json({ error: "Sheet appears to be empty or has no recognizable header row." }, { status: 400 });
    }
    const mapping = autoMapColumns(fetched.headers);
    const preview = previewStudentImport(fetched.rows, mapping, body.defaults);
    if (body.dryRun) {
      writeState({ lastError: null });
      return NextResponse.json({
        dryRun: true,
        tab: fetched.tab,
        headers: fetched.headers,
        mapping,
        rowCount: fetched.rows.length,
        valid: preview.valid.length,
        invalid: preview.invalid.length,
        duplicates: preview.duplicates.length,
        sampleInvalid: preview.invalid.slice(0, 5),
      });
    }
    const result = commitStudentImport(preview, body.duplicateMode === "overwrite" ? "overwrite" : "skip");
    writeState({ lastPullAt: new Date().toISOString(), lastError: null });
    return NextResponse.json({
      ...result,
      invalid: preview.invalid.length,
      tab: fetched.tab,
      mapping,
      headers: fetched.headers,
      rowCount: fetched.rows.length,
    });
  } catch (e: unknown) {
    const msg = friendlyError(e);
    writeState({ lastError: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Pull failed";
  if (raw.includes("permission") || raw.includes("403") || raw.includes("does not have"))
    return "Google denied access. Share the sheet with the service account email (Editor) and try again.";
  if (raw.includes("not found") || raw.includes("404")) return "Sheet not found. Check the URL.";
  return raw;
}
