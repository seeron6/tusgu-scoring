import { NextResponse } from "next/server";
import { testConnection } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await testConnection();
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
