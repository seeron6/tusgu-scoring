import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db()
    .prepare("SELECT * FROM trophy_types ORDER BY display_order ASC, id ASC")
    .all();
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(8).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const order = (db().prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS o FROM trophy_types").get() as { o: number }).o;
    const info = db()
      .prepare("INSERT INTO trophy_types (name, icon, description, display_order) VALUES (?, ?, ?, ?)")
      .run(parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, order);
    return NextResponse.json({ id: info.lastInsertRowid });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Trophy name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
