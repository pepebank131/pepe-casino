import crypto from "crypto"
import { pool, type BotNft, type PlayerData } from "@/lib/db"
import { nftById, rollCaseWithRng, HIDDEN_NFT_IDS, CATALOG, type CaseDef, type CaseRollResult } from "@/lib/casino-data"
import { getCasesConfig } from "@/lib/cases-store"
import { getGlobalRtp } from "@/lib/rtp-store"
import { FREE_CASE_COOLDOWN_MS, DEPOSIT_CASE_COOLDOWN_MS, DEPOSIT_CASE_REQUIRED_TON, REFERRAL_CASE_COOLDOWN_MS } from "@/lib/casino-data"
import { logCaseOpen, logUpgrade, logDeposit, ensureActivityTables } from "@/lib/activity-store"
import { secureRandom } from "@/lib/secure-random"
import type { TgUser } from "@/lib/telegram-auth"

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function newNftUid(nftId: string) {
  return `${nftId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
}

function toBotNft(nftId: string, uid?: string): BotNft {
  const cat = nftById(nftId)
  return {
    id: cat.id,
    uid: uid || newNftUid(cat.id),
    name: cat.name,
    price: cat.price,
    floor: cat.price,
    rarity: cat.rarity,
    ts: Date.now() / 1000,
  }
}

function freeCaseAtMs(data: PlayerData): number | null {
  const v = data.free_daily_last_open
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? Math.round(n * 1000) : n
}

function msField(data: PlayerData, key: string): number | null {
  const v = (data as any)[key]
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? Math.round(n * 1000) : n
}

async function lockPlayer(client: any, uid: string): Promise<PlayerData> {
  const cur = await client.query(`SELECT uid, data FROM players WHERE uid = $1 FOR UPDATE`, [uid])
  if (!cur.rows.length) {
    const fresh: PlayerData = { name: "Player", nick: "Player", balance: 0, nfts: [] }
    await client.query(`INSERT INTO players (uid, data) VALUES ($1, $2) ON CONFLICT (uid) DO NOTHING`, [uid, fresh])
    const again = await client.query(`SELECT uid, data FROM players WHERE uid = $1 FOR UPDATE`, [uid])
    return again.rows[0]?.data || fresh
  }
  return cur.rows[0].data || {}
}

async function savePlayer(client: any, uid: string, data: PlayerData) {
  await client.query(`UPDATE players SET data = $2 WHERE uid = $1`, [uid, data])
}

export async function creditBalance(
  uid: string,
  amount: number,
  meta?: {
    username?: string
    photo?: string
    method?: string
    logDeposit?: boolean
    /** Apply + clear pending_deposit_bonus_percent from player data. */
    applyDepositBonus?: boolean
  },
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, uid)
    if ((data as any).banned) {
      await client.query("ROLLBACK")
      throw new Error("banned")
    }
    let credit = amount
    let pendingPct = 0
    if (meta?.applyDepositBonus) {
      pendingPct = Math.max(0, Math.min(100, Number((data as any).pending_deposit_bonus_percent) || 0))
      if (pendingPct > 0) {
        credit = round3(amount + (amount * pendingPct) / 100)
      }
    }
    const nextBal = round3((Number(data.balance) || 0) + credit)
    const next: PlayerData = {
      ...data,
      balance: nextBal,
      deposited_since_open: round3((Number(data.deposited_since_open) || 0) + credit),
      ...(meta?.applyDepositBonus && pendingPct > 0 ? { pending_deposit_bonus_percent: 0 } : {}),
    }
    await savePlayer(client, uid, next)
    await client.query("COMMIT")
    if (meta?.logDeposit !== false) {
      await ensureActivityTables()
      await logDeposit({
        userId: uid,
        username: meta?.username || data.nick || data.name || "Player",
        photo: meta?.photo || data.photo || "",
        amount: credit,
        method: meta?.method || "",
      })
    }
    return nextBal
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Store a one-shot deposit bonus % after redeeming a percent promo. */
export async function setPendingDepositBonus(uid: string, percent: number): Promise<void> {
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, uid)
    await savePlayer(client, uid, { ...data, pending_deposit_bonus_percent: pct } as any)
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function debitBalance(uid: string, amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, uid)
    const bal = Number(data.balance) || 0
    if (bal < amount) {
      await client.query("ROLLBACK")
      throw new Error("insufficient_balance")
    }
    const nextBal = round3(bal - amount)
    await savePlayer(client, uid, { ...data, balance: nextBal })
    await client.query("COMMIT")
    return nextBal
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

function resolveCaseDef(cfg: Awaited<ReturnType<typeof getCasesConfig>>, caseId: string): CaseDef | null {
  if (caseId === cfg.free.id || caseId === "free-daily") return cfg.free
  if (caseId === cfg.deposit.id || caseId === "deposit") return cfg.deposit
  if (caseId === cfg.referral.id || caseId === "referral") return cfg.referral
  if (caseId === cfg.promo.id || caseId === "promo") return cfg.promo
  return cfg.cases.find((c) => c.id === caseId) || null
}

export type OpenCaseResult = {
  winner: CaseRollResult
  ton: number
  inventoryItem?: { uid: string; id: string; name: string; rarity: string; price: number; img: string }
  freeCaseAt: number | null
  depositCaseAt: number | null
  depositedSinceOpen: number
  referralCaseAt: number | null
}

export async function openCaseServer(
  user: TgUser,
  caseId: string,
  opts: { kind?: "paid" | "free" | "deposit" | "referral" | "promo"; promoToken?: string } = {},
): Promise<OpenCaseResult> {
  const cfg = await getCasesConfig()
  const caseDef = resolveCaseDef(cfg, caseId)
  if (!caseDef) throw new Error("case_not_found")

  // NEVER trust client `kind` — only case config / known special ids decide the model.
  // Otherwise attackers open paid cases as free/deposit.
  const id = caseDef.id || caseId
  const model: "paid" | "free" | "deposit" | "referral" | "promo" =
    caseDef.model ||
    (id === "free-daily"
      ? "free"
      : id === "deposit"
        ? "deposit"
        : id === "referral"
          ? "referral"
          : id === "promo"
            ? "promo"
            : "paid")
  void opts.kind // ignored for security
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, user.id)
    if ((data as any).banned) {
      await client.query("ROLLBACK")
      throw new Error("banned")
    }

    let bal = Number(data.balance) || 0
    const nfts: BotNft[] = Array.isArray(data.nfts) ? [...data.nfts] : []
    const now = Date.now()
    let freeCaseAt = freeCaseAtMs(data)
    let depositCaseAt = msField(data, "deposit_case_last_open")
    let depositedSinceOpen = Number(data.deposited_since_open ?? 0) || 0
    let referralCaseAt = msField(data, "referral_case_last_open")
    let cost = 0

    if (model === "paid") {
      cost = Number(caseDef.price) || 0
      if (cost <= 0 || bal < cost) {
        await client.query("ROLLBACK")
        throw new Error("insufficient_balance")
      }
      bal = round3(bal - cost)
    } else if (model === "free") {
      const cd = caseDef.cooldownMs || FREE_CASE_COOLDOWN_MS
      if (freeCaseAt != null && now - freeCaseAt < cd) {
        await client.query("ROLLBACK")
        throw new Error("cooldown")
      }
      freeCaseAt = now
    } else if (model === "deposit") {
      const cd = caseDef.cooldownMs || DEPOSIT_CASE_COOLDOWN_MS
      if (depositCaseAt != null && now - depositCaseAt < cd) {
        await client.query("ROLLBACK")
        throw new Error("cooldown")
      }
      if (depositedSinceOpen < DEPOSIT_CASE_REQUIRED_TON) {
        await client.query("ROLLBACK")
        throw new Error("deposit_required")
      }
      depositCaseAt = now
      depositedSinceOpen = 0
    } else if (model === "referral") {
      const cd = caseDef.cooldownMs || REFERRAL_CASE_COOLDOWN_MS
      if (referralCaseAt != null && now - referralCaseAt < cd) {
        await client.query("ROLLBACK")
        throw new Error("cooldown")
      }
      // Eligibility checked loosely: price treated as required referral deposit sum stored client-side historically.
      // Server recomputes from deposit_log of referred users when possible.
      const refDep = await client.query<{ s: string }>(
        `SELECT COALESCE(SUM(amount),0)::text AS s FROM deposit_log
         WHERE user_id IN (SELECT uid::text FROM players WHERE data->>'ref_by' = $1)`,
        [String(user.id)],
      )
      const total = Number(refDep.rows[0]?.s || 0)
      const need = Number(caseDef.price) || 1
      if (total < need) {
        await client.query("ROLLBACK")
        throw new Error("referral_required")
      }
      referralCaseAt = now
    } else if (model === "promo") {
      // One-shot promo opens are gated by a short-lived server token from redeem.
      const token = String(opts.promoToken || "")
      const pending = (data as any).promo_case_tokens
      if (!token || !Array.isArray(pending) || !pending.includes(token)) {
        await client.query("ROLLBACK")
        throw new Error("promo_required")
      }
      ;(data as any).promo_case_tokens = pending.filter((t: string) => t !== token)
    }

    const winner = rollCaseWithRng(caseDef.contents, secureRandom)
    let inventoryItem: OpenCaseResult["inventoryItem"]

    if (winner.type === "ton") {
      bal = round3(bal + winner.amount)
    } else {
      const bot = toBotNft(winner.nft.id)
      nfts.unshift(bot)
      inventoryItem = {
        uid: String(bot.uid),
        id: winner.nft.id,
        name: winner.nft.name,
        rarity: winner.nft.rarity,
        price: winner.nft.price,
        img: winner.nft.img,
      }
    }

    const next: PlayerData = {
      ...data,
      balance: bal,
      nfts,
      free_daily_last_open: freeCaseAt == null ? null : Math.round(freeCaseAt / 1000),
      deposit_case_last_open: depositCaseAt == null ? null : Math.round(depositCaseAt / 1000),
      deposited_since_open: depositedSinceOpen,
      referral_case_last_open: referralCaseAt == null ? null : Math.round(referralCaseAt / 1000),
    }
    await savePlayer(client, user.id, next)
    await client.query("COMMIT")

    await logCaseOpen({
      userId: user.id,
      username: user.username,
      caseId: caseDef.id,
      caseName: caseDef.name,
      nftId: winner.type === "nft" ? winner.nft.id : "ton",
      nftName: winner.type === "nft" ? winner.nft.name : `${winner.amount} TON`,
      nftPrice: winner.type === "nft" ? winner.nft.price : winner.amount,
      kind: model === "deposit" ? "deposit" : model === "free" || model === "referral" || model === "promo" ? "free" : "paid",
      cost,
    })

    return {
      winner,
      ton: bal,
      inventoryItem,
      freeCaseAt,
      depositCaseAt,
      depositedSinceOpen,
      referralCaseAt,
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Keep prize in inventory (NFT already added) or credit TON (already credited). Sell converts NFT → TON. */
export async function sellInventoryItem(user: TgUser, nftUid: string): Promise<{ ton: number; soldFor: number }> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, user.id)
    const nfts: BotNft[] = Array.isArray(data.nfts) ? [...data.nfts] : []
    const idx = nfts.findIndex((n) => String(n.uid) === String(nftUid))
    if (idx < 0) {
      await client.query("ROLLBACK")
      throw new Error("nft_not_found")
    }
    const item = nfts[idx]
    const cat = nftById(item.id)
    // Always use catalog floor — never trust stored JSONB price (forgeable).
    const soldFor = round3(cat.price)
    nfts.splice(idx, 1)
    const ton = round3((Number(data.balance) || 0) + soldFor)
    await savePlayer(client, user.id, { ...data, balance: ton, nfts })
    await client.query("COMMIT")
    return { ton, soldFor }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function playUpgradeServer(
  user: TgUser,
  stakeUid: string,
  targetId: string,
): Promise<{ win: boolean; chance: number; ton: number; resultItem?: { uid: string; id: string; name: string; rarity: string; price: number; img: string }; stakeName: string; targetName: string }> {
  if (HIDDEN_NFT_IDS.has(targetId)) throw new Error("invalid_target")
  const target = CATALOG.find((c) => c.id === targetId)
  if (!target) throw new Error("invalid_target")

  const rtp = Math.max(1, Math.min(99, Math.round(await getGlobalRtp())))
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, user.id)
    if ((data as any).banned) {
      await client.query("ROLLBACK")
      throw new Error("banned")
    }
    const nfts: BotNft[] = Array.isArray(data.nfts) ? [...data.nfts] : []
    const idx = nfts.findIndex((n) => String(n.uid) === String(stakeUid))
    if (idx < 0) {
      await client.query("ROLLBACK")
      throw new Error("stake_not_found")
    }
    const stake = nfts[idx]
    const stakeCat = nftById(stake.id)
    const stakePrice = round3(stakeCat.price)
    if (stakePrice < 0.1) {
      await client.query("ROLLBACK")
      throw new Error("stake_too_cheap")
    }
    if (target.price < stakePrice + 0.5) {
      await client.query("ROLLBACK")
      throw new Error("invalid_target")
    }

    const chance = Math.min(rtp, Math.max(1, Math.round((stakePrice / target.price) * rtp)))
    const win = secureRandom() * 100 < chance

    nfts.splice(idx, 1)
    let resultItem: { uid: string; id: string; name: string; rarity: string; price: number; img: string } | undefined
    if (win) {
      const bot = toBotNft(target.id)
      nfts.unshift(bot)
      resultItem = {
        uid: String(bot.uid),
        id: target.id,
        name: target.name,
        rarity: target.rarity,
        price: target.price,
        img: target.img,
      }
    }

    await savePlayer(client, user.id, { ...data, nfts })
    await client.query("COMMIT")

    await logUpgrade({
      userId: user.id,
      username: user.username,
      stakeId: stake.id,
      stakeName: stake.name || stakeCat.name,
      stakePrice,
      targetId: target.id,
      targetName: target.name,
      targetPrice: target.price,
      chance,
      win,
    })

    return {
      win,
      chance,
      ton: Number(data.balance) || 0,
      resultItem,
      stakeName: stake.name || stakeCat.name,
      targetName: target.name,
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Atomically lock NFT for withdrawal (remove from inventory + create pending request). */
export async function createWithdrawalSecure(input: {
  userId: string
  username: string
  nftUid: string
}): Promise<{
  id: string
  userId: string
  username: string
  nftUid: string
  nftId: string
  nftName: string
  nftImg: string
  floorPrice: number
  status: "pending"
  createdAt: number
  sentAt: null
}> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
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
    // Prevent duplicate pending withdrawals for same nft instance
    const existing = await client.query(
      `SELECT id FROM withdrawals WHERE user_id = $1 AND nft_uid = $2 AND status = 'pending' LIMIT 1`,
      [input.userId, input.nftUid],
    )
    if (existing.rows.length) {
      await client.query("ROLLBACK")
      throw new Error("already_pending")
    }

    const data = await lockPlayer(client, input.userId)
    const nfts: BotNft[] = Array.isArray(data.nfts) ? [...data.nfts] : []
    const idx = nfts.findIndex((n) => String(n.uid) === String(input.nftUid))
    if (idx < 0) {
      await client.query("ROLLBACK")
      throw new Error("nft_not_found")
    }
    const item = nfts[idx]
    const cat = nftById(item.id)
    nfts.splice(idx, 1)
    await savePlayer(client, input.userId, { ...data, nfts })

    const id = `wd_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
    const createdAt = Date.now()
    const floorPrice = cat.price
    await client.query(
      `INSERT INTO withdrawals (id, user_id, username, nft_uid, nft_id, nft_name, nft_img, floor_price, status, created_at, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NULL)`,
      [id, input.userId, input.username, input.nftUid, item.id, item.name || cat.name, cat.img || "", floorPrice, createdAt],
    )
    await client.query("COMMIT")
    return {
      id,
      userId: input.userId,
      username: input.username,
      nftUid: input.nftUid,
      nftId: item.id,
      nftName: item.name || cat.name,
      nftImg: cat.img || "",
      floorPrice,
      status: "pending",
      createdAt,
      sentAt: null,
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function issuePromoCaseToken(uid: string): Promise<string> {
  const token = crypto.randomBytes(16).toString("hex")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const data = await lockPlayer(client, uid)
    const tokens: string[] = Array.isArray((data as any).promo_case_tokens) ? [...(data as any).promo_case_tokens] : []
    tokens.push(token)
    await savePlayer(client, uid, { ...data, promo_case_tokens: tokens.slice(-5) } as any)
    await client.query("COMMIT")
    return token
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
