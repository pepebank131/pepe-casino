import { pool, query, type PlayerData } from "@/lib/db"

// ---------------------------------------------------------------------------
// Activity logging for deposits and case openings.
//
// The Telegram bot only keeps these events in memory, so the shared database
// has no historical record of them. These app-owned tables let the Mini App
// persist real deposit + case-open activity going forward, powering the admin
// player-detail view and the season depositor leaderboard. They never touch
// the bot's players JSONB document.
// ---------------------------------------------------------------------------

let ensured = false
export async function ensureActivityTables() {
  if (ensured) return
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
  await query(`CREATE INDEX IF NOT EXISTS deposit_log_user_idx ON deposit_log (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS deposit_log_created_idx ON deposit_log (created_at)`)
  await query(
    `CREATE TABLE IF NOT EXISTS case_open_log (
       id BIGSERIAL PRIMARY KEY,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL DEFAULT '',
       case_id TEXT NOT NULL DEFAULT '',
       case_name TEXT NOT NULL DEFAULT '',
       nft_id TEXT NOT NULL DEFAULT '',
       nft_name TEXT NOT NULL DEFAULT '',
       nft_price NUMERIC NOT NULL DEFAULT 0,
       kind TEXT NOT NULL DEFAULT 'paid',
       cost NUMERIC NOT NULL DEFAULT 0,
       created_at BIGINT NOT NULL
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS case_open_log_user_idx ON case_open_log (user_id)`)
  await query(
    `CREATE TABLE IF NOT EXISTS upgrade_log (
       id BIGSERIAL PRIMARY KEY,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL DEFAULT '',
       stake_id TEXT NOT NULL DEFAULT '',
       stake_name TEXT NOT NULL DEFAULT '',
       stake_price NUMERIC NOT NULL DEFAULT 0,
       target_id TEXT NOT NULL DEFAULT '',
       target_name TEXT NOT NULL DEFAULT '',
       target_price NUMERIC NOT NULL DEFAULT 0,
       chance INTEGER NOT NULL DEFAULT 0,
       win BOOLEAN NOT NULL DEFAULT false,
       created_at BIGINT NOT NULL
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS upgrade_log_user_idx ON upgrade_log (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS upgrade_log_created_idx ON upgrade_log (created_at)`)
  ensured = true
}

// --- Writers ---------------------------------------------------------------

export async function logDeposit(input: {
  userId: string
  username: string
  photo?: string
  amount: number
  method?: string
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return
  const bonus = Math.round(input.amount * 0.1 * 1000) / 1000
  const userId = String(input.userId)
  const amount = Math.round(input.amount * 1000) / 1000
  const method = input.method || ""
  const client = await pool.connect()
  try {
    await ensureActivityTables()
    await client.query("BEGIN")
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`deposit:${userId}:${amount}`])
    const dupe = await client.query<{ id: string }>(
      `SELECT id FROM deposit_log
       WHERE user_id = $1
         AND amount = $2
         AND created_at >= $3
         AND (method = 'sync' OR $4 = 'sync')
       LIMIT 1`,
      [userId, amount, Date.now() - 2 * 60 * 1000, method],
    )
    if (dupe.rows.length > 0) {
      await client.query("COMMIT")
      return
    }
    await client.query(
      `INSERT INTO deposit_log (user_id, username, photo, amount, method, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, input.username, input.photo || "", amount, method, Date.now()],
    )
    if (bonus > 0) {
      const depositorRows = await client.query<{ data: PlayerData }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [
        userId,
      ])
      const refByRaw = depositorRows.rows[0]?.data?.ref_by
      const refBy = refByRaw == null ? "" : String(refByRaw)
      if (refBy && refBy !== userId) {
        const refRows = await client.query<{ data: PlayerData }>(`SELECT data FROM players WHERE uid = $1 FOR UPDATE`, [refBy])
        if (refRows.rows.length) {
          const data = refRows.rows[0].data || {}
          const earnedFor = data.ref_earned_for && typeof data.ref_earned_for === "object" ? data.ref_earned_for : {}
          const next: PlayerData = {
            ...data,
            balance: Math.round(((Number(data.balance) || 0) + bonus) * 1000) / 1000,
            ref_earned_for: {
              ...earnedFor,
              [userId]: Math.round(((Number(earnedFor[userId]) || 0) + bonus) * 1000) / 1000,
            },
          }
          await client.query(`UPDATE players SET data = $2 WHERE uid = $1`, [refBy, next])
        }
      }
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("[v0] logDeposit error:", e)
  } finally {
    client.release()
  }
}

export async function logCaseOpen(input: {
  userId: string
  username: string
  caseId: string
  caseName: string
  nftId: string
  nftName: string
  nftPrice: number
  kind: "paid" | "free" | "deposit"
  cost: number
}): Promise<void> {
  try {
    await ensureActivityTables()
    await query(
      `INSERT INTO case_open_log
         (user_id, username, case_id, case_name, nft_id, nft_name, nft_price, kind, cost, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.userId,
        input.username,
        input.caseId,
        input.caseName,
        input.nftId,
        input.nftName,
        Number(input.nftPrice) || 0,
        input.kind,
        Number(input.cost) || 0,
        Date.now(),
      ],
    )
  } catch (e) {
    console.error("[v0] logCaseOpen error:", e)
  }
}

export async function logUpgrade(input: {
  userId: string
  username: string
  stakeId: string
  stakeName: string
  stakePrice: number
  targetId: string
  targetName: string
  targetPrice: number
  chance: number
  win: boolean
}): Promise<void> {
  try {
    await ensureActivityTables()
    await query(
      `INSERT INTO upgrade_log
         (user_id, username, stake_id, stake_name, stake_price, target_id, target_name, target_price, chance, win, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.userId,
        input.username,
        input.stakeId,
        input.stakeName,
        Number(input.stakePrice) || 0,
        input.targetId,
        input.targetName,
        Number(input.targetPrice) || 0,
        Math.round(input.chance),
        input.win,
        Date.now(),
      ],
    )
  } catch (e) {
    console.error("[v0] logUpgrade error:", e)
  }
}

// --- Readers ---------------------------------------------------------------

export interface DepositEntry {
  id: string
  amount: number
  method: string
  createdAt: number
}

export interface CaseOpenEntry {
  id: string
  caseId: string
  caseName: string
  nftId: string
  nftName: string
  nftPrice: number
  kind: string
  cost: number
  createdAt: number
}

export async function getPlayerDeposits(userId: string, limit = 200): Promise<DepositEntry[]> {
  try {
    await ensureActivityTables()
    const rows = await query<any>(
      `SELECT id, amount, method, created_at FROM deposit_log
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    )
    return rows.map((r) => ({
      id: String(r.id),
      amount: Number(r.amount),
      method: r.method || "",
      createdAt: Number(r.created_at),
    }))
  } catch (e) {
    console.error("[v0] getPlayerDeposits error:", e)
    return []
  }
}

export async function getPlayerCaseOpens(userId: string, limit = 200): Promise<CaseOpenEntry[]> {
  try {
    await ensureActivityTables()
    const rows = await query<any>(
      `SELECT id, case_id, case_name, nft_id, nft_name, nft_price, kind, cost, created_at
       FROM case_open_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    )
    return rows.map((r) => ({
      id: String(r.id),
      caseId: r.case_id || "",
      caseName: r.case_name || "",
      nftId: r.nft_id || "",
      nftName: r.nft_name || "",
      nftPrice: Number(r.nft_price) || 0,
      kind: r.kind || "paid",
      cost: Number(r.cost) || 0,
      createdAt: Number(r.created_at),
    }))
  } catch (e) {
    console.error("[v0] getPlayerCaseOpens error:", e)
    return []
  }
}

export async function getPlayerTotalDeposited(userId: string): Promise<number> {
  try {
    await ensureActivityTables()
    const rows = await query<{ total: string | null }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM deposit_log WHERE user_id = $1`,
      [userId],
    )
    return Number(rows[0]?.total ?? 0)
  } catch (e) {
    console.error("[v0] getPlayerTotalDeposited error:", e)
    return 0
  }
}

export interface UpgradeEntry {
  id: string
  userId: string
  username: string
  stakeId: string
  stakeName: string
  stakePrice: number
  targetId: string
  targetName: string
  targetPrice: number
  chance: number
  win: boolean
  createdAt: number
}

export async function getUpgradeLogs(limit = 200): Promise<UpgradeEntry[]> {
  try {
    await ensureActivityTables()
    const rows = await query<any>(
      `SELECT id, user_id, username, stake_id, stake_name, stake_price,
              target_id, target_name, target_price, chance, win, created_at
       FROM upgrade_log ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      username: r.username || "",
      stakeId: r.stake_id || "",
      stakeName: r.stake_name || "",
      stakePrice: Number(r.stake_price) || 0,
      targetId: r.target_id || "",
      targetName: r.target_name || "",
      targetPrice: Number(r.target_price) || 0,
      chance: Number(r.chance) || 0,
      win: Boolean(r.win),
      createdAt: Number(r.created_at),
    }))
  } catch (e) {
    console.error("[v0] getUpgradeLogs error:", e)
    return []
  }
}

export async function getPlayerUpgrades(userId: string, limit = 200): Promise<UpgradeEntry[]> {
  try {
    await ensureActivityTables()
    const rows = await query<any>(
      `SELECT id, username, stake_id, stake_name, stake_price,
              target_id, target_name, target_price, chance, win, created_at
       FROM upgrade_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    )
    return rows.map((r) => ({
      id: String(r.id),
      userId,
      username: r.username || "",
      stakeId: r.stake_id || "",
      stakeName: r.stake_name || "",
      stakePrice: Number(r.stake_price) || 0,
      targetId: r.target_id || "",
      targetName: r.target_name || "",
      targetPrice: Number(r.target_price) || 0,
      chance: Number(r.chance) || 0,
      win: Boolean(r.win),
      createdAt: Number(r.created_at) || 0,
    }))
  } catch (e) {
    console.error("[v0] getPlayerUpgrades error:", e)
    return []
  }
}

// Leaderboard: top depositors within [startMs, endMs).
export interface DepositorRow {
  userId: string
  username: string
  photo: string
  total: number
}

export async function getTopDepositors(startMs: number, endMs: number, limit = 100): Promise<DepositorRow[]> {
  try {
    await ensureActivityTables()
    const useLimit = Number.isFinite(limit) && limit > 0
    // Join the shared players table so we always surface the canonical Telegram
    // profile photo + name, falling back to whatever was captured on the
    // deposit row if the player document is missing those fields.
    const rows = await query<any>(
      `SELECT d.user_id,
              COALESCE(NULLIF(p.data->>'nick', ''),
                       NULLIF(p.data->>'name', ''),
                       NULLIF(MAX(d.username), ''), 'Player') AS username,
              COALESCE(NULLIF(p.data->>'photo', ''),
                       NULLIF(MAX(d.photo), ''), '')          AS photo,
              SUM(d.amount)                                   AS total
       FROM deposit_log d
       LEFT JOIN players p ON p.uid::text = d.user_id
       WHERE d.created_at >= $1 AND d.created_at < $2
       GROUP BY d.user_id, p.data
       ORDER BY total DESC
       ${useLimit ? "LIMIT $3" : ""}`,
      useLimit ? [startMs, endMs, limit] : [startMs, endMs],
    )
    return rows.map((r) => ({
      userId: String(r.user_id),
      username: r.username || "Player",
      photo: r.photo || "",
      total: Number(r.total) || 0,
    }))
  } catch (e) {
    console.error("[v0] getTopDepositors error:", e)
    return []
  }
}
