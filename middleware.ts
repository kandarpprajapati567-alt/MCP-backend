import { NextResponse, type NextRequest } from "next/server";

// This backend uses a private owner master token for server API routes.
// Supabase Auth sessions are intentionally not refreshed or required.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
