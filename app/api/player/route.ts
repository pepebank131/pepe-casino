import { NextRequest } from "next/server"
import { authPlayer, getOrCreatePlayer, getPlayerReferrals, serializePlayer, unauthorized, getClientIp } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

// Fetch (or lazily create) the current player's full state from the shared bot DB.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  try {
    const player = await getOrCreatePlayer(user, body.referredBy, getClientIp(req))
    const referrals = await getPlayerReferrals(player.uid)
    return Response.json(serializePlayer(player, referrals))
  } catch (e) {
    console.error("[v0] player load error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
