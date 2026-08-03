import crypto from "crypto"
import { pool, query } from "@/lib/db"
import { getGlobalRtp } from "@/lib/rtp-store"
import { bestRocketNftForWinnings } from "@/lib/casino-data"

// ---------------------------------------------------------------------------
// Server-authoritative multiplayer state for the Rocket (crash) game.
//
// Serverless functions can't run a persistent setInterval, so the round is a
// deterministic state machine driven entirely by timestamps stored in the DB.
// Every request calls advanceGame(), which takes a row lock on the current
// round and transitions WAITING -> FLYING -> CRASHED -> (new WAITING) based on
// the current time. All clients poll /api/rocket/state and therefore observe
// the exact same multiplier, status, and shared bet list.
//
// The crash point is generated BEFORE the round starts and is never sent to
// clients until the round has actually crashed.
// ---------------------------------------------------------------------------

// Lives in dedicated tables, separate from the bot's players JSONB document.
let ensured = false
async function ensureTables() {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS rocket_round (
       id BIGSERIAL PRIMARY KEY,
       status TEXT NOT NULL DEFAULT 'waiting',
       crash_point NUMERIC NOT NULL DEFAULT 1,
       waiting_until BIGINT NOT NULL,
       started_at BIGINT,
       crashed_at BIGINT,
       created_at BIGINT NOT NULL
     )`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS rocket_bet (
       id BIGSERIAL PRIMARY KEY,
       round_id BIGINT NOT NULL,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL,
       photo TEXT NOT NULL DEFAULT '',
       amount NUMERIC NOT NULL,
       cashed_at NUMERIC,
       won NUMERIC,
       created_at BIGINT NOT NULL,
       UNIQUE (round_id, user_id)
     )`,
  )
  ensured = true
}

// Timings (ms). Cadence: WAITING 5s -> FLYING -> CRASHED -> 3s pause -> WAITING.
const WAITING_MS = 5000
const CRASHED_MS = 3000
// Multiplier growth: m = GROWTH^elapsedSeconds (matches the original client feel).
const GROWTH = 1.06

export type RocketStatus = "waiting" | "flying" | "crashed"

interface RoundRow {
  id: string
  status: RocketStatus
  crash_point: string | number
  waiting_until: string | number
  started_at: string | number | null
  crashed_at: string | number | null
  created_at: string | number
}

export interface RocketBet {
  userId: string
  username: string
  photo: string
  amount: number
  cashedAt: number | null // multiplier at cashout, null if still in / busted
  won: number | null
}

export interface RocketState {
  roundId: string
  status: RocketStatus
  multiplier: number
  // ms until the next phase transition (countdown in waiting, pause in crashed)
  msUntilNext: number
  startedAt: number | null
  serverNow: number
  // Only revealed once the round has crashed.
  crashPoint: number | null
  bets: RocketBet[]
  // Last crashed multipliers (newest first), loaded from the DB so the pills
  // survive reloads and tab switches. Excludes the current crashed round only
  // while it's still the active row (it's added once a new round opens).
  history: number[]
}

// Multiplier at a given elapsed time (ms) since flight start.
export function multiplierAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1
  return Math.pow(GROWTH, elapsedMs / 1000)
}

// Inverse: how long (ms) until the multiplier reaches `m`.
function msToReach(m: number): number {
  return (Math.log(m) / Math.log(GROWTH)) * 1000
}

import { getRocketSettings } from "@/lib/rocket-settings-store"

// Provably-fair crash point using admin-configured houseEdge + maxMult.
// Algorithm produces natural variety: ~houseEdge% bust at 1.00x, rest spread
// across 1.01x–maxMult with exponential distribution (skewed low but with
// occasional big multipliers).
async function genCrashPoint(): Promise<number> {
  const { houseEdge, maxMult } = await getRocketSettings()
  const edge = Math.max(0.01, Math.min(0.99, houseEdge / 100))
  const { secureRandom } = await import("@/lib/secure-random")

  const r = secureRandom()
  // Instant bust with probability = houseEdge
  if (r < edge) return 1.0

  // Map remaining probability to crash point with exponential distribution.
  // P(crash > x) = (1 - edge) / x  →  x = (1 - edge) / U  where U ~ Uniform(0, 1-edge)
  const u = secureRandom()
  const raw = (1 - edge) / Math.max(u, 0.001)
  const cp = Math.max(1.01, Math.round(raw * 100) / 100)
  // Apply maxMult cap
  return Math.min(maxMult, cp)
}

function toBet(r: any): RocketBet {
  return {
    userId: r.user_id,
    username: r.username,
    photo: r.photo || "",
    amount: Number(r.amount),
    cashedAt: r.cashed_at == null ? null : Number(r.cashed_at),
    won: r.won == null ? null : Number(r.won),
  }
}

// Advances the state machine atomically and returns the current round row id.
async function advanceGame(): Promise<RoundRow> {
  await ensureTables()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const now = Date.now()

    // Lock the most recent round (skip locked rows from concurrent pollers).
    const sel = await client.query(
      `SELECT * FROM rocket_round ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    )
    let round: RoundRow | undefined = sel.rows[0]

    // No round yet -> create the first WAITING round.
    if (!round) {
      const ins = await client.query(
        `INSERT INTO rocket_round (status, crash_point, waiting_until, created_at)
         VALUES ('waiting', 1, $1, $2) RETURNING *`,
        [now + WAITING_MS, now],
      )
      await client.query("COMMIT")
      return ins.rows[0]
    }

    // From here `round` is guaranteed defined.
    let cur: RoundRow = round

    if (cur.status === "waiting") {
      if (now >= Number(cur.waiting_until)) {
        // Start flying: lock in the (hidden) crash point now.
        const crash = await genCrashPoint()
        const upd = await client.query(
          `UPDATE rocket_round SET status = 'flying', crash_point = $2, started_at = $3
           WHERE id = $1 RETURNING *`,
          [cur.id, crash, now],
        )
        cur = upd.rows[0]
      }
    }

    if (cur.status === "flying") {
      const started = Number(cur.started_at)
      const crash = Number(cur.crash_point)
      const crashTime = started + msToReach(crash)
      if (now >= crashTime) {
        // Crash. Mark uncashed bets as busted (won = 0).
        const upd = await client.query(
          `UPDATE rocket_round SET status = 'crashed', crashed_at = $2 WHERE id = $1 RETURNING *`,
          [cur.id, now],
        )
        await client.query(
          `UPDATE rocket_bet SET won = 0 WHERE round_id = $1 AND cashed_at IS NULL`,
          [cur.id],
        )
        cur = upd.rows[0]
      }
    }

    if (cur.status === "crashed") {
      if (now >= Number(cur.crashed_at) + CRASHED_MS) {
        // Open a fresh WAITING round.
        const ins = await client.query(
          `INSERT INTO rocket_round (status, crash_point, waiting_until, created_at)
           VALUES ('waiting', 1, $1, $2) RETURNING *`,
          [now + WAITING_MS, now],
        )
        cur = ins.rows[0]
      }
    }

    await client.query("COMMIT")
    return cur
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

function publicState(round: RoundRow, bets: RocketBet[], history: number[] = []): RocketState {
  const now = Date.now()
  const status = round.status
  let multiplier = 1
  let msUntilNext = 0
  const startedAt = round.started_at == null ? null : Number(round.started_at)
  const crash = Number(round.crash_point)

  if (status === "waiting") {
    msUntilNext = Math.max(0, Number(round.waiting_until) - now)
  } else if (status === "flying") {
    const elapsed = now - (startedAt as number)
    multiplier = Math.min(crash, multiplierAt(elapsed))
    msUntilNext = Math.max(0, startedAt! + msToReach(crash) - now)
  } else {
    // crashed: freeze at the crash multiplier
    multiplier = crash
    msUntilNext = Math.max(0, Number(round.crashed_at) + CRASHED_MS - now)
  }

  return {
    roundId: String(round.id),
    status,
    multiplier: Math.round(multiplier * 100) / 100,
    msUntilNext,
    startedAt,
    serverNow: now,
    // Crash point stays hidden until the round actually crashes.
    crashPoint: status === "crashed" ? Math.round(crash * 100) / 100 : null,
    bets,
    history,
  }
}

// Last N crashed multipliers, newest first — persisted across reloads.
async function crashHistory(limit = 20): Promise<number[]> {
  const rows = await query(
    `SELECT crash_point FROM rocket_round
     WHERE status = 'crashed' OR crashed_at IS NOT NULL
     ORDER BY id DESC LIMIT $1`,
    [limit],
  )
  return rows.map((r: any) => Math.round(Number(r.crash_point) * 100) / 100)
}

async function betsForRound(roundId: string): Promise<RocketBet[]> {
  const rows = await query(`SELECT * FROM rocket_bet WHERE round_id = $1 ORDER BY created_at ASC`, [roundId])
  return rows.map(toBet)
}

// Public: current shared game state (advances the machine as a side effect).
export async function getRocketState(): Promise<RocketState> {
  const round = await advanceGame()
  const [bets, history] = await Promise.all([betsForRound(round.id), crashHistory()])
  return publicState(round, bets, history)
}

// Place a bet on the CURRENT round. Only valid while WAITING.
// Atomically debits the player's balance before inserting the bet.
export async function placeRocketBet(input: {
  userId: string
  username: string
  photo: string
  amount: number
}): Promise<{ ok: boolean; error?: string; state?: RocketState; ton?: number }> {
  const round = await advanceGame()
  if (round.status !== "waiting") {
    return { ok: false, error: "round_in_progress" }
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    // Re-lock the round row so we can't insert after it started flying.
    const rlock = await client.query(
      `SELECT id, status FROM rocket_round WHERE id = $1 FOR UPDATE`,
      [round.id],
    )
    if (!rlock.rows.length || rlock.rows[0].status !== "waiting") {
      await client.query("ROLLBACK")
      return { ok: false, error: "round_in_progress" }
    }
    const prow = await client.query(`SELECT data FROM players WHERE uid = $1 FOR UPDATE`, [input.userId])
    const data = prow.rows[0]?.data || {}
    if ((data as any).banned) {
      await client.query("ROLLBACK")
      return { ok: false, error: "banned" }
    }
    const bal = Number(data.balance) || 0
    if (bal < input.amount) {
      await client.query("ROLLBACK")
      return { ok: false, error: "insufficient_balance" }
    }
    const nextBal = Math.round((bal - input.amount) * 1000) / 1000
    await client.query(`UPDATE players SET data = $2 WHERE uid = $1`, [
      input.userId,
      { ...data, balance: nextBal },
    ])
    const ins = await client.query(
      `INSERT INTO rocket_bet (round_id, user_id, username, photo, amount, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (round_id, user_id) DO NOTHING
       RETURNING id`,
      [round.id, input.userId, input.username, input.photo, input.amount, Date.now()],
    )
    if (!ins.rows.length) {
      await client.query("ROLLBACK")
      return { ok: false, error: "already_bet" }
    }
    await client.query("COMMIT")
    const bets = await betsForRound(round.id)
    return { ok: true, state: publicState(round, bets, await crashHistory()), ton: nextBal }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("[v0] placeRocketBet error:", e)
    return { ok: false, error: "insert_failed" }
  } finally {
    client.release()
  }
}

// Cash out the caller's bet on the current round. Valid only while FLYING and
// before the crash. The winning multiplier is taken from the authoritative
// server time, not the client, so it can't be gamed.
export async function cashoutRocketBet(
  userId: string,
): Promise<{
  ok: boolean
  error?: string
  multiplier?: number
  won?: number
  state?: RocketState
  ton?: number
  nft?: { uid: string; id: string; name: string; rarity: string; price: number; img: string }
}> {
  const round = await advanceGame()
  if (round.status !== "flying") {
    return { ok: false, error: "not_flying" }
  }
  const started = Number(round.started_at)
  const crash = Number(round.crash_point)
  const now = Date.now()
  const liveMult = Math.min(crash, multiplierAt(now - started))
  if (liveMult >= crash) return { ok: false, error: "crashed" }
  const m = Math.round(liveMult * 100) / 100

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const betUpd = await client.query(
      `UPDATE rocket_bet SET cashed_at = $3, won = ROUND(amount * $3, 3)
       WHERE round_id = $1 AND user_id = $2 AND cashed_at IS NULL
       RETURNING *`,
      [round.id, userId, m],
    )
    if (!betUpd.rows.length) {
      await client.query("ROLLBACK")
      return { ok: false, error: "no_active_bet" }
    }
    const won = Number(betUpd.rows[0].won) || 0
    const prow = await client.query(`SELECT data FROM players WHERE uid = $1 FOR UPDATE`, [userId])
    const data = prow.rows[0]?.data || {}

    // Big enough win → award the matching NFT instead of TON (this is the
    // mechanic the UI promises: "Заберите при X+ TON, щоб виграти NFT").
    // Same threshold as the demo-mode simulation: multiplier >= 1.1 and the
    // TON amount reaches at least the cheapest catalog NFT's floor price.
    const wonNftCat = m >= 1.1 ? bestRocketNftForWinnings(won) : null
    let nextBal = Number(data.balance) || 0
    const nfts: any[] = Array.isArray(data.nfts) ? [...data.nfts] : []
    let awardedNft: { uid: string; id: string; name: string; rarity: string; price: number; img: string } | undefined

    if (wonNftCat) {
      const nftUid = `${wonNftCat.id}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
      nfts.unshift({
        id: wonNftCat.id,
        uid: nftUid,
        name: wonNftCat.name,
        price: wonNftCat.price,
        floor: wonNftCat.price,
        rarity: wonNftCat.rarity,
        ts: Date.now() / 1000,
      })
      awardedNft = {
        uid: nftUid,
        id: wonNftCat.id,
        name: wonNftCat.name,
        rarity: wonNftCat.rarity,
        price: wonNftCat.price,
        img: wonNftCat.img,
      }
      await client.query(`UPDATE players SET data = $2 WHERE uid = $1`, [userId, { ...data, nfts }])
    } else {
      nextBal = Math.round((nextBal + won) * 1000) / 1000
      await client.query(`UPDATE players SET data = $2 WHERE uid = $1`, [userId, { ...data, balance: nextBal }])
    }
    await client.query("COMMIT")

    const bet = toBet(betUpd.rows[0])
    const bets = await betsForRound(round.id)
    return {
      ok: true,
      multiplier: m,
      won: bet.won ?? 0,
      nft: awardedNft,
      state: publicState(round, bets, await crashHistory()),
      ton: nextBal,
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("[v0] cashoutRocketBet error:", e)
    return { ok: false, error: "cashout_failed" }
  } finally {
    client.release()
  }
}
