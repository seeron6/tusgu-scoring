import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.number().int().positive(),
  centre: z.string().trim().min(1).max(120),
  teacher: z.string().trim().min(1).max(120),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { first_name, last_name, dob, category_id, centre, teacher } = parsed.data;
  db()
    .prepare(
      "UPDATE students SET first_name = ?, last_name = ?, dob = ?, category_id = ?, centre = ?, teacher = ? WHERE id = ?"
    )
    .run(first_name, last_name, dob, category_id, centre, teacher, Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db().prepare("DELETE FROM students WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
