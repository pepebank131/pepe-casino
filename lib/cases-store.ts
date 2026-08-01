import { pool, query } from "@/lib/db"
import { CASES, FREE_CASE, DEPOSIT_CASE, REFERRAL_CASE, PROMO_CASE, normalizeCaseContents, nftById, type CaseDef } from "@/lib/casino-data"

// Global, app-owned configuration lives in a dedicated key/value table. This is
// SEPARATE from the bot's players table — it never touches per-player state, so
// the bot and Mini App stay in sync. We only add an isolated config table.
const CONFIG_KEY = "cases"

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

export interface CasesConfig {
  cases: CaseDef[]
  free: CaseDef
  deposit: CaseDef
  referral: CaseDef
  promo: CaseDef
}

export const DEFAULT_CASES_CONFIG: CasesConfig = {
  cases: CASES,
  free: FREE_CASE,
  deposit: DEPOSIT_CASE,
  referral: REFERRAL_CASE,
  promo: PROMO_CASE,
}

// Loads the saved case config, falling back to the bundled defaults when nothing
// has been customized yet (or when the DB is unreachable).
export async function getCasesConfig(): Promise<CasesConfig> {
  try {
    await ensureTable()
    const rows = await query<{ value: CasesConfig }>(`SELECT value FROM app_config WHERE key = $1`, [CONFIG_KEY])
    if (rows.length > 0 && rows[0].value?.cases) {
      return {
        cases: rows[0].value.cases,
        free: rows[0].value.free ?? FREE_CASE,
        deposit: rows[0].value.deposit ?? DEPOSIT_CASE,
        referral: rows[0].value.referral ?? REFERRAL_CASE,
        promo: (rows[0].value as any).promo ?? PROMO_CASE,
      }
    }
  } catch (e) {
    console.error("[v0] getCasesConfig error:", e)
  }
  return DEFAULT_CASES_CONFIG
}

function sanitizeCase(c: any): CaseDef | null {
  if (!c || typeof c.id !== "string" || !c.id.trim()) return null
  const model = ["paid", "free", "deposit", "referral", "promo"].includes(c.model) ? c.model : undefined
  let contents = normalizeCaseContents(Array.isArray(c.contents) ? c.contents : [])
  // Hard cap: free-like cases cannot be configured as near-guaranteed legendaries.
  const freeLike = model === "free" || model === "deposit" || model === "referral" || model === "promo" || c.id === "free-daily" || c.id === "deposit" || c.id === "referral" || c.id === "promo"
  if (freeLike && contents.length) {
    contents = contents.map((p) => {
      if (p.type === "ton") return { ...p, chance: Math.min(p.chance, 10_000) }
      const nft = nftById(p.id)
      // Cap chance for expensive gifts so EV can't be dumped via admin panel abuse.
      const maxChance = nft.price >= 40 ? 2 : nft.price >= 15 ? 8 : 100
      return { ...p, chance: Math.min(p.chance, maxChance) }
    })
  }
  return {
    id: String(c.id).trim(),
    name: String(c.name ?? "Untitled Case").slice(0, 60),
    price: Math.max(0, Number(c.price) || 0),
    cover: String(c.cover ?? "").slice(0, 500),
    badge: c.badge != null ? String(c.badge).slice(0, 40) : undefined,
    model,
    cooldownMs: c.cooldownMs != null ? Math.max(0, Number(c.cooldownMs) || 0) : undefined,
    contents,
  }
}

// Persists a full case config. Validates/sanitizes every field before writing.
export async function saveCasesConfig(input: { cases: any[]; free?: any; deposit?: any; referral?: any; promo?: any }): Promise<CasesConfig> {
  await ensureTable()
  // Load current config so we can preserve fields that weren't sent
  const current = await getCasesConfig()
  const cases = (Array.isArray(input.cases) ? input.cases : []).map(sanitizeCase).filter((c): c is CaseDef => c !== null)
  const free = input.free ? (sanitizeCase(input.free) ?? current.free) : current.free
  const deposit = input.deposit ? (sanitizeCase(input.deposit) ?? current.deposit) : current.deposit
  const referral = input.referral ? (sanitizeCase(input.referral) ?? current.referral) : current.referral
  const promo = input.promo ? (sanitizeCase(input.promo) ?? current.promo) : current.promo
  const value: CasesConfig = { cases, free, deposit, referral, promo }

  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, value],
    )
  } finally {
    client.release()
  }
  return value
}
