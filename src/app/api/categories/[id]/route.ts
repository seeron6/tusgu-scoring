import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    db()
      .prepare("UPDATE categories SET name = ?, description = ? WHERE id = ?")
      .run(parsed.data.name, parsed.data.description ?? null, Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    db().prepare("DELETE FROM categories WHERE id = ?").run(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("FOREIGN KEY")) {
      return NextResponse.json(
        { error: "Cannot delete: students are assigned to this category" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
