import { NextRequest } from "next/server"
import { getPlayers, getPlayerStats, setPlayerBanned, unbanAllPlayers } from "@/lib/admin-stats-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// GET — real player list + aggregate stats for the Players tab.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const search = req.nextUrl.searchParams.get("search") || ""
    const [players, stats] = await Promise.all([getPlayers({ search }), getPlayerStats()])
    return Response.json({ players, stats })
  } catch (e) {
    console.error("[v0] admin players GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// POST — toggle a player's ban flag in the shared players table.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  try {
    if (body.action === "unbanAll") {
      const count = await unbanAllPlayers()
      return Response.json({ ok: true, count })
    }

    const uid = String(body.uid || "")
    if (!uid) return Response.json({ error: "missing uid" }, { status: 400 })
    const banned = await setPlayerBanned(uid, !!body.banned)
    return Response.json({ uid, banned })
  } catch (e) {
    console.error("[v0] admin players POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
