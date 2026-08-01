import { NextRequest } from "next/server"
import { authPlayer, getOrCreatePlayer, getPlayerReferrals, serializePlayer, unauthorized, getClientIp } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

/**
 * Sync is intentionally a READ refresh now.
 * Balance / inventory / timers are server-authoritative and mutated only via
 * dedicated game endpoints (cases/open, upgrade/play, deposit, promo, rocket).
 * Accepting client snapshots here was the primary economy exploit vector.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  try {
    const player = await getOrCreatePlayer(user, undefined, getClientIp(req))
    const referrals = await getPlayerReferrals(user.id)
    return Response.json(serializePlayer(player, referrals))
  } catch (e) {
    console.error("[v0] sync error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
