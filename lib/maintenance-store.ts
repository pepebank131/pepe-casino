import { pool, query } from "@/lib/db"

// The maintenance flag lives in the app-owned `app_config` key/value table
// (the same isolated table used for cases/promos). It NEVER touches the bot's
// per-player data, so the bot and Mini App stay in sync.
const CONFIG_KEY = "maintenance"

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

// Returns true when maintenance mode is ON (only admins may use the app).
export async function getMaintenance(): Promise<boolean> {
  try {
    await ensureTable()
    const rows = await query<{ value: { on?: boolean } }>(`SELECT value FROM app_config WHERE key = $1`, [CONFIG_KEY])
    if (rows.length > 0) return !!rows[0].value?.on
  } catch (e) {
    console.error("[v0] getMaintenance error:", e)
  }
  return false
}

// Persists the maintenance flag.
export async function setMaintenance(on: boolean): Promise<boolean> {
  await ensureTable()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, { on: !!on }],
    )
  } finally {
    client.release()
  }
  return !!on
}
