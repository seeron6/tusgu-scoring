import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  points_per_question: z.number().int().min(0).max(10000),
  max_questions: z.number().int().min(0).max(10000),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    db()
      .prepare("UPDATE question_types SET name = ?, points_per_question = ?, max_questions = ? WHERE id = ?")
      .run(parsed.data.name, parsed.data.points_per_question, parsed.data.max_questions, Number(id));
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
  db().prepare("DELETE FROM question_types WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
