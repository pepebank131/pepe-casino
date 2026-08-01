import { NextRequest } from "next/server"
import { requireAdmin, forbidden } from "@/lib/admin-auth"
import {
  getLeaderboardOverrides,
  resetLeaderboardOverrides,
  saveLeaderboardOverrides,
} from "@/lib/leaderboard-overrides"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req)
  if (!admin) return forbidden()
  try {
    const overrides = await getLeaderboardOverrides()
    return Response.json({ overrides })
  } catch (e) {
    console.error("[v0] admin leaderboard GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()

  try {
    const overrides =
      body.action === "reset"
        ? await resetLeaderboardOverrides()
        : await saveLeaderboardOverrides(Array.isArray(body.overrides) ? body.overrides : [])
    return Response.json({ ok: true, overrides })
  } catch (e) {
    console.error("[v0] admin leaderboard POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
