import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge middleware: a cheap gate, not the authorisation boundary.
 *
 * It only checks that a structurally valid, unexpired access token is present,
 * so an unauthenticated visitor is redirected without a database round trip.
 * Every route handler still calls `requireApiUser`, and every server component
 * still calls `requireUser` — middleware running on the Edge runtime cannot
 * reach Prisma, so it must never be the only thing standing between a request
 * and someone's data.
 */

const ACCESS_COOKIE = "lx_at";

const PUBLIC_PATHS = ["/", "/login", "/register"];
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/", "/favicon", "/manifest", "/sw.js", "/icons/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  let valid = false;

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
      await jwtVerify(token, secret, { issuer: "lexicon", audience: "lexicon-web" });
      valid = true;
    } catch {
      // Expired or tampered. The client's refresh flow handles the expired
      // case for API calls; page navigations fall through to the redirect.
      valid = false;
    }
  }

  if (valid) return NextResponse.next();

  // API routes get a 401 the client can act on; pages get a redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sign in to continue", code: "unauthorized" },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
