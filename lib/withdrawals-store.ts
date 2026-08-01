import { query } from "@/lib/db"

// NFT withdrawal requests live in their own table so they never interfere with
// the bot's players table. Each row is a single pending/sent gift transfer.
export interface WithdrawalRecord {
  id: string
  userId: string
  username: string
  nftUid: string
  nftId: string
  nftName: string
  nftImg: string
  floorPrice: number
  status: "pending" | "sent"
  createdAt: number
  sentAt: number | null
}

let ensured = false
async function ensureTable() {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS withdrawals (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL,
       nft_uid TEXT NOT NULL,
       nft_id TEXT NOT NULL,
       nft_name TEXT NOT NULL,
       nft_img TEXT NOT NULL DEFAULT '',
       floor_price NUMERIC NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at BIGINT NOT NULL,
       sent_at BIGINT
     )`,
  )
  ensured = true
}

interface Row {
  id: string
  user_id: string
  username: string
  nft_uid: string
  nft_id: string
  nft_name: string
  nft_img: string
  floor_price: string | number
  status: string
  created_at: string | number
  sent_at: string | number | null
}

function toRecord(r: Row): WithdrawalRecord {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    nftUid: r.nft_uid,
    nftId: r.nft_id,
    nftName: r.nft_name,
    nftImg: r.nft_img,
    floorPrice: Number(r.floor_price),
    status: r.status === "sent" ? "sent" : "pending",
    createdAt: Number(r.created_at),
    sentAt: r.sent_at == null ? null : Number(r.sent_at),
  }
}

// Admin: every withdrawal, newest first.
export async function getAllWithdrawals(): Promise<WithdrawalRecord[]> {
  try {
    await ensureTable()
    const rows = await query<Row>(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 500`)
    return rows.map(toRecord)
  } catch (e) {
    console.error("[v0] getAllWithdrawals error:", e)
    return []
  }
}

// Player: only this user's withdrawals (used to reconcile inventory on load).
export async function getUserWithdrawals(userId: string): Promise<WithdrawalRecord[]> {
  try {
    await ensureTable()
    const rows = await query<Row>(`SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
    return rows.map(toRecord)
  } catch (e) {
    console.error("[v0] getUserWithdrawals error:", e)
    return []
  }
}

export async function createWithdrawal(input: {
  userId: string
  username: string
  nftUid: string
  nftId: string
  nftName: string
  nftImg: string
  floorPrice: number
}): Promise<WithdrawalRecord> {
  await ensureTable()
  const id = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = Date.now()
  await query(
    `INSERT INTO withdrawals (id, user_id, username, nft_uid, nft_id, nft_name, nft_img, floor_price, status, created_at, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NULL)`,
    [id, input.userId, input.username, input.nftUid, input.nftId, input.nftName, input.nftImg, input.floorPrice, createdAt],
  )
  return {
    id,
    status: "pending",
    createdAt,
    sentAt: null,
    ...input,
  }
}

// Admin: mark a request as sent (gift delivered). The client removes the NFT
// from inventory once it sees the matching "sent" record.
export async function markWithdrawalSent(id: string): Promise<WithdrawalRecord | null> {
  await ensureTable()
  const sentAt = Date.now()
  const rows = await query<Row>(
    `UPDATE withdrawals SET status = 'sent', sent_at = $2 WHERE id = $1 RETURNING *`,
    [id, sentAt],
  )
  return rows.length ? toRecord(rows[0]) : null
}
