import { NextRequest } from "next/server"
import { pool, query, type PlayerData, type BotNft } from "@/lib/db"
import { resolveUser, type TgUser } from "@/lib/telegram-auth"
import { nftById } from "@/lib/casino-data"

// Reads/writes the shared bot database. Player state lives in players.data (JSONB).

export interface PlayerRow {
  uid: string
  data: PlayerData
}

// Pulls initData from header (preferred) or body, verifies, returns the user.
export async function authPlayer(req: NextRequest, bodyInitData?: string): Promise<TgUser | null> {
  const initData = req.headers.get("x-telegram-init-data") || bodyInitData || null
  return resolveUser(initData)
}

// Extracts the real client IP from common proxy headers (Railway/Vercel/etc
// sit behind a proxy so req.ip is never populated directly).
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  const real = req.headers.get("x-real-ip")
  if (real) return real.trim()
  return "unknown"
}

// Loads the player's JSONB doc, creating a zero-balance doc if they're new.
// `ip`, when provided, is recorded for admin abuse investigation (duplicate
// account / multi-account detection) without ever touching balance/nfts.
export async function getOrCreatePlayer(user: TgUser, referredBy?: string, ip?: string): Promise<PlayerRow> {
  const cleanRef = referredBy && String(referredBy) !== String(user.id) ? String(referredBy) : null
  const existing = await query<PlayerRow>(`SELECT uid, data FROM players WHERE uid = $1`, [user.id])
  if (existing.length > 0) {
    // Keep display fields fresh from Telegram, but never touch balance/nfts here.
    const data = existing[0].data || {}
    const ipHistory: string[] = Array.isArray((data as any).ip_history) ? (data as any).ip_history : []
    const nextIpHistory = ip && ip !== "unknown" && !ipHistory.includes(ip)
      ? [...ipHistory, ip].slice(-10) // keep last 10 distinct IPs
      : ipHistory
    const patched: PlayerData = {
      ...data,
      name: user.username || data.name,
      nick: user.username || data.nick,
      photo: user.photoUrl || data.photo,
      ref_by: data.ref_by ?? cleanRef,
      ...(ip && ip !== "unknown" ? { last_ip: ip, ip_history: nextIpHistory } as any : {}),
    }
    await query(`UPDATE players SET data = $2 WHERE uid = $1`, [user.id, patched])
    return { uid: user.id, data: patched }
  }

  const fresh: PlayerData = {
    name: user.username || "Player",
    nick: user.username || "Player",
    photo: user.photoUrl || "",
    balance: 0,
    nfts: [],
    free_daily_last_open: null,
    ref_by: cleanRef,
    ...(ip && ip !== "unknown" ? { last_ip: ip, ip_history: [ip] } as any : {}),
  }
  await query(
    `INSERT INTO players (uid, data) VALUES ($1, $2) ON CONFLICT (uid) DO NOTHING`,
    [user.id, fresh],
  )
  const row = await query<PlayerRow>(`SELECT uid, data FROM players WHERE uid = $1`, [user.id])
  return row[0] ?? { uid: user.id, data: fresh }
}

// Maps a bot NFT to the app's inventory item, filling in the image from our catalog.
function toInventoryItem(n: BotNft, idx: number) {
  const cat = nftById(n.id)
  return {
    uid: n.uid || `${n.id}_${n.ts ?? idx}`,
    id: n.id,
    name: n.name || cat?.name || n.id,
    rarity: n.rarity || cat?.rarity || "Common",
    price: typeof n.price === "number" ? n.price : (n.floor ?? cat?.price ?? 0),
    img: cat?.img || "/placeholder.svg",
  }
}

// free_daily_last_open is stored as a unix timestamp (seconds) by the bot.
// The app's freeCaseAt is milliseconds. Convert between the two.
function freeCaseAtMs(data: PlayerData): number | null {
  const v = data.free_daily_last_open
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? Math.round(n * 1000) : n // seconds -> ms
}

export async function getPlayerReferrals(uid: string) {
  await query(
    `CREATE TABLE IF NOT EXISTS deposit_log (
       id BIGSERIAL PRIMARY KEY,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL DEFAULT '',
       photo TEXT NOT NULL DEFAULT '',
       amount NUMERIC NOT NULL,
       method TEXT NOT NULL DEFAULT '',
       created_at BIGINT NOT NULL
     )`,
  )
  const rows = await query<{ uid: string; data: PlayerData }>(
    `SELECT p.uid,
            p.data,
            COALESCE(SUM(d.amount), 0) AS deposited
     FROM players p
     LEFT JOIN deposit_log d ON d.user_id = p.uid::text
     WHERE p.data->>'ref_by' = $1
     GROUP BY p.uid, p.data
     ORDER BY deposited DESC, p.uid DESC
     LIMIT 200`,
    [String(uid)],
  )
  return rows.map((r) => {
    const data = r.data || {}
    const deposited = Number((r as any).deposited ?? 0)
    return {
      id: String(r.uid),
      name: String(data.nick || data.name || r.uid),
      avatarHue: Array.from(String(r.uid)).reduce((s, ch) => s + ch.charCodeAt(0), 0) % 360,
      wagered: Math.round(deposited * 1000) / 1000,
      photoUrl: (data as any).photo || null,
    }
  })
}

export function getRefEarned(data: PlayerData): number {
  const rm = (data as any).ref_earned_for
  if (!rm || typeof rm !== "object") return 0
  return Object.values(rm).reduce((s, v) => s + (Number(v) || 0), 0)
}

export function serializePlayer(row: PlayerRow, referrals: Array<{ id: string; name: string; avatarHue: number; wagered: number; photoUrl?: string | null }> = []) {
  const data = row.data || {}
  const nfts = Array.isArray(data.nfts) ? data.nfts : []
  const depRaw = data.deposit_case_last_open
  let depositCaseAt: number | null = null
  if (depRaw != null) {
    const n = Number(depRaw)
    if (Number.isFinite(n)) depositCaseAt = n < 1e12 ? Math.round(n * 1000) : n
  }
  const refRaw = (data as any).referral_case_last_open
  let referralCaseAt: number | null = null
  if (refRaw != null) {
    const n = Number(refRaw)
    if (Number.isFinite(n)) referralCaseAt = n < 1e12 ? Math.round(n * 1000) : n
  }
  return {
    tgId: String(row.uid),
    username: data.nick || data.name || "Player",
    photoUrl: data.photo || null,
    ton: Number(data.balance ?? 0),
    freeCaseAt: freeCaseAtMs(data),
    depositCaseAt,
    depositedSinceOpen: Number(data.deposited_since_open ?? 0),
    referralCaseAt,
    inventory: nfts.map(toInventoryItem),
    referrals,
    refEarned: Math.round(getRefEarned(data) * 1000) / 1000,
  }
}

export interface SyncInventoryItem {
  uid: string
  id: string
  name: string
  rarity: string
  price: number
  img: string
}

// Writes the authoritative client snapshot back into the shared JSONB doc.
// Preserves every other field the bot owns (ref_by, custom flags, etc.).
export async function saveSnapshot(
  user: TgUser,
  ton: number,
  freeCaseAtMsValue: number | null,
  inventory: SyncInventoryItem[],
  depositCaseAtMsValue: number | null = null,
  depositedSinceOpen = 0,
  referralCaseAtMsValue: number | null = null,
): Promise<PlayerRow> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const cur = await client.query<PlayerRow>(`SELECT uid, data FROM players WHERE uid = $1 FOR UPDATE`, [user.id])
    const prev: PlayerData = cur.rows[0]?.data || {}

    // Store the bot's native NFT shape (id/uid/name/price/rarity/ts) — never the image.
    const nfts: BotNft[] = inventory.map((it) => ({
      id: it.id,
      uid: it.uid,
      name: it.name,
      price: it.price,
      floor: it.price,
      rarity: it.rarity,
      ts: Date.now() / 1000,
    }))

    const next: PlayerData = {
      ...prev,
      name: user.username || prev.name,
      nick: user.username || prev.nick,
      photo: user.photoUrl || prev.photo,
      // Preserve full precision — the bot stores fractional balances (e.g. 38997.582).
      balance: ton,
      // Convert ms back to seconds to match the bot's convention.
      free_daily_last_open: freeCaseAtMsValue == null ? null : Math.round(freeCaseAtMsValue / 1000),
      // Deposit Case bookkeeping (app-owned keys; bot ignores them).
      deposit_case_last_open: depositCaseAtMsValue == null ? null : Math.round(depositCaseAtMsValue / 1000),
      deposited_since_open: Number.isFinite(depositedSinceOpen) ? depositedSinceOpen : 0,
      referral_case_last_open: referralCaseAtMsValue == null ? null : Math.round(referralCaseAtMsValue / 1000),
      nfts,
    }

    await client.query(
      `INSERT INTO players (uid, data) VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET data = $2`,
      [user.id, next],
    )
    await client.query("COMMIT")
    return { uid: user.id, data: next }
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 })
}
