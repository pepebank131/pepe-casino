import { NextResponse, type NextRequest } from "next/server"

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  for (const [key, value] of Object.entries(securityHeaders)) {
    res.headers.set(key, value)
  }
  if (req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  }
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
