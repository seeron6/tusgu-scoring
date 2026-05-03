import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { QuestionType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const rows = db()
    .prepare("SELECT * FROM scores WHERE student_id = ?")
    .all(Number(studentId)) as { question_type_id: number; value: number }[];
  const map: Record<number, number> = {};
  for (const r of rows) map[r.question_type_id] = r.value;
  return NextResponse.json(map);
}

const schema = z.object({
  scores: z.record(z.string(), z.number().int().min(0)),
});

export async function PUT(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const sid = Number(studentId);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const d = db();
  const student = d.prepare("SELECT id FROM students WHERE id = ?").get(sid);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const qts = d.prepare("SELECT * FROM question_types").all() as QuestionType[];
  const qtById = new Map(qts.map((q) => [q.id, q]));

  const upsert = d.prepare(
    `INSERT INTO scores (student_id, question_type_id, value) VALUES (?, ?, ?)
     ON CONFLICT(student_id, question_type_id) DO UPDATE SET value = excluded.value, recorded_at = CURRENT_TIMESTAMP`
  );
  const tx = d.transaction(() => {
    for (const [qtIdStr, value] of Object.entries(parsed.data.scores)) {
      const qtId = Number(qtIdStr);
      const qt = qtById.get(qtId);
      if (!qt) continue;
      const max = qt.points_per_question * qt.max_questions;
      const clamped = Math.max(0, Math.min(max, value));
      upsert.run(sid, qtId, clamped);
    }
  });
  tx();
  return NextResponse.json({ ok: true });
}
