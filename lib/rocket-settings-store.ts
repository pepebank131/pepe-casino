import { pool, query } from "@/lib/db"

const CONFIG_KEY = "rocket_settings"

export interface RocketSettings {
  houseEdge: number // percent, 1-50
  maxBet: number    // TON
  minBet: number    // TON
  maxMult: number   // multiplier cap
}

const DEFAULTS: RocketSettings = {
  houseEdge: 5,
  maxBet: 100,
  minBet: 0.1,
  maxMult: 100,
}

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

export async function getRocketSettings(): Promise<RocketSettings> {
  try {
    await ensureTable()
    const rows = await query<{ value: Partial<RocketSettings> }>(
      `SELECT value FROM app_config WHERE key = $1`,
      [CONFIG_KEY],
    )
    if (!rows[0]?.value) return DEFAULTS
    const v = rows[0].value
    return {
      houseEdge: Number.isFinite(Number(v.houseEdge)) ? Math.max(1, Math.min(50, Number(v.houseEdge))) : DEFAULTS.houseEdge,
      maxBet:    Number.isFinite(Number(v.maxBet))    ? Math.max(0.1, Number(v.maxBet))                 : DEFAULTS.maxBet,
      minBet:    Number.isFinite(Number(v.minBet))    ? Math.max(0.01, Number(v.minBet))                : DEFAULTS.minBet,
      maxMult:   Number.isFinite(Number(v.maxMult))   ? Math.max(1.01, Number(v.maxMult))               : DEFAULTS.maxMult,
    }
  } catch (e) {
    console.error("[v0] getRocketSettings error:", e)
    return DEFAULTS
  }
}

export async function saveRocketSettings(input: Partial<RocketSettings>): Promise<RocketSettings> {
  await ensureTable()
  const current = await getRocketSettings()
  const merged: RocketSettings = {
    houseEdge: Number.isFinite(Number(input.houseEdge)) ? Math.max(1, Math.min(50, Number(input.houseEdge))) : current.houseEdge,
    maxBet:    Number.isFinite(Number(input.maxBet))    ? Math.max(0.1, Number(input.maxBet))                 : current.maxBet,
    minBet:    Number.isFinite(Number(input.minBet))    ? Math.max(0.01, Number(input.minBet))                : current.minBet,
    maxMult:   Number.isFinite(Number(input.maxMult))   ? Math.max(1.01, Number(input.maxMult))               : current.maxMult,
  }
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, merged],
    )
  } finally {
    client.release()
  }
  return merged
}
