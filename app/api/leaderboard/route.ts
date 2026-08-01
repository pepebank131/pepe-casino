import { getCurrentSeason, SEASON_PRIZES } from "@/lib/season-store"
import { getTopDepositors } from "@/lib/activity-store"
import { applyLeaderboardOverrides, getLeaderboardOverrides } from "@/lib/leaderboard-overrides"

export const dynamic = "force-dynamic"

// Public: current season window + leaderboard ranked by deposited TON.
export async function GET() {
  try {
    const season = await getCurrentSeason()
    const [autoEntries, overrides] = await Promise.all([
      getTopDepositors(season.startMs, season.endMs, 0),
      getLeaderboardOverrides(),
    ])
    const entries = applyLeaderboardOverrides(autoEntries, overrides)
    return Response.json({
      season: {
        index: season.index,
        startMs: season.startMs,
        endMs: season.endMs,
        endsInMs: season.endsInMs,
      },
      prizes: SEASON_PRIZES,
      entries,
    })
  } catch (e) {
    console.error("[v0] leaderboard GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
