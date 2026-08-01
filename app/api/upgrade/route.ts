import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { playUpgradeServer } from "@/lib/player-economy"
import { requireAdmin, forbidden } from "@/lib/admin-auth"
import { getUpgradeLogs } from "@/lib/activity-store"

export const dynamic = "force-dynamic"

// POST — play an upgrade (server RNG). Body: { stakeUid, targetId }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  const stakeUid = String(body.stakeUid || "")
  const targetId = String(body.targetId || "")
  if (!stakeUid || !targetId) {
    return Response.json({ error: "missing stakeUid or targetId" }, { status: 400 })
  }

  try {
    const result = await playUpgradeServer(user, stakeUid, targetId)
    return Response.json(result)
  } catch (e: any) {
    const msg = String(e?.message || e)
    const map: Record<string, number> = {
      stake_not_found: 404,
      invalid_target: 400,
      stake_too_cheap: 400,
      banned: 403,
    }
    const status = map[msg] || 500
    if (status === 500) console.error("[v0] upgrade play error:", e)
    return Response.json({ error: msg }, { status })
  }
}

// GET — admin fetches recent upgrade logs
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return forbidden()
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") || 200))
  const logs = await getUpgradeLogs(limit)
  return Response.json({ logs })
}
