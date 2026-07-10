import { type NextRequest, NextResponse } from "next/server"
import { getRocketState } from "@/lib/rocket-store"

export const dynamic = "force-dynamic"
// Allow this keep-alive to run long enough to drive several round transitions.
export const maxDuration = 60

// GET /api/rocket/tick — keep-alive driver so the round loop runs 24/7 even
// when no client is actively polling /api/rocket/state.
//
// Vercel Cron's finest granularity is 1 minute, but a full round is only
// ~13-20s, so a single cron invocation would otherwise leave the game frozen
// between ticks. Instead, each invocation advances the deterministic state
// machine repeatedly for ~55s (calling getRocketState, which runs advanceGame
// as a side effect), so rounds keep cycling continuously between cron runs.
export async function GET(_req: NextRequest) {
  const deadline = Date.now() + 55_000
  let ticks = 0
  let lastRound = ""
  let rounds = 0
  try {
    while (Date.now() < deadline) {
      const s = await getRocketState()
      ticks++
      if (s.roundId !== lastRound) {
        lastRound = s.roundId
        rounds++
      }
      // Poll about once per second; matches the client cadence.
      await new Promise((r) => setTimeout(r, 1000))
    }
    return NextResponse.json(
      { ok: true, ticks, rounds },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (e) {
    console.error("[v0] /api/rocket/tick error:", e)
    return NextResponse.json({ ok: false, ticks, rounds }, { status: 500 })
  }
}
