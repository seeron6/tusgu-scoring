import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db()
    .prepare(
      `SELECT s.*, c.name AS category_name
       FROM students s JOIN categories c ON c.id = s.category_id
       ORDER BY s.last_name, s.first_name`
    )
    .all();
  return NextResponse.json(rows);
}

const schema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD"),
  category_id: z.number().int().positive(),
  centre: z.string().trim().min(1).max(120),
  teacher: z.string().trim().min(1).max(120),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const { first_name, last_name, dob, category_id, centre, teacher } = parsed.data;
  const cat = db().prepare("SELECT id FROM categories WHERE id = ?").get(category_id);
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });
  const info = db()
    .prepare(
      "INSERT INTO students (first_name, last_name, dob, category_id, centre, teacher) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(first_name, last_name, dob, category_id, centre, teacher);
  return NextResponse.json({ id: info.lastInsertRowid });
}
