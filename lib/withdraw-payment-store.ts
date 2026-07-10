import { query } from "@/lib/db"

let ensured = false

async function ensureTable() {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS withdraw_payment_receipts (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       nft_id TEXT NOT NULL,
       stars INTEGER NOT NULL,
       created_at BIGINT NOT NULL,
       consumed_at BIGINT
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS withdraw_payment_receipts_user_idx ON withdraw_payment_receipts (user_id, nft_id, consumed_at)`)
  ensured = true
}

export async function recordWithdrawPayment(input: { userId: string; nftId: string; stars: number }) {
  await ensureTable()
  const id = `wpr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  await query(
    `INSERT INTO withdraw_payment_receipts (id, user_id, nft_id, stars, created_at, consumed_at)
     VALUES ($1, $2, $3, $4, $5, NULL)`,
    [id, input.userId, input.nftId, Math.max(1, Math.floor(input.stars)), Date.now()],
  )
}

export async function consumeWithdrawPayment(userId: string, nftId: string): Promise<boolean> {
  await ensureTable()
  const rows = await query<{ id: string }>(
    `UPDATE withdraw_payment_receipts
     SET consumed_at = $3
     WHERE id = (
       SELECT id FROM withdraw_payment_receipts
       WHERE user_id = $1 AND nft_id = $2 AND consumed_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1
     )
     RETURNING id`,
    [userId, nftId, Date.now()],
  )
  return rows.length > 0
}
