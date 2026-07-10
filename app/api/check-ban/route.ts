import { NextRequest } from "next/server"
import { authPlayer } from "@/lib/api-helpers"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = await authPlayer(req, body.initData)
    if (!user) return Response.json({ banned: false })
    const rows = await query<{ data: any }>(`SELECT data FROM players WHERE uid = $1`, [String(user.id)])
    const banned = !!rows[0]?.data?.banned
    return Response.json({ banned })
  } catch {
    return Response.json({ banned: false })
  }
}
