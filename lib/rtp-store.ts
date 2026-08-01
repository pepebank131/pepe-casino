import { pool, query } from "@/lib/db"

const CONFIG_KEY = "global_rtp"
const DEFAULT_RTP = 97

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

export function normalizeRtp(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_RTP
  return Math.max(1, Math.min(99, n))
}

export async function getGlobalRtp(): Promise<number> {
  try {
    await ensureTable()
    const rows = await query<{ value: { rtp?: number } | number }>(`SELECT value FROM app_config WHERE key = $1`, [
      CONFIG_KEY,
    ])
    const value = rows[0]?.value
    return normalizeRtp(typeof value === "number" ? value : value?.rtp)
  } catch (e) {
    console.error("[v0] getGlobalRtp error:", e)
    return DEFAULT_RTP
  }
}

export async function saveGlobalRtp(value: unknown): Promise<number> {
  const rtp = normalizeRtp(value)
  await ensureTable()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, { rtp }],
    )
  } finally {
    client.release()
  }
  return rtp
}
