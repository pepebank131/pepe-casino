"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { type Nft, nftById } from "@/lib/casino-data"
import { loadPlayer, getTgUser, isTelegram, loadMyWithdrawals, type PlayerState } from "@/lib/api-client"

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
  freeCaseAt: number | null
  depositCaseAt: number | null
  depositedSinceOpen: number
  referralCaseAt: number | null
  /** Apply authoritative server economy fields after a mutation. */
  applyServerState: (partial: Partial<PlayerState> & { ton?: number; inventory?: PlayerState["inventory"] }) => void
  refreshFromServer: () => Promise<void>
  /** Demo-only local mutations (ignored persistence). In Telegram these are no longer authoritative. */
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
  setTon: (n: number) => void
  setInventory: (items: InventoryItem[]) => void
}

const Ctx = createContext<Store | null>(null)

let counter = 0
const uid = () => `inv_${Date.now()}_${counter++}`

function hydrateFromPlayer(
  p: PlayerState,
  setters: {
    setTon: (n: number) => void
    setFreeCaseAt: (n: number | null) => void
    setDepositCaseAt: (n: number | null) => void
    setDepositedSinceOpen: (n: number) => void
    setReferralCaseAt: (n: number | null) => void
    setInventory: (i: InventoryItem[]) => void
    setReferrals: (r: Referral[]) => void
    setServerRefEarned: (n: number) => void
    setTgId: (s: string) => void
    setUsername: (s: string) => void
    setPhotoUrl: (s: string | null) => void
  },
) {
  setters.setTon(p.ton)
  setters.setFreeCaseAt(p.freeCaseAt)
  setters.setDepositCaseAt(p.depositCaseAt ?? null)
  setters.setDepositedSinceOpen(p.depositedSinceOpen ?? 0)
  setters.setReferralCaseAt(p.referralCaseAt ?? null)
  setters.setInventory(p.inventory.map((i) => ({ ...i }) as InventoryItem))
  setters.setReferrals(Array.isArray(p.referrals) ? p.referrals : [])
  setters.setServerRefEarned(Number(p.refEarned ?? 0) || 0)
  setters.setTgId(p.tgId)
  if (p.username && p.username !== "Guest") setters.setUsername(p.username)
  if (p.photoUrl) setters.setPhotoUrl(p.photoUrl)
}

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

  const applyServerState = useCallback((partial: Partial<PlayerState> & { ton?: number; inventory?: PlayerState["inventory"] }) => {
    if (typeof partial.ton === "number" && Number.isFinite(partial.ton)) setTon(partial.ton)
    if (partial.freeCaseAt !== undefined) setFreeCaseAt(partial.freeCaseAt)
    if (partial.depositCaseAt !== undefined) setDepositCaseAt(partial.depositCaseAt)
    if (typeof partial.depositedSinceOpen === "number") setDepositedSinceOpen(partial.depositedSinceOpen)
    if (partial.referralCaseAt !== undefined) setReferralCaseAt(partial.referralCaseAt ?? null)
    if (Array.isArray(partial.inventory)) {
      setInventory(partial.inventory.map((i) => ({ ...i }) as InventoryItem))
    }
    if (Array.isArray(partial.referrals)) setReferrals(partial.referrals)
    if (typeof partial.refEarned === "number") setServerRefEarned(partial.refEarned)
  }, [])

  const refreshFromServer = useCallback(async () => {
    if (!isTelegram()) return
    const p = await loadPlayer()
    hydrateFromPlayer(p, {
      setTon,
      setFreeCaseAt,
      setDepositCaseAt,
      setDepositedSinceOpen,
      setReferralCaseAt,
      setInventory,
      setReferrals,
      setServerRefEarned,
      setTgId,
      setUsername,
      setPhotoUrl,
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!isTelegram()) {
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
    let referredBy: string | undefined
    if (typeof window !== "undefined") {
      const sp = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param
      if (sp && typeof sp === "string") referredBy = sp.startsWith("ref_") ? sp.slice(4) : sp
    }
    loadPlayer(referredBy)
      .then(async (p: PlayerState) => {
        if (cancelled) return
        hydrateFromPlayer(p, {
          setTon,
          setFreeCaseAt,
          setDepositCaseAt,
          setDepositedSinceOpen,
          setReferralCaseAt,
          setInventory,
          setReferrals,
          setServerRefEarned,
          setTgId,
          setUsername,
          setPhotoUrl,
        })
        setLoaded(true)
        try {
          const ws = await loadMyWithdrawals()
          if (cancelled || ws.length === 0) return
          const sent = new Set(ws.filter((w) => w.status === "sent").map((w) => w.nftUid))
          const pending = new Set(ws.filter((w) => w.status === "pending").map((w) => w.nftUid))
          setInventory((inv) =>
            inv
              .filter((i) => !sent.has(i.uid))
              .map((i) => (pending.has(i.uid) ? { ...i, withdrawing: true } : i)),
          )
        } catch (e) {
          console.error("[v0] failed to load withdrawals:", e)
        }
      })
      .catch((e) => {
        console.error("[v0] failed to load player:", e)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Local mutators are demo / optimistic UX only. Telegram economy is server-authoritative.
  const round3 = (x: number) => Math.round(x * 1000) / 1000
  const addTon = useCallback((n: number) => {
    if (isTelegram()) return // refuse silent local credits in production session
    setTon((t) => round3(t + n))
  }, [])
  const claimFreeCase = useCallback(() => {
    if (isTelegram()) return
    setFreeCaseAt(Date.now())
  }, [])
  const recordDeposit = useCallback((n: number) => {
    if (isTelegram()) return
    if (!Number.isFinite(n) || n <= 0) return
    setDepositedSinceOpen((d) => round3(d + n))
  }, [])
  const claimDepositCase = useCallback(() => {
    if (isTelegram()) return
    setDepositCaseAt(Date.now())
    setDepositedSinceOpen(0)
  }, [])
  const claimReferralCase = useCallback(() => {
    if (isTelegram()) return
    setReferralCaseAt(Date.now())
  }, [])
  const spendTon = useCallback(
    (n: number) => {
      if (!Number.isFinite(n) || n <= 0) return false
      if (isTelegram()) {
        // Optimistic UI only — server will reject if insufficient.
        if (ton < n) return false
        setTon((t) => round3(t - n))
        return true
      }
      if (ton < n) return false
      setTon((t) => round3(t - n))
      return true
    },
    [ton],
  )

  const addToInventory = useCallback((nftId: string) => {
    const item: InventoryItem = { ...nftById(nftId), uid: uid() }
    if (isTelegram()) return item // caller must use server result
    setInventory((inv) => [item, ...inv])
    return item
  }, [])

  const removeFromInventory = useCallback((u: string) => {
    setInventory((inv) => inv.filter((i) => i.uid !== u))
  }, [])

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
    applyServerState,
    refreshFromServer,
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
    setTon,
    setInventory,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
