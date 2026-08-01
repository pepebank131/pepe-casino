import { NextRequest } from "next/server"
import { resolveUser, type TgUser } from "@/lib/telegram-auth"

/**
 * Admin allowlist — env only, never bundled to the client.
 * ADMIN_TELEGRAM_IDS="id1,id2,id3"  (preferred)
 * ADMIN_TELEGRAM_ID="id1"           (fallback, single admin)
 */
export function getAdminIds(): string[] {
  const raw = process.env.ADMIN_TELEGRAM_IDS || process.env.ADMIN_TELEGRAM_ID || ""
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isAdminUser(user: TgUser | null | undefined): boolean {
  if (!user?.id) return false
  const ids = getAdminIds()
  if (ids.length === 0) return false
  return ids.includes(String(user.id))
}

/**
 * Requires verified Telegram initData belonging to an allowlisted admin.
 * NEVER trusts a client-supplied adminId alone.
 */
export function requireAdmin(req: NextRequest, bodyInitData?: string): TgUser | null {
  // Header or body only — never query string (leaks via logs/Referer).
  const initData = req.headers.get("x-telegram-init-data") || bodyInitData || ""
  const user = resolveUser(initData)
  if (!isAdminUser(user)) return null
  return user
}

export function forbidden() {
  return Response.json({ error: "forbidden" }, { status: 403 })
}
