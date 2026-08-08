import { NextRequest } from "next/server"
import crypto from "crypto"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { creditBalance } from "@/lib/player-economy"
import { pool } from "@/lib/db"
import { TREASURY_ADDRESS } from "@/lib/treasury"
import { assertUserNotBanned, BannedError } from "@/lib/ban"

export const dynamic = "force-dynamic"

/**
 * Confirms a TON Connect deposit by matching a specific on-chain tx hash
 * (or boc hash) to a recent treasury inbound transfer, consuming that chain
 * tx so it cannot be claimed twice / by another user.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()
  try {
    await assertUserNotBanned(user)
  } catch (e) {
    if (e instanceof BannedError) return Response.json({ error: "banned" }, { status: 403 })
    throw e
  }

  const amount = Math.round((Number(body.amount) || 0) * 1000) / 1000
  const fromAddress = String(body.fromAddress || "").trim()
  if (!fromAddress) return Response.json({ error: "missing_wallet" }, { status: 400 })
  const boc = String(body.boc || "").trim()
  const txHashRaw = String(body.txHash || "").trim()
  if (!Number.isFinite(amount) || amount < 0.1) {
    return Response.json({ error: "invalid_amount" }, { status: 400 })
  }

  const clientKey = txHashRaw || (boc ? crypto.createHash("sha256").update(boc).digest("hex") : "")
  // clientKey is only a fallback dedupe key for the (rare) unverified-deposit
  // dev escape hatch below. The real match comes from the on-chain lookup in
  // findMatchingTreasuryTx (amount + fromAddress), which needs neither boc nor
  // txHash — so a hung TonConnect bridge (wallet paid, confirm() never fired
  // with a boc) can still be manually confirmed with just amount+fromAddress.

  const verified = await findMatchingTreasuryTx(amount, fromAddress)
  if (!verified.ok || !verified.chainTxHash) {
    const devUnverified = process.env.ALLOW_UNVERIFIED_TON_DEPOSITS === "1" && process.env.NODE_ENV !== "production"
    if (!devUnverified) {
      return Response.json({ error: verified.error || "verify_failed" }, { status: 400 })
    }
    if (!clientKey) return Response.json({ error: "missing_tx" }, { status: 400 })
  }

  // Prefer the real chain hash so two users can't claim the same inbound transfer
  // with different client-side boc hashes.
  const txKey = verified.chainTxHash || clientKey

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `CREATE TABLE IF NOT EXISTS ton_deposit_credits (
         tx_hash TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         amount NUMERIC NOT NULL,
         created_at BIGINT NOT NULL
       )`,
    )
    const dupe = await client.query(`SELECT 1 FROM ton_deposit_credits WHERE tx_hash = $1 FOR UPDATE`, [txKey])
    if (dupe.rows.length) {
      await client.query("ROLLBACK")
      return Response.json({ error: "already_credited" }, { status: 409 })
    }
    await client.query(
      `INSERT INTO ton_deposit_credits (tx_hash, user_id, amount, created_at) VALUES ($1,$2,$3,$4)`,
      [txKey, user.id, amount, Date.now()],
    )

    // Credit runs inside this same transaction (via externalClient) so the
    // dedupe lock above and the balance credit either both commit or both
    // roll back — a mid-way failure can no longer "eat" a deposit.
    const ton = await creditBalance(
      user.id,
      amount,
      { username: user.username, photo: user.photoUrl, method: "ton", applyDepositBonus: true },
      client,
    )
    await client.query("COMMIT")
    return Response.json({ ton, amount })
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {})
    if (String(e?.code) === "23505") {
      return Response.json({ error: "already_credited" }, { status: 409 })
    }
    console.error("[v0] ton deposit credit error:", e)
    return Response.json({ error: "credit_failed" }, { status: 500 })
  } finally {
    client.release()
  }
}

function normAddr(a: string) {
  return a.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()
}

async function findMatchingTreasuryTx(
  amount: number,
  fromAddress: string,
): Promise<{ ok: boolean; error?: string; chainTxHash?: string }> {
  const treasury = TREASURY_ADDRESS
  if (!treasury) return { ok: false, error: "treasury_not_configured" }
  const fromNorm = normAddr(fromAddress)
  if (fromNorm.length < 10) return { ok: false, error: "bad_wallet" }

  try {
    const nano = Math.round(amount * 1e9)
    const url = `https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(treasury)}/transactions?limit=40`
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
    if (!res.ok) return { ok: false, error: "tx_lookup_failed" }
    const data = await res.json()
    const txs = Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : []
    const nowSec = Math.floor(Date.now() / 1000)

    const candidates: string[] = []
    for (const tx of txs) {
      const utime = Number(tx?.utime || tx?.now || 0)
      if (utime && nowSec - utime > 15 * 60) continue
      const inMsg = tx?.in_msg || tx?.inMsg
      const val = Number(inMsg?.value || 0)
      if (Math.abs(val - nano) > Math.max(1e6, nano * 0.02)) continue
      const src = normAddr(String(inMsg?.source?.address || inMsg?.source || tx?.account?.address || ""))
      // Require sender match when tonapi exposes it (prevents claim-stealing).
      if (src && src.length >= 10 && !src.includes(fromNorm.slice(0, 12)) && !fromNorm.includes(src.slice(0, 12))) {
        continue
      }
      const hash = String(tx?.hash || tx?.transaction_id?.hash || "")
      if (hash) candidates.push(hash)
    }
    if (!candidates.length) return { ok: false, error: "matching_tx_not_found" }

    const existing = await pool
      .query(`SELECT tx_hash FROM ton_deposit_credits WHERE tx_hash = ANY($1::text[])`, [candidates])
      .catch(() => ({ rows: [] as { tx_hash: string }[] }))
    const used = new Set(existing.rows.map((r) => r.tx_hash))
    const free = candidates.find((h) => !used.has(h))
    if (!free) return { ok: false, error: "already_credited" }
    return { ok: true, chainTxHash: free }
  } catch (e) {
    console.error("[v0] tonapi verify error:", e)
    return { ok: false, error: "verify_failed" }
  }
}
