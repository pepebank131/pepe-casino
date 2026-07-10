import { type NextRequest, NextResponse } from "next/server"
import { getRocketState } from "@/lib/rocket-store"

export const dynamic = "force-dynamic"

// GET /api/rocket/state — shared, server-authoritative round state.
// Advancing the round happens lazily here, so frequent polling keeps the
// game loop ticking without a persistent server process.
export async function GET(_req: NextRequest) {
  try {
    const state = await getRocketState()
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (e) {
    console.error("[v0] /api/rocket/state error:", e)
    return NextResponse.json({ error: "state_failed" }, { status: 500 })
  }
}
