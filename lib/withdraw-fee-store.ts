import { pool, query } from "@/lib/db"

const CONFIG_KEY = "withdraw_fee"
export const DEFAULT_WITHDRAW_FEE = 25 // Telegram Stars

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

export function normalizeWithdrawFee(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_WITHDRAW_FEE
  return Math.max(0, Math.min(10000, n))
}

export async function getWithdrawFee(): Promise<number> {
  try {
    await ensureTable()
    const rows = await query<{ value: { fee?: number } | number }>(`SELECT value FROM app_config WHERE key = $1`, [
      CONFIG_KEY,
    ])
    const value = rows[0]?.value
    return normalizeWithdrawFee(typeof value === "number" ? value : value?.fee)
  } catch (e) {
    console.error("[v0] getWithdrawFee error:", e)
    return DEFAULT_WITHDRAW_FEE
  }
}

export async function saveWithdrawFee(value: unknown): Promise<number> {
  const fee = normalizeWithdrawFee(value)
  await ensureTable()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, { fee }],
    )
  } finally {
    client.release()
  }
  return fee
}
