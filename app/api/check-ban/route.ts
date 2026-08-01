import { NextRequest } from "next/server"
import { authPlayer } from "@/lib/api-helpers"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Ban check — fail closed for authenticated users when DB errors.
 * Unauthenticated → treated as not banned (gate still requires other auth).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = await authPlayer(req, body.initData)
    if (!user) return Response.json({ banned: true, error: "unauthorized" }, { status: 401 })

    const rows = await query<{ data: any }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [user.id])
    const banned = !!(rows[0]?.data && rows[0].data.banned)
    return Response.json({ banned })
  } catch (e) {
    console.error("[v0] check-ban error:", e)
    // Fail closed: block play if we cannot verify ban status.
    return Response.json({ banned: true, error: "check_failed" }, { status: 503 })
  }
}
