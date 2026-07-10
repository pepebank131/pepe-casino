import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { requireAdmin } from "@/lib/admin-auth"
import { logUpgrade, getUpgradeLogs } from "@/lib/activity-store"

export const dynamic = "force-dynamic"

// POST — player logs an upgrade attempt
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  await logUpgrade({
    userId: String(user.id),
    username: user.username || "Player",
    stakeId: String(body.stakeId || ""),
    stakeName: String(body.stakeName || ""),
    stakePrice: Number(body.stakePrice) || 0,
    targetId: String(body.targetId || ""),
    targetName: String(body.targetName || ""),
    targetPrice: Number(body.targetPrice) || 0,
    chance: Number(body.chance) || 0,
    win: Boolean(body.win),
  })
  return Response.json({ ok: true })
}

// GET — admin fetches recent upgrade logs
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response

  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") || 200))
  const logs = await getUpgradeLogs(limit)
  return Response.json({ logs })
}
