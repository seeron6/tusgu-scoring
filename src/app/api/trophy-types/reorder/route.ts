import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({ order: z.array(z.number().int().positive()) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = db();
  const upd = d.prepare("UPDATE trophy_types SET display_order = ? WHERE id = ?");
  const tx = d.transaction(() => {
    parsed.data.order.forEach((id, i) => upd.run(i + 1, id));
  });
  tx();
  return NextResponse.json({ ok: true });
}
