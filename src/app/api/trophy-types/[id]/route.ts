import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(8).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    db()
      .prepare("UPDATE trophy_types SET name = ?, icon = ?, description = ? WHERE id = ?")
      .run(parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db().prepare("DELETE FROM trophy_types WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
