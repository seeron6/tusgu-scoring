import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = rateLimit(`login:${ip}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfter}s.` },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });

  const { username, password } = parsed.data;
  const user = db()
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  // dummy compare to mitigate timing attacks if user not found
  const ok = user
    ? await bcrypt.compare(password, user.password_hash)
    : (await bcrypt.compare(password, "$2a$12$dummyhashthatneverequalsanyrealhashvalue000000000000"), false);

  if (!ok || !user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = await createSession(user.id, user.username);
  const res = NextResponse.json({ ok: true, username: user.username });
  setSessionCookie(res, token);
  return res;
}
