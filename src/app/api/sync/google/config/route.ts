import { NextResponse } from "next/server";
import { z } from "zod";
import { readConfig, writeConfig, readState, extractSheetId } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = readConfig();
  const s = readState();
  return NextResponse.json({
    sheetId: c.sheetId,
    studentsTab: c.studentsTab,
    leaderboardTab: c.leaderboardTab,
    awardsTab: c.awardsTab,
    autoSyncMinutes: c.autoSyncMinutes,
    serviceAccountConfigured: !!c.serviceAccountJson,
    serviceAccountEmail: extractEmail(c.serviceAccountJson),
    state: s,
  });
}

const schema = z.object({
  serviceAccountJson: z.string().optional().nullable(),
  /** Accepts a full URL or a bare ID; we extract */
  sheetUrlOrId: z.string().optional().nullable(),
  studentsTab: z.string().optional(),
  leaderboardTab: z.string().optional(),
  awardsTab: z.string().optional(),
  autoSyncMinutes: z.number().int().min(0).max(1440).optional(),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const update: Parameters<typeof writeConfig>[0] = {};

  if (parsed.data.serviceAccountJson != null) {
    const trimmed = parsed.data.serviceAccountJson.trim();
    if (trimmed) {
      try {
        const obj = JSON.parse(trimmed);
        if (!obj.client_email || !obj.private_key) {
          return NextResponse.json({ error: "JSON is missing client_email or private_key" }, { status: 400 });
        }
        update.serviceAccountJson = trimmed;
      } catch {
        return NextResponse.json({ error: "Service account JSON is not valid JSON" }, { status: 400 });
      }
    }
  }

  if (parsed.data.sheetUrlOrId != null) {
    const id = parsed.data.sheetUrlOrId.trim() ? extractSheetId(parsed.data.sheetUrlOrId) : null;
    if (parsed.data.sheetUrlOrId.trim() && !id) {
      return NextResponse.json({ error: "Could not parse a sheet ID from that URL/value" }, { status: 400 });
    }
    update.sheetId = id;
  }
  if (parsed.data.studentsTab !== undefined) update.studentsTab = parsed.data.studentsTab;
  if (parsed.data.leaderboardTab !== undefined) update.leaderboardTab = parsed.data.leaderboardTab || "Leaderboard";
  if (parsed.data.awardsTab !== undefined) update.awardsTab = parsed.data.awardsTab || "Awards";
  if (parsed.data.autoSyncMinutes !== undefined) update.autoSyncMinutes = parsed.data.autoSyncMinutes;

  writeConfig(update);
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
