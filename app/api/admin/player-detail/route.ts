import { NextRequest } from "next/server"
import { getPlayerDetail, setPlayerBalance, removePlayerNft } from "@/lib/admin-stats-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// GET — full profile + activity history for a single player.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const uid = req.nextUrl.searchParams.get("uid") || ""
    if (!uid) return Response.json({ error: "missing uid" }, { status: 400 })
    const detail = await getPlayerDetail(uid)
    if (!detail) return Response.json({ error: "not found" }, { status: 404 })
    return Response.json(detail)
  } catch (e) {
    console.error("[v0] admin player-detail GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// POST — set a player's balance to an exact value.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  try {
    const uid = String(body.uid || "")
    const ton = Number(body.ton)
    if (!uid) return Response.json({ error: "missing uid" }, { status: 400 })
    if (!Number.isFinite(ton) || ton < 0) return Response.json({ error: "invalid balance" }, { status: 400 })
    const newBalance = await setPlayerBalance(uid, ton)
    return Response.json({ uid, ton: newBalance })
  } catch (e) {
    console.error("[v0] admin player-detail POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// DELETE — remove a single NFT from a player's inventory.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  try {
    const uid = String(body.uid || "")
    const nftUid = String(body.nftUid || "")
    if (!uid || !nftUid) return Response.json({ error: "missing uid or nftUid" }, { status: 400 })
    const nftCount = await removePlayerNft(uid, nftUid)
    if (nftCount < 0) return Response.json({ error: "nft not found" }, { status: 404 })
    return Response.json({ uid, nftUid, nftCount })
  } catch (e) {
    console.error("[v0] admin player-detail DELETE error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
