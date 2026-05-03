import { NextResponse, type NextRequest } from "next/server";
import { verifySession, getSessionTokenFromRequest, SESSION_COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) {
    // If already logged in and visiting /login, send to /setup
    if (pathname === "/login") {
      const token = getSessionTokenFromRequest(req);
      if (token) {
        const session = await verifySession(token);
        if (session) return NextResponse.redirect(new URL("/setup", req.url));
      }
    }
    return NextResponse.next();
  }

  const token = getSessionTokenFromRequest(req);
  if (!token) return redirectToLogin(req);
  const session = await verifySession(token);
  if (!session) {
    const res = redirectToLogin(req);
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }
  return NextResponse.next();
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  if (url.pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
