import { pool, query } from "@/lib/db"
import { nftById } from "@/lib/casino-data"
import { getPlayerDeposits, getPlayerCaseOpens, getPlayerTotalDeposited, getPlayerUpgrades } from "@/lib/activity-store"
import { getUserWithdrawals } from "@/lib/withdrawals-store"

// ---------------------------------------------------------------------------
// Real admin data, read directly from the shared bot database.
//
// The bot stores every player as a row in `players(uid BIGINT, data JSONB)`.
// Game wagers live in `rocket_bet`, NFT payouts in `withdrawals`. There is NO
// separate deposits table — the bot keeps those logs in memory only — so the
// "money" view is derived from real on-chain-able activity (bets + withdrawals).
// Nothing here is mocked.
// ---------------------------------------------------------------------------

export interface AdminPlayer {
  id: string
  username: string // @nick, falls back to display name
  name: string
  ton: number
  nftCount: number
  refBy: string | null
  banned: boolean
  lastIp: string | null
}

export interface PlayerStats {
  total: number
  banned: number
  totalTon: number
}

export interface BetRow {
  id: string
  roundId: string
  userId: string
  username: string
  amount: number
  cashedAt: number | null
  won: number
  createdAt: number
}

export interface ReferrerRow {
  id: string
  username: string
  invited: number
  earned: number
}

export interface RefStats {
  totalInvited: number
  activeReferrers: number
  paidOut: number
}

function displayName(data: any): string {
  const nick = (data?.nick || "").trim()
  if (nick) return nick
  return (data?.name || "Player").trim() || "Player"
}

// ---- Players -------------------------------------------------------------

export async function getPlayers(opts: { search?: string; limit?: number } = {}): Promise<AdminPlayer[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000)
  const search = (opts.search || "").trim().toLowerCase()

  const params: any[] = []
  let where = ""
  if (search) {
    params.push(`%${search}%`)
    // Match on telegram id, nick, or display name.
    where = `WHERE uid::text LIKE $1
       OR lower(data->>'nick') LIKE $1
       OR lower(data->>'name') LIKE $1`
  }

  const rows = await query<{ uid: string; data: any }>(
    `SELECT uid, data FROM players
     ${where}
     ORDER BY COALESCE((data->>'balance')::float, 0) DESC
     LIMIT ${limit}`,
    params,
  )

  return rows.map((r) => ({
    id: String(r.uid),
    username: displayName(r.data),
    name: (r.data?.name || "").trim(),
    ton: Number(r.data?.balance) || 0,
    nftCount: Array.isArray(r.data?.nfts) ? r.data.nfts.length : 0,
    refBy: r.data?.ref_by != null ? String(r.data.ref_by) : null,
    banned: !!r.data?.banned,
    lastIp: r.data?.last_ip || null,
  }))
}

export async function getPlayerStats(): Promise<PlayerStats> {
  const rows = await query<{ total: number; banned: number; total_ton: number }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE (data->>'banned')::boolean = true)::int AS banned,
       COALESCE(sum((data->>'balance')::float), 0) AS total_ton
     FROM players`,
  )
  const r = rows[0]
  return {
    total: Number(r?.total) || 0,
    banned: Number(r?.banned) || 0,
    totalTon: Number(r?.total_ton) || 0,
  }
}

// Toggle a player's ban flag directly in the shared JSONB document. We merge
// rather than overwrite so no other bot-owned fields are lost.
export async function setPlayerBanned(uid: string, banned: boolean): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query(
      `UPDATE players
       SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{banned}', $2::jsonb, true)
       WHERE uid = $1`,
      [uid, JSON.stringify(!!banned)],
    )
    return !!banned
  } finally {
    client.release()
  }
}

export async function unbanAllPlayers(): Promise<number> {
  const client = await pool.connect()
  try {
    const res = await client.query(
      `UPDATE players
       SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{banned}', 'false'::jsonb, true)
       WHERE COALESCE((data->>'banned')::boolean, false) = true`,
    )
    return res.rowCount || 0
  } finally {
    client.release()
  }
}

// Set a player's balance to an exact value, merging into the shared JSONB doc
// so all other bot-owned fields are preserved. Returns the new balance.
export async function setPlayerBalance(uid: string, ton: number): Promise<number> {
  const safe = Math.max(0, Math.round(Number(ton) * 1000) / 1000)
  const client = await pool.connect()
  try {
    await client.query(
      `UPDATE players SET data = data
        || jsonb_build_object('balance', $2::numeric)
       WHERE uid = $1`,
      [uid, safe],
    )
    return safe
  } finally {
    client.release()
  }
}

// Remove a single NFT from a player's inventory in the shared JSONB document.
// We reconstruct the same synthetic uid used by getPlayerDetail so the admin UI
// can target a specific item. Returns the new NFT count, or -1 if not found.
export async function removePlayerNft(uid: string, nftUid: string): Promise<number> {
  const client = await pool.connect()
  try {
    const res = await client.query<{ data: any }>(`SELECT data FROM players WHERE uid = $1 FOR UPDATE`, [uid])
    if (!res.rows.length) return -1
    const data = res.rows[0].data || {}
    const nftsRaw: any[] = Array.isArray(data.nfts) ? data.nfts : []

    let removed = false
    const next = nftsRaw.filter((n, i) => {
      const synthetic = n.uid || `${n.id}_${n.ts ?? i}`
      if (!removed && synthetic === nftUid) {
        removed = true
        return false
      }
      return true
    })
    if (!removed) return -1

    await client.query(
      `UPDATE players
       SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{nfts}', $2::jsonb, true)
       WHERE uid = $1`,
      [uid, JSON.stringify(next)],
    )
    return next.length
  } finally {
    client.release()
  }
}

// ---- Player detail (full profile for the admin drill-down) ---------------

export interface PlayerDetail {
  player: {
    id: string
    username: string
    name: string
    ton: number
    nftCount: number
    nfts: Array<{ uid: string; id: string; name: string; price: number; rarity: string; img: string }>
    refBy: string | null
    refEarned: number
    banned: boolean
    photoUrl: string | null
  }
  totals: { deposited: number; withdrawn: number; wagered: number; won: number }
  deposits: Array<{ id: string; amount: number; method: string; createdAt: number }>
  caseOpens: Awaited<ReturnType<typeof getPlayerCaseOpens>>
  upgrades: Awaited<ReturnType<typeof getPlayerUpgrades>>
  bets: Array<{ id: string; roundId: string; amount: number; cashedAt: number | null; won: number; createdAt: number }>
  withdrawals: Array<{
    id: string
    nftName: string
    nftImg: string
    floorPrice: number
    status: "pending" | "sent"
    createdAt: number
  }>
}

export async function getPlayerDetail(uid: string): Promise<PlayerDetail | null> {
  const rows = await query<{ uid: string; data: any }>(`SELECT uid, data FROM players WHERE uid = $1`, [uid])
  if (!rows.length) return null
  const data = rows[0].data || {}

  const nftsRaw: any[] = Array.isArray(data.nfts) ? data.nfts : []
  const nfts = nftsRaw.map((n, i) => {
    const cat = nftById(n.id)
    return {
      uid: n.uid || `${n.id}_${n.ts ?? i}`,
      id: n.id,
      name: n.name || cat?.name || n.id,
      price: typeof n.price === "number" ? n.price : (n.floor ?? cat?.price ?? 0),
      rarity: n.rarity || cat?.rarity || "Common",
      img: cat?.img || "/placeholder.svg",
    }
  })

  // ref_earned_for is a map of invitee -> TON earned for that player.
  let refEarned = 0
  const rm = data.ref_earned_for
  if (rm && typeof rm === "object") {
    for (const v of Object.values(rm)) refEarned += Number(v) || 0
  }

  const [deposits, caseOpens, upgrades, withdrawals, depositedTotal, betRows] = await Promise.all([
    getPlayerDeposits(uid, 200),
    getPlayerCaseOpens(uid, 200),
    getPlayerUpgrades(uid, 200),
    getUserWithdrawals(uid),
    getPlayerTotalDeposited(uid),
    query<any>(
      `SELECT id, round_id, amount, cashed_at, won, created_at
       FROM rocket_bet WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [uid],
    ),
  ])

  const bets = betRows.map((r) => ({
    id: String(r.id),
    roundId: String(r.round_id),
    amount: Number(r.amount) || 0,
    cashedAt: r.cashed_at == null ? null : Number(r.cashed_at),
    won: Number(r.won) || 0,
    createdAt: Number(r.created_at) || 0,
  }))

  const wagered = bets.reduce((s, b) => s + b.amount, 0)
  const won = bets.reduce((s, b) => s + b.won, 0)
  // "Withdrawn" = floor value of NFTs the admin has actually sent out.
  const withdrawn = withdrawals.filter((w) => w.status === "sent").reduce((s, w) => s + w.floorPrice, 0)

  return {
    player: {
      id: String(rows[0].uid),
      username: displayName(data),
      name: (data.name || "").trim(),
      ton: Number(data.balance) || 0,
      nftCount: nfts.length,
      nfts,
      refBy: data.ref_by != null ? String(data.ref_by) : null,
      refEarned: Math.round(refEarned * 1000) / 1000,
      banned: !!data.banned,
      photoUrl: data.photo || null,
    },
    totals: {
      deposited: Math.round(depositedTotal * 1000) / 1000,
      withdrawn: Math.round(withdrawn * 1000) / 1000,
      wagered: Math.round(wagered * 1000) / 1000,
      won: Math.round(won * 1000) / 1000,
    },
    deposits,
    caseOpens,
    upgrades,
    bets,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      nftName: w.nftName,
      nftImg: w.nftImg,
      floorPrice: w.floorPrice,
      status: w.status,
      createdAt: w.createdAt,
    })),
  }
}

// ---- Bets (game money flow) ---------------------------------------------

export async function getBets(limit = 200): Promise<BetRow[]> {
  const lim = Math.min(Math.max(limit, 1), 1000)
  const rows = await query<{
    id: string
    round_id: string
    user_id: string
    username: string
    amount: string
    cashed_at: string | null
    won: string | null
    created_at: string
  }>(`SELECT id, round_id, user_id, username, amount, cashed_at, won, created_at
      FROM rocket_bet ORDER BY created_at DESC LIMIT ${lim}`)

  return rows.map((r) => ({
    id: String(r.id),
    roundId: String(r.round_id),
    userId: r.user_id,
    username: r.username || "Player",
    amount: Number(r.amount) || 0,
    cashedAt: r.cashed_at == null ? null : Number(r.cashed_at),
    won: Number(r.won) || 0,
    createdAt: Number(r.created_at) || 0,
  }))
}

export interface MoneyStats {
  totalWagered: number
  totalWon: number
  houseProfit: number
}

export async function getMoneyStats(): Promise<MoneyStats> {
  const rows = await query<{ wagered: number; won: number }>(
    `SELECT COALESCE(sum(amount),0) AS wagered, COALESCE(sum(won),0) AS won FROM rocket_bet`,
  )
  const wagered = Number(rows[0]?.wagered) || 0
  const won = Number(rows[0]?.won) || 0
  return { totalWagered: wagered, totalWon: won, houseProfit: wagered - won }
}

// ---- Referrals -----------------------------------------------------------

export async function getReferrers(limit = 100): Promise<ReferrerRow[]> {
  const lim = Math.min(Math.max(limit, 1), 500)
  // invited = players whose ref_by points at this uid.
  // earned  = sum of this player's own ref_earned_for map (invitee -> TON).
  const rows = await query<{ uid: string; nick: string | null; name: string | null; invited: number; earned: number }>(
    `WITH invites AS (
       SELECT data->>'ref_by' AS ref_by, count(*)::int AS invited
       FROM players
       WHERE NULLIF(data->>'ref_by', '') IS NOT NULL
       GROUP BY data->>'ref_by'
     ),
     earnings AS (
       SELECT uid::text AS uid,
              COALESCE((SELECT sum(value::numeric) FROM jsonb_each_text(data->'ref_earned_for')), 0) AS earned
       FROM players
       WHERE data ? 'ref_earned_for'
     )
     SELECT p.uid::text AS uid,
            p.data->>'nick' AS nick,
            p.data->>'name' AS name,
            COALESCE(i.invited, 0) AS invited,
            COALESCE(e.earned, 0) AS earned
     FROM players p
     LEFT JOIN invites i ON i.ref_by = p.uid::text
     LEFT JOIN earnings e ON e.uid = p.uid::text
     WHERE i.invited IS NOT NULL OR e.earned IS NOT NULL
     ORDER BY invited DESC, earned DESC
     LIMIT ${lim}`,
  )

  return rows.map((r) => ({
    id: String(r.uid),
    username: (r.nick || "").trim() || (r.name || "").trim() || `id${r.uid}`,
    invited: Number(r.invited) || 0,
    earned: Number(r.earned) || 0,
  }))
}

export async function getRefStats(): Promise<RefStats> {
  const rows = await query<{ total_invited: number; active_referrers: number; paid_out: number }>(
    `SELECT
       (SELECT count(*) FROM players WHERE NULLIF(data->>'ref_by', '') IS NOT NULL)::int AS total_invited,
       (SELECT count(DISTINCT data->>'ref_by') FROM players WHERE NULLIF(data->>'ref_by', '') IS NOT NULL)::int AS active_referrers,
       COALESCE((
         SELECT sum(value::numeric)
         FROM players, jsonb_each_text(data->'ref_earned_for')
         WHERE data ? 'ref_earned_for'
       ), 0) AS paid_out`,
  )
  const r = rows[0]
  return {
    totalInvited: Number(r?.total_invited) || 0,
    activeReferrers: Number(r?.active_referrers) || 0,
    paidOut: Number(r?.paid_out) || 0,
  }
}

export interface ReferrerDetail {
  referrer: { id: string; username: string; earned: number }
  invited: Array<{ id: string; username: string; joinedAt: number | null; deposited: number }>
}

export async function getReferrerDetail(uid: string): Promise<ReferrerDetail> {
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
  const rows = await query<any>(
    `SELECT p.uid::text AS uid,
            p.data,
            COALESCE(SUM(d.amount), 0) AS deposited
     FROM players p
     LEFT JOIN deposit_log d ON d.user_id = p.uid::text
     WHERE p.data->>'ref_by' = $1
     GROUP BY p.uid, p.data
     ORDER BY deposited DESC, p.uid DESC`,
    [String(uid)],
  )

  const refRows = await query<any>(`SELECT uid::text AS uid, data FROM players WHERE uid::text = $1 LIMIT 1`, [String(uid)])
  const refData = refRows[0]?.data || {}
  const earnedMap = refData.ref_earned_for
  const earned =
    earnedMap && typeof earnedMap === "object"
      ? Object.values(earnedMap).reduce((sum, value) => sum + (Number(value) || 0), 0)
      : 0

  return {
    referrer: {
      id: String(uid),
      username: displayName(refData),
      earned: Math.round(earned * 1000) / 1000,
    },
    invited: rows.map((r) => {
      const data = r.data || {}
      const joinedRaw = data.joined_at ?? data.created_at ?? data.registered_at ?? data.reg_at ?? data.ts ?? null
      const joinedNum = joinedRaw == null ? null : Number(joinedRaw)
      const joinedAt = joinedNum == null || !Number.isFinite(joinedNum) ? null : joinedNum < 1e12 ? Math.round(joinedNum * 1000) : joinedNum
      return {
        id: String(r.uid),
        username: displayName(data),
        joinedAt,
        deposited: Math.round((Number(r.deposited) || 0) * 1000) / 1000,
      }
    }),
  }
}
