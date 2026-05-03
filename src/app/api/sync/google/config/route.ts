import { NextResponse } from "next/server";
import { z } from "zod";
import { readConfig, writeConfig, readState } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = readConfig();
  const s = readState();
  // Don't expose the raw service account JSON
  return NextResponse.json({
    sheetId: c.sheetId,
    studentsRange: c.studentsRange,
    leaderboardRange: c.leaderboardRange,
    autoSyncMinutes: c.autoSyncMinutes,
    serviceAccountConfigured: !!c.serviceAccountJson,
    serviceAccountEmail: extractEmail(c.serviceAccountJson),
    state: s,
  });
}

const schema = z.object({
  serviceAccountJson: z.string().optional().nullable(),
  sheetId: z.string().nullable().optional(),
  studentsRange: z.string().optional(),
  leaderboardRange: z.string().optional(),
  autoSyncMinutes: z.number().int().min(0).max(1440).optional(),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  // Validate that serviceAccountJson is parseable if provided & non-empty
  if (parsed.data.serviceAccountJson && parsed.data.serviceAccountJson.trim()) {
    try {
      const obj = JSON.parse(parsed.data.serviceAccountJson);
      if (!obj.client_email || !obj.private_key) {
        return NextResponse.json({ error: "JSON is missing client_email or private_key" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Service account JSON is not valid JSON" }, { status: 400 });
    }
  }
  writeConfig(parsed.data);
  return NextResponse.json({ ok: true });
}

function extractEmail(json: string | null): string | null {
  if (!json) return null;
  try {
    return JSON.parse(json).client_email ?? null;
  } catch {
    return null;
  }
}
