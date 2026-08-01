import { NextRequest } from "next/server"
import { requireAdmin, forbidden } from "@/lib/admin-auth"
import { query } from "@/lib/db"
import { getCurrentSeason } from "@/lib/season-store"

export const dynamic = "force-dynamic"

const CONFIG_KEY = "leaderboard_season"

// GET — return current season info (public)
export async function GET() {
  try {
    const season = await getCurrentSeason()
    return Response.json({ season })
  } catch (e) {
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// POST — reset season anchor to now (starts new season immediately)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()

  const now = Date.now()
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [CONFIG_KEY, { anchor: now }],
  )

  const season = await getCurrentSeason()
  return Response.json({ ok: true, season })
}
