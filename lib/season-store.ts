import { pool, query } from "@/lib/db"

// ---------------------------------------------------------------------------
// Leaderboard season management.
//
// Seasons are 26 days long. Players are ranked by total TON deposited during
// the current season (see activity-store.getTopDepositors). The season anchor
// is stored once in app_config; the current window is derived from it so the
// season automatically rolls over every 26 days with no cron required.
// ---------------------------------------------------------------------------

export const SEASON_LENGTH_MS = 26 * 24 * 60 * 60 * 1000
const CONFIG_KEY = "leaderboard_season"

// Prize NFTs by rank (ids match lib/casino-data catalog).
export const SEASON_PRIZES = [
  { rank: 1, nftId: "ufcstrike", name: "UFC Strike" },
  { rank: 2, nftId: "jinglebells", name: "Jingle Bells" },
  { rank: 3, nftId: "vicecream", name: "Vice Cream" },
]

let ensured = false
async function ensureTable() {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS app_config (
       key TEXT PRIMARY KEY,
       value JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )
  ensured = true
}

// Returns the anchor (season 1 start) in ms, creating it (= now) on first read.
async function getAnchor(): Promise<number> {
  await ensureTable()
  const rows = await query<{ value: { anchor?: number } }>(`SELECT value FROM app_config WHERE key = $1`, [CONFIG_KEY])
  const existing = rows[0]?.value?.anchor
  if (typeof existing === "number" && Number.isFinite(existing)) return existing

  const now = Date.now()
  const client = await pool.connect()
  try {
    // Insert only if absent so concurrent callers don't reset the anchor.
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO NOTHING`,
      [CONFIG_KEY, { anchor: now }],
    )
    const check = await client.query<{ value: { anchor?: number } }>(
      `SELECT value FROM app_config WHERE key = $1`,
      [CONFIG_KEY],
    )
    return check.rows[0]?.value?.anchor ?? now
  } finally {
    client.release()
  }
}

export interface SeasonWindow {
  index: number // 1-based season number
  startMs: number
  endMs: number
  endsInMs: number
}

export async function getCurrentSeason(): Promise<SeasonWindow> {
  const anchor = await getAnchor()
  const now = Date.now()
  const elapsed = Math.max(0, now - anchor)
  const index = Math.floor(elapsed / SEASON_LENGTH_MS)
  const startMs = anchor + index * SEASON_LENGTH_MS
  const endMs = startMs + SEASON_LENGTH_MS
  return {
    index: index + 1,
    startMs,
    endMs,
    endsInMs: Math.max(0, endMs - now),
  }
}
