import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db().prepare("SELECT * FROM trophy_allocations").all();
  return NextResponse.json(rows);
}

const itemSchema = z.object({
  trophy_type_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  quantity: z.number().int().min(0).max(10000),
});
const schema = z.object({ items: z.array(itemSchema) });

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = db();
  const upsert = d.prepare(
    `INSERT INTO trophy_allocations (trophy_type_id, category_id, quantity) VALUES (?, ?, ?)
     ON CONFLICT(trophy_type_id, category_id) DO UPDATE SET quantity = excluded.quantity`
  );
  const tx = d.transaction(() => {
    for (const it of parsed.data.items) {
      upsert.run(it.trophy_type_id, it.category_id, it.quantity);
    }
  });
  tx();
  return NextResponse.json({ ok: true });
}
