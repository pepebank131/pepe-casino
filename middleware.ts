import { NextRequest, NextResponse } from "next/server"

/**
 * Lightweight in-memory rate limiter (per isolate). Good enough on Vercel to
 * blunt bursts; for multi-region abuse add Redis later.
 */
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

const RULES: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/cases/open", limit: 30, windowMs: 60_000 },
  { prefix: "/api/upgrade", limit: 40, windowMs: 60_000 },
  { prefix: "/api/rocket/bet", limit: 40, windowMs: 60_000 },
  { prefix: "/api/rocket/cashout", limit: 60, windowMs: 60_000 },
  { prefix: "/api/deposit/ton", limit: 10, windowMs: 60_000 },
  { prefix: "/api/create-invoice", limit: 20, windowMs: 60_000 },
  { prefix: "/api/promos/redeem", limit: 10, windowMs: 60_000 },
  { prefix: "/api/admin/", limit: 120, windowMs: 60_000 },
  { prefix: "/api/inventory/", limit: 40, windowMs: 60_000 },
  { prefix: "/api/", limit: 300, windowMs: 60_000 },
]

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (!path.startsWith("/api/")) return NextResponse.next()

  // Never put secrets in query strings via redirects; strip initData from URL if present.
  if (req.nextUrl.searchParams.has("initData")) {
    const url = req.nextUrl.clone()
    url.searchParams.delete("initData")
    // Allow through but prefer header — we just don't want it logged in query.
    // Actually blocking query initData forces clients to use headers only.
    return NextResponse.json({ error: "initData_in_query_forbidden" }, { status: 400 })
  }

  const ip = clientIp(req)
  for (const rule of RULES) {
    if (path.startsWith(rule.prefix)) {
      const key = `${rule.prefix}:${ip}`
      if (!hit(key, rule.limit, rule.windowMs)) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 })
      }
      break
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
