"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { type Nft, nftById } from "@/lib/casino-data"
import { loadPlayer, syncPlayer, getTgUser, isTelegram, loadMyWithdrawals, type PlayerState } from "@/lib/api-client"

export interface InventoryItem extends Nft {
  uid: string // unique instance id
  withdrawing?: boolean // true while a withdrawal request is pending admin delivery
}

export interface Referral {
  id: string
  name: string
  avatarHue: number
  wagered: number
  photoUrl?: string | null
}

interface Store {
  ton: number
  username: string
  tgId: string
  photoUrl: string | null
  loaded: boolean
  inventory: InventoryItem[]
  referrals: Referral[]
  refEarned: number
  refLink: string
  freeCaseAt: number | null // timestamp of last free case open
  depositCaseAt: number | null // timestamp of last deposit case open
  depositedSinceOpen: number // total TON deposited since last deposit case open
  referralCaseAt: number | null // timestamp of last referral case open
  addTon: (n: number) => void
  spendTon: (n: number) => boolean
  addToInventory: (nftId: string) => InventoryItem
  removeFromInventory: (uid: string) => void
  markWithdrawing: (uid: string) => void
  replaceInventory: (uid: string, newNftId: string) => InventoryItem | null
  claimFreeCase: () => void
  recordDeposit: (n: number) => void
  claimDepositCase: () => void
  claimReferralCase: () => void
}

const Ctx = createContext<Store | null>(null)

let counter = 0
const uid = () => `inv_${Date.now()}_${counter++}`

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ton, setTon] = useState(0)
  const [tgId, setTgId] = useState("")
  const [username, setUsername] = useState("Player")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [freeCaseAt, setFreeCaseAt] = useState<number | null>(null)
  const [depositCaseAt, setDepositCaseAt] = useState<number | null>(null)
  const [depositedSinceOpen, setDepositedSinceOpen] = useState(0)
  const [referralCaseAt, setReferralCaseAt] = useState<number | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [serverRefEarned, setServerRefEarned] = useState(0)
  const refEarned = serverRefEarned || referrals.reduce((s, r) => s + r.wagered * 0.1, 0)

  // Hydrate from the database on mount (server is the source of truth).
  // Inside Telegram we use the real signed session. Outside Telegram (v0
  // preview / plain browser) we run a local demo so the production database
  // shared with the bot is never touched by anonymous visitors.
  useEffect(() => {
    let cancelled = false

    if (!isTelegram()) {
      // Demo mode: give the preview a starting balance, no persistence.
      setUsername("Demo Player")
      setTgId("demo")
      setTon(25)
      setLoaded(true)
      return
    }

    const tgUser = getTgUser()
    if (tgUser) {
      setTgId(tgUser.id)
      setUsername(tgUser.username)
      if (tgUser.photoUrl) setPhotoUrl(tgUser.photoUrl)
    }
    // referral from Telegram start param
    let referredBy: string | undefined
    if (typeof window !== "undefined") {
      const sp = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param
      if (sp && typeof sp === "string") referredBy = sp.startsWith("ref_") ? sp.slice(4) : sp
    }
    loadPlayer(referredBy)
      .then((p: PlayerState) => {
        if (cancelled) return
        setTon(p.ton)
        setFreeCaseAt(p.freeCaseAt)
        setDepositCaseAt(p.depositCaseAt ?? null)
        setDepositedSinceOpen(p.depositedSinceOpen ?? 0)
        setReferralCaseAt((p as any).referralCaseAt ?? null)
        setInventory(p.inventory.map((i) => ({ ...i }) as InventoryItem))
        setReferrals(Array.isArray(p.referrals) ? p.referrals : [])
        setServerRefEarned(Number(p.refEarned ?? 0) || 0)
        setTgId(p.tgId)
        if (p.username && p.username !== "Guest") setUsername(p.username)
        if (p.photoUrl) setPhotoUrl(p.photoUrl)
        setLoaded(true)
        // Reconcile against the withdrawals table: items with a pending request
        // show "Withdrawing…"; items already sent by an admin are removed.
        loadMyWithdrawals()
          .then((ws) => {
            if (cancelled || ws.length === 0) return
            const sent = new Set(ws.filter((w) => w.status === "sent").map((w) => w.nftUid))
            const pending = new Set(ws.filter((w) => w.status === "pending").map((w) => w.nftUid))
            setInventory((inv) =>
              inv
                .filter((i) => !sent.has(i.uid))
                .map((i) => (pending.has(i.uid) ? { ...i, withdrawing: true } : i)),
            )
          })
          .catch((e) => console.error("[v0] failed to load withdrawals:", e))
      })
      .catch((e) => {
        console.error("[v0] failed to load player:", e)
        setLoaded(true) // still let the app render
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced persistence: whenever balance/inventory/freeCaseAt changes after
  // the initial load, push an authoritative snapshot to the server.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!loaded) return
    if (!isTelegram()) return // demo mode: never persist to the shared DB
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncPlayer({
        ton,
        freeCaseAt,
        depositCaseAt,
        depositedSinceOpen,
        referralCaseAt,
        inventory: inventory.map((i) => ({
          uid: i.uid,
          id: i.id,
          name: i.name,
          rarity: i.rarity,
          price: i.price,
          img: i.img,
        })),
      }).catch((e) => console.error("[v0] sync failed:", e))
    }, 600)
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [ton, freeCaseAt, depositCaseAt, depositedSinceOpen, referralCaseAt, inventory, loaded])

  // Round to 3 decimals to match the bot's balance precision (e.g. 38997.582)
  // and avoid floating-point drift / truncating real players' funds.
  const round3 = (x: number) => Math.round(x * 1000) / 1000
  const addTon = useCallback((n: number) => setTon((t) => round3(t + n)), [])
  const claimFreeCase = useCallback(() => setFreeCaseAt(Date.now()), [])
  // Track deposits toward the Deposit Case requirement.
  const recordDeposit = useCallback((n: number) => {
    if (!Number.isFinite(n) || n <= 0) return
    setDepositedSinceOpen((d) => round3(d + n))
  }, [])
  // Opening the Deposit Case starts the 6-day timer and resets the deposit gate.
  const claimDepositCase = useCallback(() => {
    setDepositCaseAt(Date.now())
    setDepositedSinceOpen(0)
  }, [])
  // Opening the Referral Case starts the cooldown timer.
  const claimReferralCase = useCallback(() => {
    setReferralCaseAt(Date.now())
  }, [])
  // Guard against the committed balance BEFORE deducting. We must read `ton`
  // directly and return synchronously — putting the check inside the setTon
  // updater is unreliable because the updater runs during commit (and twice in
  // StrictMode), so a side-effect flag isn't set yet when we return. That race
  // is what made the coin flip show "Not enough TON" yet still deduct the bet.
  const spendTon = useCallback(
    (n: number) => {
      if (!Number.isFinite(n) || n <= 0) return false
      if (ton < n) return false
      setTon((t) => round3(t - n))
      return true
    },
    [ton],
  )

  const addToInventory = useCallback((nftId: string) => {
    const item: InventoryItem = { ...nftById(nftId), uid: uid() }
    setInventory((inv) => [item, ...inv])
    return item
  }, [])

  const removeFromInventory = useCallback((u: string) => {
    setInventory((inv) => inv.filter((i) => i.uid !== u))
  }, [])

  // Flag an item as pending withdrawal. It stays in the inventory (so it can't
  // be used) until an admin marks the request as sent, then it's removed.
  const markWithdrawing = useCallback((u: string) => {
    setInventory((inv) => inv.map((i) => (i.uid === u ? { ...i, withdrawing: true } : i)))
  }, [])

  const replaceInventory = useCallback((u: string, newNftId: string) => {
    const item: InventoryItem = { ...nftById(newNftId), uid: uid() }
    let replaced = false
    setInventory((inv) => {
      const idx = inv.findIndex((i) => i.uid === u)
      if (idx === -1) return inv
      replaced = true
      const next = [...inv]
      next[idx] = item
      return next
    })
    return replaced ? item : null
  }, [])

  const value: Store = {
    ton,
    username,
    tgId,
    photoUrl,
    loaded,
    inventory,
    referrals,
    refEarned: Math.round(refEarned * 100) / 100,
    refLink: tgId ? `https://t.me/Pepe_GiftsBot?start=ref_${tgId}` : "",
    freeCaseAt,
    depositCaseAt,
    depositedSinceOpen,
    referralCaseAt,
    addTon,
    spendTon,
    addToInventory,
    removeFromInventory,
    markWithdrawing,
    replaceInventory,
    claimFreeCase,
    recordDeposit,
    claimDepositCase,
    claimReferralCase,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
