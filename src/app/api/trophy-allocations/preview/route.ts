import { NextResponse } from "next/server";
import { getCategoryPreview } from "@/lib/ranking";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("category_id"));
  if (!id) return NextResponse.json({ error: "category_id required" }, { status: 400 });
  return NextResponse.json(getCategoryPreview(id));
}
