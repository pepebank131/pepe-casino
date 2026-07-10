import { NextRequest } from "next/server"
import { getReferrerDetail, getReferrers, getRefStats } from "@/lib/admin-stats-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// GET — real referral leaderboard + totals from the players table.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const uid = req.nextUrl.searchParams.get("uid")
    if (uid) {
      const detail = await getReferrerDetail(uid)
      return Response.json(detail)
    }
    const [referrers, stats] = await Promise.all([getReferrers(100), getRefStats()])
    return Response.json({ referrers, stats })
  } catch (e) {
    console.error("[v0] admin refs GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
