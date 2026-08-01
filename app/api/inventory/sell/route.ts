import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { sellInventoryItem } from "@/lib/player-economy"
import { assertUserNotBanned, BannedError } from "@/lib/ban"

export const dynamic = "force-dynamic"

// POST /api/inventory/sell — sell one owned NFT for its floor price (server-side).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()
  try {
    await assertUserNotBanned(user)
  } catch (e) {
    if (e instanceof BannedError) return Response.json({ error: "banned" }, { status: 403 })
    throw e
  }

  const nftUid = String(body.nftUid || "")
  if (!nftUid) return Response.json({ error: "missing nftUid" }, { status: 400 })

  try {
    const result = await sellInventoryItem(user, nftUid)
    return Response.json(result)
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg === "nft_not_found") return Response.json({ error: msg }, { status: 404 })
    console.error("[v0] inventory/sell error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
