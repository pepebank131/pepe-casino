import { pool, query } from "@/lib/db"

// Promo codes are app-owned global config, stored in the shared app_config
// key/value table (same isolation guarantee as cases-store — never touches the
// bot's players table).
const CONFIG_KEY = "promos"

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

export interface PromoCode {
  code: string
  type: "ton" | "percent" | "case"
  reward: number
  bonusPercent: number
  caseId: string
  maxUses: number
  uses: number
  expiresAt: number | null
  active: boolean
  createdAt: number
  redeemedBy: string[]
}

export async function getPromos(): Promise<PromoCode[]> {
  try {
    await ensureTable()
    const rows = await query<{ value: { promos: PromoCode[] } }>(`SELECT value FROM app_config WHERE key = $1`, [CONFIG_KEY])
    if (rows.length > 0 && Array.isArray(rows[0].value?.promos)) return rows[0].value.promos
  } catch (e) {
    console.error("[v0] getPromos error:", e)
  }
  return []
}

async function writePromos(promos: PromoCode[]): Promise<PromoCode[]> {
  await ensureTable()
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CONFIG_KEY, { promos }],
  )
  return promos
}

function sanitize(p: any): PromoCode | null {
  if (!p || typeof p.code !== "string" || !p.code.trim()) return null
  const type: "ton" | "percent" | "case" = p.type === "percent" ? "percent" : p.type === "case" ? "case" : "ton"
  return {
    code: String(p.code).trim().toUpperCase().slice(0, 32),
    type,
    reward: type === "ton" ? Math.max(0, Math.min(10_000, Number(p.reward) || 0)) : 0,
    bonusPercent: type === "percent" ? Math.max(0, Math.min(100, Number(p.bonusPercent) || 0)) : 0,
    caseId: type === "case" ? String(p.caseId || "promo") : "",
    maxUses: Math.max(0, Math.floor(Number(p.maxUses) || 0)),
    uses: Math.max(0, Math.floor(Number(p.uses) || 0)),
    expiresAt: p.expiresAt == null ? null : Number(p.expiresAt),
    active: p.active !== false,
    createdAt: Number(p.createdAt) || Date.now(),
    redeemedBy: Array.isArray(p.redeemedBy) ? p.redeemedBy.map((x: any) => String(x)) : [],
  }
}

export async function savePromos(input: any[]): Promise<PromoCode[]> {
  const promos = (Array.isArray(input) ? input : []).map(sanitize).filter((p): p is PromoCode => p !== null)
  return writePromos(promos)
}

export interface RedeemResult {
  ok: boolean
  type?: "ton" | "percent" | "case"
  reward?: number
  bonusPercent?: number
  caseId?: string
  error?: string
}

/** Atomic redeem under advisory lock — prevents double-spend races. */
export async function redeemPromo(rawCode: string, tgId: string): Promise<RedeemResult> {
  const code = String(rawCode || "").trim().toUpperCase()
  if (!code) return { ok: false, error: "invalid" }

  const client = await pool.connect()
  try {
    await ensureTable()
    await client.query("BEGIN")
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`promo:${code}`])
    const rows = await client.query<{ value: { promos: PromoCode[] } }>(
      `SELECT value FROM app_config WHERE key = $1 FOR UPDATE`,
      [CONFIG_KEY],
    )
    const promos: PromoCode[] = rows.rows[0]?.value?.promos ? [...rows.rows[0].value.promos] : []
    const idx = promos.findIndex((p) => p.code === code)
    if (idx === -1) {
      await client.query("ROLLBACK")
      return { ok: false, error: "not_found" }
    }
    const p = promos[idx]
    if (!p.active) {
      await client.query("ROLLBACK")
      return { ok: false, error: "inactive" }
    }
    if (p.expiresAt != null && Date.now() > p.expiresAt) {
      await client.query("ROLLBACK")
      return { ok: false, error: "expired" }
    }
    if (p.maxUses > 0 && p.uses >= p.maxUses) {
      await client.query("ROLLBACK")
      return { ok: false, error: "depleted" }
    }
    if (p.redeemedBy.includes(String(tgId))) {
      await client.query("ROLLBACK")
      return { ok: false, error: "already" }
    }

    promos[idx] = { ...p, uses: p.uses + 1, redeemedBy: [...p.redeemedBy, String(tgId)] }
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, { promos }],
    )
    await client.query("COMMIT")

    if (p.type === "percent") return { ok: true, type: "percent", bonusPercent: p.bonusPercent }
    if (p.type === "case") return { ok: true, type: "case", caseId: p.caseId || "promo" }
    return { ok: true, type: "ton", reward: p.reward }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("[v0] redeemPromo error:", e)
    return { ok: false, error: "server" }
  } finally {
    client.release()
  }
}
