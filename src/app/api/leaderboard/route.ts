import { NextResponse } from "next/server";
import { buildLeaderboard } from "@/lib/ranking";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const applyTrophies = url.searchParams.get("trophies") === "1";
  const rows = buildLeaderboard({ applyTrophies });
  return NextResponse.json(rows);
}
