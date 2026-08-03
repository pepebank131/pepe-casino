"use client"

// Client helper for talking to the persistence API.
// Attaches the Telegram WebApp initData so the server can verify the player.

// True only when launched inside Telegram with real, signed initData. Outside
// Telegram (v0 preview / local browser) the app runs in local demo mode and
// never touches the production database shared with the bot.
export function isTelegram(): boolean {
  if (typeof window === "undefined") return false
  const init = (window as any).Telegram?.WebApp?.initData
  return typeof init === "string" && init.length > 0
}

export function getInitData(): string {
  if (typeof window === "undefined") return ""
  return (window as any).Telegram?.WebApp?.initData || ""
}

export function getTgUser(): { id: string; username: string; photoUrl?: string } | null {
  if (typeof window === "undefined") return null
  const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user
  if (u) return { id: String(u.id), username: u.username || u.first_name || "Player", photoUrl: u.photo_url }
  return null
}

async function post(path: string, body: Record<string, any>) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": getInitData(),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `request failed: ${res.status}`)
  }
  return res.json()
}

export interface PlayerState {
  tgId: string
  username: string
  photoUrl: string | null
  ton: number
  freeCaseAt: number | null
  depositCaseAt: number | null
  depositedSinceOpen: number
  referralCaseAt?: number | null
  inventory: Array<{ uid: string; id: string; name: string; rarity: string; price: number; img: string }>
  referrals?: Array<{ id: string; name: string; avatarHue: number; wagered: number; photoUrl?: string | null }>
  refEarned?: number
}

export function loadPlayer(referredBy?: string): Promise<PlayerState> {
  return post("/api/player", { initData: getInitData(), referredBy })
}

export function syncPlayer(_snapshot?: {
  ton: number
  freeCaseAt: number | null
  depositCaseAt: number | null
  depositedSinceOpen: number
  referralCaseAt: number | null
  inventory: PlayerState["inventory"]
}): Promise<PlayerState> {
  // Balance/inventory writes were removed — sync only refreshes server state.
  return post("/api/sync", { initData: getInitData() })
}

export async function openCaseApi(input: {
  caseId: string
  kind?: "paid" | "free" | "deposit" | "referral" | "promo"
  promoToken?: string
}): Promise<{
  winner: { type: "ton"; amount: number } | { type: "nft"; nft: { id: string; name: string; rarity: string; price: number; img: string } }
  inventoryItem: { uid: string; id: string; name: string; rarity: string; price: number; img: string } | null
  ton: number
  freeCaseAt: number | null
  depositCaseAt: number | null
  depositedSinceOpen: number
  referralCaseAt: number | null
}> {
  return post("/api/cases/open", { initData: getInitData(), ...input })
}

export async function playUpgradeApi(stakeUid: string, targetId: string): Promise<{
  win: boolean
  chance: number
  ton: number
  resultItem?: { uid: string; id: string; name: string; rarity: string; price: number; img: string }
  stakeName: string
  targetName: string
}> {
  return post("/api/upgrade", { initData: getInitData(), stakeUid, targetId })
}

export async function playCoinFlipApi(
  amount: number,
  side: "pepe" | "ton",
): Promise<{ result: "pepe" | "ton"; win: boolean; payout: number; ton: number }> {
  return post("/api/coinflip", { initData: getInitData(), amount, side })
}

export async function sellInventoryApi(nftUid: string): Promise<{ ton: number; soldFor: number }> {
  return post("/api/inventory/sell", { initData: getInitData(), nftUid })
}

export async function confirmTonDeposit(input: {
  amount: number
  txHash?: string
  boc?: string
  fromAddress?: string
}): Promise<{ ton: number; amount: number }> {
  return post("/api/deposit/ton", { initData: getInitData(), ...input })
}

// ---- Activity logging (deposits + case openings) ----
// Fire-and-forget: persists real activity so the admin player-detail view and
// the season leaderboard reflect genuine data. Only meaningful inside Telegram
// (demo mode never touches the shared DB).
export function logDepositActivity(amount: number, method: "ton" | "stars" | "promo"): void {
  if (!isTelegram()) return
  post("/api/activity/log", { initData: getInitData(), type: "deposit", amount, method }).catch((e) =>
    console.error("[v0] logDepositActivity failed:", e),
  )
}

export function logCaseOpenActivity(input: {
  caseId: string
  caseName: string
  nftId: string
  nftName: string
  nftPrice: number
  kind: "paid" | "free" | "deposit"
  cost: number
}): void {
  if (!isTelegram()) return
  post("/api/activity/log", { initData: getInitData(), type: "case_open", ...input }).catch((e) =>
    console.error("[v0] logCaseOpenActivity failed:", e),
  )
}

// Public: current leaderboard season + top depositors.
export interface LeaderboardEntry {
  userId: string
  username: string
  photo: string
  total: number
}
export interface LeaderboardPayload {
  season: { index: number; startMs: number; endMs: number; endsInMs: number }
  prizes: Array<{ rank: number; nftId: string; name: string }>
  entries: LeaderboardEntry[]
}
export async function loadLeaderboard(): Promise<LeaderboardPayload> {
  const res = await fetch("/api/leaderboard", { cache: "no-store" })
  if (!res.ok) throw new Error(`failed to load leaderboard: ${res.status}`)
  return res.json()
}

// ---- Maintenance mode ----
// Public read: is the app currently in maintenance (admins-only) mode?
export async function loadMaintenance(): Promise<boolean> {
  try {
    const res = await fetch("/api/maintenance", { cache: "no-store" })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.on
  } catch {
    return false // fail open
  }
}

// Admin-only: toggle maintenance mode.
export async function saveMaintenance(on: boolean, adminId: string): Promise<boolean> {
  const data = await post("/api/maintenance", { initData: getInitData(), on, adminId })
  return !!data.on
}

// ---- Global RTP ----
export async function loadGlobalRtp(adminId?: string): Promise<number> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/rtp?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load RTP: ${res.status}`)
  const data = await res.json()
  return Number(data.rtp) || 97
}

export async function saveGlobalRtp(rtp: number, adminId: string): Promise<number> {
  const data = await post("/api/admin/rtp", { initData: getInitData(), rtp, adminId })
  return Number(data.rtp) || 97
}

// NFT withdrawal fee (Telegram Stars). Public read, admin-only write.
export async function loadWithdrawFee(adminId?: string): Promise<number> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/withdraw-fee?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load withdraw fee: ${res.status}`)
  const data = await res.json()
  return Number(data.fee) || 25
}

export async function saveWithdrawFee(fee: number, adminId: string): Promise<number> {
  const data = await post("/api/admin/withdraw-fee", { initData: getInitData(), fee, adminId })
  return Number(data.fee) || 25
}

// ---------------------------------------------------------------------------
// Admin panel — real data read live from the shared bot database.
// ---------------------------------------------------------------------------
export interface AdminPlayerRow {
  id: string
  username: string
  name: string
  ton: number
  nftCount: number
  refBy: string | null
  banned: boolean
  lastIp: string | null
}

export interface AdminPlayersResult {
  players: AdminPlayerRow[]
  stats: { total: number; banned: number; totalTon: number }
}

// Admin: list players (live balances/NFT counts) + aggregate stats.
export async function loadAdminPlayers(adminId?: string, search?: string): Promise<AdminPlayersResult> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  if (search) qs.set("search", search)
  const res = await fetch(`/api/admin/players?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load players: ${res.status}`)
  return res.json()
}

// Admin: ban / unban a player (writes the flag into the shared players table).
export async function setPlayerBan(uid: string, banned: boolean, adminId?: string): Promise<boolean> {
  const data = await post("/api/admin/players", { initData: getInitData(), uid, banned, adminId })
  return !!data.banned
}

// ---- Admin: full player profile ----
export interface AdminPlayerDetail {
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
  caseOpens: Array<{
    id: string
    caseId: string
    caseName: string
    nftId: string
    nftName: string
    nftPrice: number
    kind: string
    cost: number
    createdAt: number
  }>
  upgrades: Array<{
    id: string
    stakeId: string
    stakeName: string
    stakePrice: number
    targetId: string
    targetName: string
    targetPrice: number
    chance: number
    win: boolean
    createdAt: number
  }>
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

export async function loadPlayerDetail(uid: string, adminId?: string): Promise<AdminPlayerDetail> {
  const qs = new URLSearchParams({ uid })
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/player-detail?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load player: ${res.status}`)
  return res.json()
}

// Admin: set a player's balance to an exact value (writes the shared players table).
export async function setPlayerBalance(uid: string, ton: number, adminId?: string): Promise<number> {
  const data = await post("/api/admin/player-detail", { initData: getInitData(), uid, ton, adminId })
  return Number(data.ton)
}

// Admin: remove a single NFT from a player's inventory. Returns new NFT count.
export async function removePlayerNft(uid: string, nftUid: string, adminId?: string): Promise<number> {
  const res = await fetch("/api/admin/player-detail", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-telegram-init-data": getInitData() },
    body: JSON.stringify({ initData: getInitData(), uid, nftUid, adminId }),
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `request failed: ${res.status}`)
  }
  const data = await res.json()
  return Number(data.nftCount)
}

export interface AdminBetRow {
  id: string
  roundId: string
  userId: string
  username: string
  amount: number
  cashedAt: number | null
  won: number
  createdAt: number
}

export interface AdminMoneyResult {
  bets: AdminBetRow[]
  stats: { totalWagered: number; totalWon: number; houseProfit: number }
}

// Admin: real game money flow (rocket bets) + house stats.
export async function loadAdminMoney(adminId?: string): Promise<AdminMoneyResult> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/money?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load money: ${res.status}`)
  return res.json()
}

export interface AdminReferrerRow {
  id: string
  username: string
  invited: number
  earned: number
}

export interface AdminRefsResult {
  referrers: AdminReferrerRow[]
  stats: { totalInvited: number; activeReferrers: number; paidOut: number }
}

export interface AdminReferrerDetail {
  referrer: { id: string; username: string; earned: number }
  invited: Array<{ id: string; username: string; joinedAt: number | null; deposited: number }>
}

// Admin: real referral leaderboard + totals.
export async function loadAdminRefs(adminId?: string): Promise<AdminRefsResult> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/refs?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load refs: ${res.status}`)
  return res.json()
}

export async function loadAdminReferrerDetail(uid: string, adminId?: string): Promise<AdminReferrerDetail> {
  const qs = new URLSearchParams({ uid })
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/refs?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load referrer: ${res.status}`)
  return res.json()
}

export interface CaseConfigItem {
  id: string
  name: string
  price: number
  cover: string
  badge?: string
  model?: "paid" | "free" | "deposit" | "referral"
  cooldownMs?: number
  contents: Array<string | { type: "nft"; id: string; chance?: number } | { type: "ton"; amount: number; chance?: number }>
}

export interface CasesConfigPayload {
  cases: CaseConfigItem[]
  free: CaseConfigItem
  deposit: CaseConfigItem
  referral: CaseConfigItem
  promo: CaseConfigItem
}

// Public read of the active case configuration (used by the storefront).
export async function loadCases(): Promise<CasesConfigPayload> {
  const res = await fetch(`/api/cases?t=${Date.now()}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`failed to load cases: ${res.status}`)
  return res.json()
}

// Admin save of the case configuration.
export async function saveCases(payload: CasesConfigPayload & { adminId?: string }): Promise<CasesConfigPayload> {
  return post("/api/cases", { initData: getInitData(), ...payload })
}

export interface PromoCodeItem {
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

// Admin: list all promo codes.
export async function loadPromos(adminId?: string): Promise<PromoCodeItem[]> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/promos?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load promos: ${res.status}`)
  const data = await res.json()
  return data.promos || []
}

// Admin: save the full promo list.
export async function savePromos(promos: PromoCodeItem[], adminId?: string): Promise<PromoCodeItem[]> {
  const data = await post("/api/promos", { initData: getInitData(), promos, adminId })
  return data.promos || []
}

// Player: redeem a promo code.
export async function redeemPromo(code: string): Promise<{ ok: boolean; type?: "ton" | "percent" | "case"; reward?: number; bonusPercent?: number; caseId?: string; error?: string }> {
  const res = await fetch("/api/promos/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-init-data": getInitData() },
    body: JSON.stringify({ initData: getInitData(), code }),
  })
  return res.json().catch(() => ({ ok: false, error: "network" }))
}

export interface WithdrawalItem {
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

// Player: request a withdrawal after paying the Stars fee.
export async function requestWithdrawal(input: {
  nftUid: string
  nftId?: string
  nftName?: string
  nftImg?: string
  floorPrice?: number
}): Promise<WithdrawalItem> {
  const data = await post("/api/admin/withdrawals", { initData: getInitData(), action: "create", nftUid: input.nftUid })
  return data.withdrawal
}

// Player: list my own withdrawals (used to reconcile inventory after admin sends).
export async function loadMyWithdrawals(): Promise<WithdrawalItem[]> {
  const data = await post("/api/admin/withdrawals", { initData: getInitData(), action: "mine" })
  return data.withdrawals || []
}

// Admin: list all withdrawal requests.
export async function loadWithdrawals(adminId?: string): Promise<WithdrawalItem[]> {
  const qs = new URLSearchParams()
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/withdrawals?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load withdrawals: ${res.status}`)
  const data = await res.json()
  return data.withdrawals || []
}

// Admin: mark a withdrawal as sent (gift delivered).
export async function markWithdrawalSent(id: string, adminId?: string): Promise<WithdrawalItem> {
  const data = await post("/api/admin/withdrawals", { initData: getInitData(), action: "markSent", id, adminId })
  return data.withdrawal
}

// ---------------------------------------------------------------------------
// Rocket (crash) multiplayer — shared, server-authoritative state via polling.
// ---------------------------------------------------------------------------
export type RocketStatus = "waiting" | "flying" | "crashed"

export interface RocketBet {
  userId: string
  username: string
  photo: string
  amount: number
  cashedAt: number | null
  won: number | null
}

export interface RocketState {
  roundId: string
  status: RocketStatus
  multiplier: number
  msUntilNext: number
  startedAt: number | null
  serverNow: number
  crashPoint: number | null
  bets: RocketBet[]
  history: number[]
}

// Poll the shared round state. Lightweight GET, called ~every 500ms.
export async function fetchRocketState(): Promise<RocketState> {
  const res = await fetch("/api/rocket/state", { cache: "no-store" })
  if (!res.ok) throw new Error(`rocket state failed: ${res.status}`)
  return res.json()
}

// Place a bet on the current waiting round. Returns the updated shared state.
export async function placeRocketBet(amount: number): Promise<RocketState & { ton?: number }> {
  return post("/api/rocket/bet", { initData: getInitData(), amount })
}

// Cash out the caller's active bet. Returns winning multiplier + won TON.
export async function cashoutRocket(): Promise<{
  multiplier: number
  won: number
  nft?: { uid: string; id: string; name: string; rarity: string; price: number; img: string }
  state: RocketState
  ton?: number
}> {
  return post("/api/rocket/cashout", { initData: getInitData() })
}

// Creates a Telegram Stars invoice link via the bot, then opens it in the
// Telegram WebApp and resolves with the payment status:
//   "paid" | "cancelled" | "failed" | "pending"
// Only works inside Telegram (requires WebApp.openInvoice + signed initData).
export async function payWithStars(opts: {
  stars: number
  title: string
  description: string
  kind: "deposit" | "withdraw"
  /** Ignored by server — TON is derived from Stars server-side. Kept for UI compat. */
  ton?: number
  /** Required for withdrawals */
  nftId?: string
  nftUid?: string
}): Promise<"paid" | "cancelled" | "failed" | "pending"> {
  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null
  if (!tg?.openInvoice) throw new Error("Telegram Stars payment is only available inside Telegram")

  const data = await post("/api/create-invoice", { initData: getInitData(), ...opts })
  const link: string | undefined = data.link
  if (!link) throw new Error("failed to create invoice")

  return new Promise((resolve) => {
    let settled = false
    const done = (status: string) => {
      if (settled) return
      settled = true
      resolve((status as any) || "failed")
    }
    try {
      // Telegram invokes the callback with the final status. Across client
      // versions the status may arrive as the first OR second argument
      // (e.g. (status) or (url, status)), so pick the last string argument.
      tg.openInvoice(link, (...args: any[]) => {
        const status = [...args].reverse().find((a) => typeof a === "string")
        done(status || "failed")
      })
    } catch (e) {
      console.error("[v0] openInvoice threw:", e)
      done("failed")
    }
  })
}

// Admin: reset leaderboard season anchor to now
export async function resetSeason(adminId: string): Promise<{ season: { index: number; startMs: number; endMs: number; endsInMs: number } }> {
  return post("/api/admin/season", { initData: getInitData(), adminId })
}

// Admin: get current season info
export async function loadSeason(): Promise<{ index: number; startMs: number; endMs: number; endsInMs: number }> {
  const res = await fetch("/api/admin/season")
  if (!res.ok) throw new Error("failed to load season")
  const data = await res.json()
  return data.season
}

export interface LeaderboardOverride {
  rank: 1 | 2 | 3
  enabled: boolean
  username: string
  photo: string
  amount: number
}

export async function loadLeaderboardOverrides(adminId: string): Promise<LeaderboardOverride[]> {
  const qs = new URLSearchParams({ adminId })
  const res = await fetch(`/api/admin/leaderboard?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`failed to load leaderboard overrides: ${res.status}`)
  const data = await res.json()
  return data.overrides || []
}

export async function saveLeaderboardOverrides(
  overrides: LeaderboardOverride[],
  adminId: string,
): Promise<LeaderboardOverride[]> {
  const data = await post("/api/admin/leaderboard", { initData: getInitData(), overrides, adminId })
  return data.overrides || []
}

export async function resetLeaderboardOverrides(adminId: string): Promise<LeaderboardOverride[]> {
  const data = await post("/api/admin/leaderboard", { initData: getInitData(), action: "reset", adminId })
  return data.overrides || []
}

// Check whether the player is subscribed to the required gifts channel.
export async function checkChannelSubscription(): Promise<boolean> {
  try {
    const data = await post("/api/check-subscription", { initData: getInitData() })
    return !!data.subscribed
  } catch {
    return true // fail open
  }
}


// ---------------------------------------------------------------------------
// Upgrade logging
// ---------------------------------------------------------------------------
export async function logUpgrade(input: {
  stakeId: string; stakeName: string; stakePrice: number
  targetId: string; targetName: string; targetPrice: number
  chance: number; win: boolean
}): Promise<void> {
  try {
    await post("/api/upgrade", { initData: getInitData(), ...input })
  } catch (e) {
    console.error("[v0] logUpgrade failed:", e)
  }
}

export interface UpgradeLogEntry {
  id: string; userId: string; username: string
  stakeId: string; stakeName: string; stakePrice: number
  targetId: string; targetName: string; targetPrice: number
  chance: number; win: boolean; createdAt: number
}

export async function loadUpgradeLogs(adminId: string, limit = 200): Promise<UpgradeLogEntry[]> {
  const qs = new URLSearchParams({ adminId, limit: String(limit) })
  const res = await fetch(`/api/upgrade?${qs}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`upgrade logs: ${res.status}`)
  const data = await res.json()
  return data.logs ?? []
}

// ---------------------------------------------------------------------------
// Rocket Game Settings
// ---------------------------------------------------------------------------
export interface RocketSettings {
  houseEdge: number
  maxBet: number
  minBet: number
  maxMult: number
}

export async function loadRocketSettings(): Promise<RocketSettings> {
  const res = await fetch(`/api/admin/rocket-settings`, { cache: "no-store" })
  if (!res.ok) throw new Error(`rocket settings: ${res.status}`)
  return res.json()
}

export async function saveRocketSettingsApi(settings: RocketSettings & { adminId: string }): Promise<RocketSettings> {
  return post("/api/admin/rocket-settings", { initData: getInitData(), ...settings })
}

// ---------------------------------------------------------------------------
// Admin: IP search / duplicate-account detection
// ---------------------------------------------------------------------------
export interface IpPlayerRow {
  uid: string
  name: string
  photo: string
  balance: number
  lastIp: string | null
  ipHistory: string[]
}

export async function searchPlayersByIp(ip: string, adminId?: string): Promise<IpPlayerRow[]> {
  const qs = new URLSearchParams({ ip })
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/ip-search?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`ip search: ${res.status}`)
  const data = await res.json()
  return data.players || []
}

export interface IpDuplicateGroup {
  ip: string
  players: IpPlayerRow[]
}

export async function loadIpDuplicates(adminId?: string): Promise<IpDuplicateGroup[]> {
  const qs = new URLSearchParams({ mode: "duplicates" })
  if (adminId) qs.set("adminId", adminId)
  const res = await fetch(`/api/admin/ip-search?${qs.toString()}`, {
    cache: "no-store",
    headers: { "x-telegram-init-data": getInitData() },
  })
  if (!res.ok) throw new Error(`ip duplicates: ${res.status}`)
  const data = await res.json()
  return data.groups || []
}
