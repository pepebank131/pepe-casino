import { NextRequest } from "next/server"
import { query } from "@/lib/db"
import { resolveUser, type TgUser } from "@/lib/telegram-auth"

const WINDOW_MS = 60_000
const MAX_FAILED_ATTEMPTS = 20
const DEFAULT_ADMIN_IDS = ["1256452126", "6479535975", "7617669253"]

const attempts = new Map<string, { count: number; resetAt: number }>()
let tableEnsured = false

export function getAdminIds(): string[] {
  const raw = process.env.ADMIN_TELEGRAM_IDS || process.env.NEXT_PUBLIC_ADMIN_TELEGRAM_IDS || process.env.ADMIN_TELEGRAM_ID || ""
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))

  if (ids.length > 0) return ids
  return DEFAULT_ADMIN_IDS
}

export function isAdminId(id: string | number | null | undefined): boolean {
  return !!id && getAdminIds().includes(String(id))
}

export function getRequestIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function isLimitedMemory(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS })
    return false
  }
  return entry.count >= MAX_FAILED_ATTEMPTS
}

function recordFailureMemory(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  entry.count += 1
}

function clearFailuresMemory(ip: string) {
  attempts.delete(ip)
}

async function ensureRateLimitTable() {
  if (tableEnsured) return
  await query(
    `CREATE TABLE IF NOT EXISTS admin_auth_attempts (
       ip TEXT PRIMARY KEY,
       count INTEGER NOT NULL DEFAULT 0,
       reset_at BIGINT NOT NULL
     )`,
  )
  tableEnsured = true
}

async function isLimited(ip: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return isLimitedMemory(ip)
  try {
    await ensureRateLimitTable()
    const now = Date.now()
    const rows = await query<{ count: number; reset_at: string | number }>(
      `SELECT count, reset_at FROM admin_auth_attempts WHERE ip = $1`,
      [ip],
    )
    const row = rows[0]
    if (!row || Number(row.reset_at) <= now) return false
    return Number(row.count) >= MAX_FAILED_ATTEMPTS
  } catch (e) {
    console.error("[security] admin rate limit check failed:", e)
    return isLimitedMemory(ip)
  }
}

async function recordFailure(ip: string) {
  recordFailureMemory(ip)
  if (!process.env.DATABASE_URL) return
  try {
    await ensureRateLimitTable()
    const now = Date.now()
    await query(
      `INSERT INTO admin_auth_attempts (ip, count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (ip) DO UPDATE SET
         count = CASE
           WHEN admin_auth_attempts.reset_at <= $3 THEN 1
           ELSE admin_auth_attempts.count + 1
         END,
         reset_at = CASE
           WHEN admin_auth_attempts.reset_at <= $3 THEN $2
           ELSE admin_auth_attempts.reset_at
         END`,
      [ip, now + WINDOW_MS, now],
    )
  } catch (e) {
    console.error("[security] admin rate limit record failed:", e)
  }
}

async function clearFailures(ip: string) {
  clearFailuresMemory(ip)
  if (!process.env.DATABASE_URL) return
  try {
    await ensureRateLimitTable()
    await query(`DELETE FROM admin_auth_attempts WHERE ip = $1`, [ip])
  } catch (e) {
    console.error("[security] admin rate limit clear failed:", e)
  }
}

export function getInitDataFromRequest(req: NextRequest, bodyInitData?: unknown): string {
  return (
    req.headers.get("x-telegram-init-data") ||
    (typeof bodyInitData === "string" ? bodyInitData : "") ||
    ""
  )
}

export async function requireAdmin(
  req: NextRequest,
  bodyInitData?: unknown,
): Promise<{ ok: true; user: TgUser } | { ok: false; response: Response }> {
  const ip = getRequestIp(req)
  if (await isLimited(ip)) {
    console.warn("[security] admin auth rate limited", { ip, path: req.nextUrl.pathname })
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) }
  }

  const user = resolveUser(getInitDataFromRequest(req, bodyInitData))
  if (user && isAdminId(user.id)) {
    await clearFailures(ip)
    console.info("[security] admin access granted", { adminId: user.id, path: req.nextUrl.pathname })
    return { ok: true, user }
  }

  await recordFailure(ip)
  console.warn("[security] admin access denied", { ip, path: req.nextUrl.pathname })
  return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) }
}
