import { NextRequest } from "next/server"
import { authPlayer, saveSnapshot, serializePlayer, unauthorized, type SyncInventoryItem } from "@/lib/api-helpers"
import { ensureActivityTables, logDeposit } from "@/lib/activity-store"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

// Persists the authoritative client snapshot into the shared bot JSONB document.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  const ton = Number(body.ton)
  const freeCaseAt = body.freeCaseAt == null ? null : Number(body.freeCaseAt)
  const depositCaseAt = body.depositCaseAt == null ? null : Number(body.depositCaseAt)
  const depositedSinceOpen = Number.isFinite(Number(body.depositedSinceOpen)) ? Number(body.depositedSinceOpen) : 0
  const referralCaseAt = body.referralCaseAt == null ? null : Number(body.referralCaseAt)
  const inventory: SyncInventoryItem[] = Array.isArray(body.inventory) ? body.inventory : []

  if (!Number.isFinite(ton) || ton < 0) {
    return Response.json({ error: "invalid balance" }, { status: 400 })
  }

  try {
    const prevRows = await query<{ deposited_since_open: string | null }>(
      `SELECT data->>'deposited_since_open' AS deposited_since_open FROM players WHERE uid = $1 LIMIT 1`,
      [user.id],
    )
    const prevDeposited = Number(prevRows[0]?.deposited_since_open ?? 0) || 0
    const depositDelta = Math.round((depositedSinceOpen - prevDeposited) * 1000) / 1000
    if (depositDelta > 0) {
      await ensureActivityTables()
      const since = Date.now() - 2 * 60 * 1000
      const dupes = await query<{ id: string }>(
        `SELECT id FROM deposit_log
         WHERE user_id = $1 AND amount = $2 AND created_at >= $3
         LIMIT 1`,
        [user.id, depositDelta, since],
      ).catch(() => [])
      if (dupes.length === 0) {
        await logDeposit({
          userId: user.id,
          username: user.username,
          photo: user.photoUrl || "",
          amount: depositDelta,
          method: "sync",
        })
      }
    }
    const player = await saveSnapshot(user, ton, freeCaseAt, inventory, depositCaseAt, depositedSinceOpen, referralCaseAt)
    return Response.json(serializePlayer(player))
  } catch (e) {
    console.error("[v0] sync error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
